// Page script for diagnostics.html.
//
// Lifted out of the page so the Content-Security-Policy in _headers can
// refuse inline script entirely. A module, because it was one inline and
// still has to run after the deferred scripts it depends on.

const host = document.getElementById("checks");
const summary = document.getElementById("summary");
const results = [];

function report(name, state, detail, fix) {
  results.push(state);
  const row = document.createElement("div");
  row.className = `diag-row diag-${state}`;
  row.innerHTML = `
    <span class="diag-state">${state === "ok" ? "PASS" : state === "warn" ? "WARN" : "FAIL"}</span>
    <span class="diag-body">
      <strong></strong>
      <span class="diag-detail"></span>
      ${fix ? '<span class="diag-fix"></span>' : ""}
    </span>`;
  row.querySelector("strong").textContent = name;
  row.querySelector(".diag-detail").textContent = detail;
  if (fix) row.querySelector(".diag-fix").textContent = fix;
  host.appendChild(row);
}

const cfg = window.TOUCAN_CONFIG || {};
const api = window.ToucanAPI;

// 1. Config
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
  report("Configuration", "fail", "js/config.js has no Supabase project URL.",
    "Fill in SUPABASE_URL and SUPABASE_ANON_KEY.");
} else {
  report("Configuration", "ok", `Project ${new URL(cfg.SUPABASE_URL).hostname}`);
}

// 2. Did the Supabase client script actually arrive?
if (window.supabase) {
  report("Supabase client script", "ok", "Loaded from the CDN.");
} else {
  report("Supabase client script", "fail",
    "window.supabase is undefined, so the app fell back to browser-local data.",
    "The CDN request was blocked or failed. Everything below will look broken until this loads.");
}

// 3. Which mode is the app actually running in?
if (!api) {
  report("Data layer", "fail", "js/api.js did not initialise.");
} else if (api.misconfigured) {
  report("Data layer", "fail",
    "Running on browser-local data even though a project is configured.",
    "Accounts created here never reach the server and no email is sent.");
} else if (api.demoMode) {
  report("Data layer", "warn",
    `Demo mode (${api.demoReason}). Data lives in this browser only.`,
    api.demoReason === "localhost" ? "This is expected on localhost." : "");
} else {
  report("Data layer", "ok", "Talking to Supabase.");
}

// 4. Is the project reachable, and does the schema exist?
if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
  const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/instruments?select=slug&limit=1`, { headers });
    if (res.ok) {
      const rows = await res.json();
      report("Database", "ok", `Reachable, and the instruments table has ${rows.length ? "rows" : "no rows"}.`);
    } else if (res.status === 401 || res.status === 403) {
      report("Database", "fail", `Rejected the anon key (HTTP ${res.status}).`,
        "Check SUPABASE_ANON_KEY matches this project.");
    } else if (res.status === 404) {
      report("Database", "fail", "The instruments table does not exist (HTTP 404).",
        "The schema has not been applied. Run supabase/schema.sql.");
    } else {
      report("Database", "fail", `Unexpected response (HTTP ${res.status}).`);
    }
  } catch (error) {
    report("Database", "fail", `Could not reach the project: ${error.message}`);
  }

  // 5. Auth settings -- this is where signup silently dies.
  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/auth/v1/settings`, { headers });
    const settings = await res.json();
    if (settings.disable_signup) {
      report("Sign-ups", "fail", "Sign-ups are disabled for this project.",
        "Turn them on in Authentication > Sign In / Providers.");
    } else {
      report("Sign-ups", "ok", "Enabled.");
    }
    if (settings.mailer_autoconfirm) {
      report("Email confirmation", "ok",
        "Off. New accounts can log in immediately.");
    } else {
      report("Email confirmation", "warn",
        "Required. A new account cannot log in until it clicks a link in an email.",
        "If those emails are not arriving, nobody can finish signing up. Either configure SMTP in Authentication > Emails, or switch Confirm email off while testing.");
    }
  } catch (error) {
    report("Auth settings", "fail", `Could not read them: ${error.message}`);
  }
}

// 6. Who does this browser think it is?
try {
  const user = api ? await api.getSession() : null;
  if (user) {
    report("Current session", "ok",
      `Signed in as ${user.name} (${user.email || "no email"}), role ${user.role}.`,
      "If that is not who you expected, log out -- a saved session outlives the login form.");
  } else {
    report("Current session", "ok", "Signed out.");
  }
} catch (error) {
  report("Current session", "fail", error.message);
}

const failed = results.filter((r) => r === "fail").length;
const warned = results.filter((r) => r === "warn").length;
summary.textContent = failed
  ? `${failed} check${failed === 1 ? "" : "s"} failed. Start with the first FAIL above.`
  : warned
    ? `Everything reachable, but ${warned} thing${warned === 1 ? " needs" : "s need"} attention.`
    : "All checks passed.";
summary.className = "diag-summary " + (failed ? "diag-fail" : warned ? "diag-warn" : "diag-ok");
