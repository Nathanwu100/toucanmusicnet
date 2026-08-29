const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// A Supabase stub narrow enough to drive one auth call at a time. The real
// client is never reachable from a test, and these responses are the shapes
// the live project actually returns -- the duplicate-signup decoy in
// particular was captured from it.
function apiWith({ signUp, signIn, resend } = {}) {
  const instruments = { data: [{ slug: "piano", name: "Piano", sort_order: 10, active: true }], error: null };
  const window = {
    TOUCAN_CONFIG: {
      SUPABASE_URL: "https://p.supabase.co", SUPABASE_ANON_KEY: "k",
      ADMIN_NAME: "admin", ADMIN_EMAIL: "admin@toucanmusic.org", PUBLIC_SITE_URL: "https://s",
    },
    location: { hostname: "toucan-music.com", origin: "https://toucan-music.com" },
    supabase: {
      createClient: () => ({
        auth: {
          signUp: async () => signUp,
          signInWithPassword: async () => signIn,
          getSession: async () => ({ data: { session: null } }),
          resend: async () => resend || { error: null },
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "1", full_name: "X", role: "volunteer" }, error: null }),
              order: async () => instruments,
            }),
            order: async () => instruments,
          }),
        }),
        rpc: async () => ({ data: [], error: null }),
      }),
    },
  };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/api.js"), "utf8"),
    vm.createContext({ window, localStorage: storage, URL, Date, Math, JSON, console, setTimeout, clearTimeout }),
    { filename: "js/api.js" });
  return window.ToucanAPI;
}

const NEW_ACCOUNT = { name: "N", email: "e@x.com", password: "p", role: "volunteer" };

test("signing up with an address that already exists is reported, not faked", async () => {
  // Supabase will not error here: erroring would let anyone probe which
  // addresses have accounts. It returns a decoy user with no identities and
  // a confirmation_sent_at for an email it never sent. Believing that field
  // is what told people to check an inbox that would stay empty.
  const api = apiWith({
    signUp: {
      data: { user: { id: "decoy", identities: [], confirmation_sent_at: "2026-01-01T00:00:00Z" }, session: null },
      error: null,
    },
  });
  await assert.rejects(api.signup(NEW_ACCOUNT), (error) => {
    assert.equal(error.code, "email_exists");
    assert.match(error.message, /already uses that email/i);
    return true;
  });
});

test("a genuinely new account reports whether the email actually left", async () => {
  const mailed = apiWith({
    signUp: {
      data: { user: { id: "new", identities: [{ id: "i" }], confirmation_sent_at: "2026-01-01T00:00:00Z" }, session: null },
      error: null,
    },
  });
  const sent = await mailed.signup(NEW_ACCOUNT);
  assert.equal(sent.needs_verification, true);
  assert.equal(sent.confirmation_sent, true);

  const silent = apiWith({
    signUp: {
      data: { user: { id: "new", identities: [{ id: "i" }], confirmation_sent_at: null }, session: null },
      error: null,
    },
  });
  const unsent = await silent.signup(NEW_ACCOUNT);
  assert.equal(unsent.needs_verification, true);
  assert.equal(unsent.confirmation_sent, false, "an unsent mail must not claim to have been sent");
});

test("with confirmation switched off the account is usable immediately", async () => {
  const api = apiWith({
    signUp: { data: { user: { id: "n", identities: [{ id: "i" }] }, session: { access_token: "t" } }, error: null },
  });
  const user = await api.signup(NEW_ACCOUNT);
  assert.equal(user.needs_verification, false);
});

test("mailer failures are named rather than passed through raw", async () => {
  const limited = apiWith({ signUp: { data: { user: null, session: null }, error: { message: "email rate limit exceeded", status: 429 } } });
  await assert.rejects(limited.signup(NEW_ACCOUNT), (e) => {
    assert.equal(e.code, "email_rate_limited");
    assert.match(e.message, /wait an hour/i);
    return true;
  });

  const broken = apiWith({ signUp: { data: { user: null, session: null }, error: { message: "Error sending confirmation email" } } });
  await assert.rejects(broken.signup(NEW_ACCOUNT), (e) => {
    assert.equal(e.code, "email_send_failed");
    return true;
  });
});

test("login errors carry codes the pages can branch on", async () => {
  const unconfirmed = apiWith({ signIn: { data: null, error: { message: "Email not confirmed", code: "email_not_confirmed" } } });
  await assert.rejects(unconfirmed.login("e@x.com", "p"), (e) => {
    assert.equal(e.code, "email_not_confirmed");
    return true;
  });

  const wrong = apiWith({ signIn: { data: null, error: { message: "Invalid login credentials", code: "invalid_credentials" } } });
  await assert.rejects(wrong.login("e@x.com", "p"), (e) => {
    assert.equal(e.code, "invalid_credentials");
    assert.doesNotMatch(e.message, /invalid login credentials/i, "should be rewritten for a person");
    return true;
  });
});

test("resending to an already-confirmed address is not treated as an error", async () => {
  const api = apiWith({ resend: { error: { message: "User already confirmed" } } });
  await assert.rejects(api.resendConfirmation("e@x.com"), (e) => {
    assert.equal(e.code, "already_confirmed");
    assert.match(e.message, /already confirmed/i);
    assert.match(e.message, /log in/i);
    return true;
  });
});

test("the signup page offers a way in when the address is taken", () => {
  const page = fs.readFileSync(path.join(__dirname, "../signup.html"), "utf8");
  assert.match(page, /ex\.code === "email_exists"/);
  assert.match(page, /Log in instead/);
  // Whether the mail left has to travel to the verification page.
  assert.match(page, /confirmation_sent !== false/);
});

test("the verification page does not promise mail that was never sent", () => {
  const page = fs.readFileSync(path.join(__dirname, "../verify-email.html"), "utf8");
  assert.match(page, /pending\.sent === false/);
  assert.match(page, /did not go out/);
  assert.match(page, /email_rate_limited/);
});
