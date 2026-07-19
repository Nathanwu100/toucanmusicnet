// Event reminders - run every 5 minutes (see README.md). For each upcoming
// class/event, opted-in users receive email and/or text nudges at 60 and 30
// minutes before start. Each delivery channel is deduplicated independently.
//
// Email secrets: RESEND_API_KEY, FROM_EMAIL (same as weekly-digest).
// Text secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
// Site link: SITE_URL (defaults to https://toucan-music.com).

import { createClient } from "npm:@supabase/supabase-js@2";

const OFFSETS_MINUTES = [60, 30];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("FROM_EMAIL") ?? "Toucan Music <onboarding@resend.dev>";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://toucan-music.com").replace(/\/+$/, "");

// Returns { ok, error } instead of swallowing failures — callers must not
// count a message as sent unless Resend actually accepted it.
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error for", to, body);
    return { ok: false, error: body };
  }
  return { ok: true };
}

async function sendSms(to: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { ok: false, error: "Twilio secrets are not configured." };
  }
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
    }
  );
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

Deno.serve(async () => {
  const now = Date.now();
  const maxOffset = Math.max(...OFFSETS_MINUTES);

  // Everything starting within the largest window.
  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + maxOffset * 60_000).toISOString());
  if (evErr) return new Response(evErr.message, { status: 500 });
  if (!events?.length) return new Response(JSON.stringify({ sent: 0 }));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, instrument, class_reminders, text_notifications, phone_number")
    .or("class_reminders.eq.true,text_notifications.eq.true");

  const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(userList.users.map((u) => [u.id, u.email]));

  let sent = 0;
  const failures: { channel: string; user_id: string; error: string }[] = [];
  for (const ev of events) {
    const minsUntil = (new Date(ev.starts_at).getTime() - now) / 60_000;
    // The offset this event currently qualifies for (largest first).
    const offset = OFFSETS_MINUTES.find((o) => minsUntil <= o);
    if (offset === undefined) continue;

    const when = new Date(ev.starts_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    for (const p of profiles ?? []) {
      if (p.role === "student" && (!p.instrument || p.instrument !== ev.instrument)) continue;
      const email = emailById.get(p.id);

      async function deliver(channel: "email" | "sms", send: () => Promise<{ ok: boolean; error?: string }>) {
        const { error: dupErr } = await supabase.from("reminders_sent").insert({
          event_id: ev.id,
          user_id: p.id,
          offset_minutes: offset,
          channel,
        });
        if (dupErr) return;
        const result = await send();
        if (result.ok) {
          sent++;
          return;
        }
        failures.push({ channel, user_id: p.id, error: result.error ?? "Delivery failed." });
        await supabase.from("reminders_sent").delete().match({
          event_id: ev.id,
          user_id: p.id,
          offset_minutes: offset,
          channel,
        });
      }

      if (p.class_reminders && email && RESEND_KEY) {
        await deliver("email", () => sendEmail(
          email,
          `Starting soon: ${ev.title} at ${when}`,
          `<div style="font-family:Helvetica,Arial,sans-serif;color:#16282d;max-width:560px">
            <h2 style="margin-bottom:4px">${ev.title} starts in about ${Math.round(minsUntil)} minutes</h2>
            <p style="color:#46595e">${when}${ev.location ? " - " + ev.location : ""}</p>
            ${ev.description ? `<p>${ev.description}</p>` : ""}
            <p style="color:#46595e;font-size:13px;margin-top:20px">
              Reminders can be changed in your
              <a href="${SITE_URL}/?settings=open">settings</a>.
            </p>
          </div>`
        ));
      }

      if (p.text_notifications && p.phone_number) {
        await deliver("sms", () => sendSms(
          p.phone_number,
          `Toucan Music: ${ev.title} starts at ${when}${ev.location ? ` at ${ev.location}` : ""}.`
        ));
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed: failures.length, failures }), {
    headers: { "Content-Type": "application/json" },
  });
});
