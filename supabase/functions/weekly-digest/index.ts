// Weekly digest — emails every opted-in user the classes and events coming
// up in the next 7 days. Schedule it for Monday mornings (see README.md).
//
// Secrets required:
//   supabase secrets set RESEND_API_KEY=re_... FROM_EMAIL="Toucan Music <hello@toucanmusic.org>" SITE_URL=https://toucan-music.com

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service role: bypasses RLS
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("FROM_EMAIL") ?? "Toucan Music <onboarding@resend.dev>";
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

Deno.serve(async () => {
  if (!RESEND_KEY) {
    return new Response(
      JSON.stringify({ sent: 0, error: "RESEND_API_KEY secret is not set." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", weekOut.toISOString())
    .order("starts_at");
  if (evErr) return new Response(evErr.message, { status: 500 });

  if (!events?.length) {
    return new Response(JSON.stringify({ sent: 0, note: "no events this week" }));
  }

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, weekly_digest")
    .eq("weekly_digest", true);
  if (pErr) return new Response(pErr.message, { status: 500 });

  // Emails live in auth.users; fetch them via the admin API.
  const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(userList.users.map((u) => [u.id, u.email]));

  const rows = events
    .map((ev) => {
      const when = new Date(ev.starts_at).toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e9f1ef"><strong>${ev.title}</strong><br>
          <span style="color:#46595e">${when}${ev.location ? " · " + ev.location : ""}</span></td>
      </tr>`;
    })
    .join("");

  const html = (name: string) => `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#16282d;max-width:560px">
      <h2 style="margin-bottom:4px">This week at Toucan Music</h2>
      <p style="color:#46595e">Hi ${name} — here's what's coming up in the next seven days.</p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      <p style="color:#46595e;font-size:13px;margin-top:20px">
        You're getting this because weekly emails are on in your
        <a href="${SITE_URL}/?settings=open">settings</a>.
      </p>
    </div>`;

  let sent = 0;
  const failures: { email: string; error: string }[] = [];
  for (const p of profiles ?? []) {
    const email = emailById.get(p.id);
    if (!email) continue;
    const result = await sendEmail(
      email,
      "Your Toucan week: upcoming classes & events",
      html(p.full_name)
    );
    if (result.ok) sent++;
    else failures.push({ email, error: result.error! });
  }

  return new Response(
    JSON.stringify({ sent, failed: failures.length, failures, events: events.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});
