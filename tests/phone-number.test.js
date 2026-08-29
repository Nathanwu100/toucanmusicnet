const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { loadDemoApi } = require("./helpers/load-demo-api");

function loadPhone() {
  const window = {};
  const context = vm.createContext({ window, document: { createElement: () => ({}) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/phone.js"), "utf8"), context, {
    filename: "js/phone.js",
  });
  return window.ToucanPhone;
}

test("a national number needs no country code typed", () => {
  const phone = loadPhone();
  for (const typed of ["555 123 4567", "(555) 123-4567", "555.123.4567", "5551234567"]) {
    const parsed = phone.parse("US", typed);
    assert.equal(parsed.e164, "+15551234567", `${typed} should normalise`);
    assert.equal(parsed.valid, true);
  }
});

test("a typed international number re-points the country dropdown", () => {
  const phone = loadPhone();
  // Selected country says US, but the number names the UK. The number wins.
  const parsed = phone.parse("US", "+44 7700 900123");
  assert.equal(parsed.e164, "+447700900123");
  assert.equal(parsed.iso, "GB");
  assert.equal(parsed.national, "7700900123");
});

test("00 is accepted as the international prefix", () => {
  const phone = loadPhone();
  assert.equal(phone.parse("US", "004477009 00123").e164, "+447700900123");
});

test("a national trunk zero is dropped", () => {
  const phone = loadPhone();
  assert.equal(phone.parse("GB", "07700 900123").e164, "+447700900123");
  assert.equal(phone.parse("GB", "7700900123").e164, "+447700900123");
});

test("the dialling code is not doubled when typed without a plus", () => {
  const phone = loadPhone();
  assert.equal(phone.parse("US", "1 650 555 0142").e164, "+16505550142");
  assert.equal(phone.parse("US", "16505550142").e164, "+16505550142");
});

test("the longest matching dialling code wins", () => {
  const phone = loadPhone();
  // +351 must not be read as +3 or shadowed by a shorter code.
  const parsed = phone.parse("US", "+351 912 345 678");
  assert.equal(parsed.iso, "PT");
  assert.equal(parsed.e164, "+351912345678");
});

test("numbers outside the stored format are rejected with a reason", () => {
  const phone = loadPhone();
  assert.equal(phone.parse("US", "12345").error, "too-short");
  assert.equal(phone.parse("US", "+1 650 555 0142 999 888").error, "too-long");
  assert.equal(phone.parse("US", "   ").error, "empty");
  assert.equal(phone.parse("US", "+0 650 555 0142").error, "leading-zero");
  for (const error of ["too-short", "too-long", "empty", "leading-zero"]) {
    assert.match(phone.message(error), /\S/);
  }
});

test("a stored number splits back into dropdown and field", () => {
  const phone = loadPhone();
  // Spread into this realm's Object: the module runs in a vm context, so its
  // return values carry that context's prototype and deepEqual would balk.
  const split = (value) => ({ ...phone.split(value) });
  assert.deepEqual(split("+16505550142"), { iso: "US", national: "6505550142" });
  assert.deepEqual(split("+447700900123"), { iso: "GB", national: "7700900123" });
  assert.deepEqual(split(null), { iso: "US", national: "" });
});

test("every dialling code round-trips through split", () => {
  const phone = loadPhone();
  for (const country of phone.COUNTRIES) {
    const national = "5551234567";
    const stored = `+${country.dial}${national}`;
    const back = phone.split(stored);
    assert.equal(
      `+${phone.countryFor(back.iso).dial}${back.national}`,
      stored,
      `${country.iso} should round-trip`
    );
  }
});

test("a number given at signup is stored and switches texts on", async () => {
  const { api } = loadDemoApi();
  const user = await api.signup({
    name: "Phone Student", email: "phone@example.com", password: "password1",
    role: "student", instrument: "violin", phone_number: "+16505550142",
  });
  assert.equal(user.phone_number, "+16505550142");
  assert.equal(user.text_notifications, true);
});

test("signing up without a number leaves texts off", async () => {
  const { api } = loadDemoApi();
  const user = await api.signup({
    name: "Quiet Student", email: "quiet@example.com", password: "password1",
    role: "student", instrument: "violin",
  });
  assert.equal(user.phone_number, null);
  assert.equal(user.text_notifications, false);
});

test("signup refuses a number it could not store", async () => {
  const { api } = loadDemoApi();
  await assert.rejects(
    api.signup({
      name: "Bad Number", email: "bad@example.com", password: "password1",
      role: "volunteer", phone_number: "+123",
    }),
    /valid mobile number/
  );
});

test("ensure_current_profile carries a signup number onto the profile", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/20260826000000_signup_phone_number.sql"), "utf8"
  );
  // The insert must set both columns, or the text-notification constraint
  // and the number would drift apart.
  assert.match(migration, /insert into public\.profiles \([^)]*phone_number[^)]*text_notifications[^)]*\)/);
  // A malformed number must be dropped, never raised: a failed insert would
  // leave a signed-up account with no profile row at all.
  assert.match(migration, /requested_phone := null;/);
  assert.match(migration, /length\(requested_phone\) between 11 and 16/);
});

test("demo signup needs no verification, so it never diverts to the prompt", async () => {
  const { api } = loadDemoApi();
  const user = await api.signup({
    name: "Direct Entry", email: "direct@example.com", password: "password1",
    role: "volunteer",
  });
  assert.equal(user.needs_verification, false);
});

test("the signup form only diverts to verification when it is pending", () => {
  const signup = fs.readFileSync(path.join(__dirname, "../signup.html"), "utf8");
  assert.match(signup, /if \(user\.needs_verification\)/);
  assert.match(signup, /window\.location\.href = "verify-email\.html"/);
  // The address travels in sessionStorage, never the URL: it must not end up
  // in history, a referer header, or a proxy log.
  assert.match(signup, /sessionStorage\.setItem\(\s*"toucan_pending_verification_v1"/);
  assert.doesNotMatch(signup, /verify-email\.html\?[^"]*email/);
});

test("the verification page resends only to a pending address", () => {
  const page = fs.readFileSync(path.join(__dirname, "../verify-email.html"), "utf8");
  assert.match(page, /toucan_pending_verification_v1/);
  assert.match(page, /ToucanAPI\.resendConfirmation\(pending\.email\)/);
  // Arriving with nothing pending must disable the button rather than throw.
  assert.match(page, /resend\.disabled = true;/);
  // Supabase rate-limits these, so the button has to hold after a send.
  assert.match(page, /COOLDOWN_MS/);
  assert.match(page, /<meta name="robots" content="noindex"/);
});
