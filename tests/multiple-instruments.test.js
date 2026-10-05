const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadDemoApi, readDemoDb, writeDemoDb } = require("./helpers/load-demo-api");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const ari = { email: "ari@example.com", password: "toucan2026" }; // violin

const inDays = (days, hour, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

async function stringsClassWithBlocks(api) {
  await api.login("admin", "toucan2026");
  const created = await api.createEvent({
    title: "Strings afternoon", event_type: "class", instruments: ["violin", "viola"],
    starts_at: inDays(3, 15), ends_at: inDays(3, 16), location: "Mitchell Park",
    volunteer_capacity: 1, student_capacity: 20, enrollment_open: true,
    blocks: [
      { label: "Violin 1", instrument: "violin", starts_at: inDays(3, 15), ends_at: inDays(3, 15, 30), capacity: 2 },
      { label: "Viola 1", instrument: "viola", starts_at: inDays(3, 15), ends_at: inDays(3, 15, 30), capacity: 2 },
    ],
  });
  await api.logout();
  return created;
}

test("a student signs up with several instruments, kept in catalog order", async () => {
  const { api } = loadDemoApi();
  const created = await api.signup({
    name: "Two Strings", email: "two@example.com", password: "password1",
    role: "student", instruments: ["viola", "violin", "violin"],
  });
  assert.deepEqual([...created.instruments], ["violin", "viola"], "deduplicated and in catalog order");
  assert.deepEqual([...created.instrument_names], ["Violin", "Viola"]);
  assert.equal(created.needs_instrument, false);

  await api.logout();
  const loggedIn = await api.login("two@example.com", "password1");
  assert.deepEqual([...loggedIn.instruments], ["violin", "viola"]);
});

test("a student still needs at least one supported instrument to sign up", async () => {
  const { api } = loadDemoApi();
  await assert.rejects(
    api.signup({ name: "None", email: "none@example.com", password: "password1", role: "student", instruments: [] }),
    /Select an instrument/
  );
  await assert.rejects(
    api.signup({ name: "Guitar", email: "guitar@example.com", password: "password1", role: "student", instruments: ["violin", "guitar"] }),
    /supported instruments/
  );
  // The old single-value shape is still accepted.
  const legacy = await api.signup({ name: "Old Shape", email: "old@example.com", password: "password1", role: "student", instrument: "piano" });
  assert.deepEqual([...legacy.instruments], ["piano"]);
});

test("adding an instrument in Settings opens that instrument's classes", async () => {
  const { api } = loadDemoApi();
  await api.login(ari.email, ari.password);
  await assert.rejects(api.joinClass("ev-2"), /does not match/, "a piano class is closed to a violin-only student");

  const updated = await api.updateInstruments(["violin", "piano"]);
  assert.deepEqual([...updated.instruments], ["piano", "violin"], "stored in catalog order whatever order was sent");

  const joined = await api.joinClass("ev-2");
  assert.ok(joined.spots_left >= 0);
  const row = (await api.listEvents()).find((event) => event.id === "ev-2");
  assert.equal(row.is_enrolled, true);
});

test("an instrument an active enrollment is for cannot be removed; the others can", async () => {
  const { api, storage } = loadDemoApi();
  await api.login(ari.email, ari.password);
  await api.updateInstruments(["violin", "piano"]);
  await api.joinClass("ev-1"); // violin

  await assert.rejects(api.updateInstruments(["piano"]), /Leave or transfer your current class .*Beginner violin ensemble.*Violin/);
  // Adding is never blocked by an enrollment.
  const widened = await api.updateInstruments(["violin", "piano", "viola"]);
  assert.deepEqual([...widened.instruments], ["piano", "violin", "viola"]);
  // Dropping an instrument nothing depends on is fine.
  const narrowed = await api.updateInstruments(["violin"]);
  assert.deepEqual([...narrowed.instruments], ["violin"]);

  const enrollment = readDemoDb(storage).studentEnrollments.find((row) => row.class_id === "ev-1");
  assert.equal(enrollment.status, "active", "the enrollment was never touched");
  assert.equal(enrollment.instrument, "violin");
});

test("a student keeps at least one instrument", async () => {
  const { api } = loadDemoApi();
  await api.login(ari.email, ari.password);
  await assert.rejects(api.updateInstruments([]), /at least one instrument/i);
  await assert.rejects(api.updateInstruments(["violin", "drums"]), /supported instruments/i);
});

test("a two-instrument student can take a slot in either of their columns", async () => {
  const { api, storage } = loadDemoApi();
  const created = await stringsClassWithBlocks(api);

  await api.login(ari.email, ari.password);
  await api.updateInstruments(["violin", "viola"]);
  const blocks = (await api.listEvents()).find((event) => event.id === created.id).blocks;
  const viola = blocks.find((block) => block.instrument === "viola");

  const result = await api.joinClass(created.id, viola.id);
  assert.equal(result.block_id, viola.id);
  const enrollment = readDemoDb(storage).studentEnrollments.find((row) => row.class_id === created.id);
  assert.equal(enrollment.instrument, "viola", "the snapshot records the column actually taken, not the first on the account");

  // Moving to the violin column is a leave and a join, and is allowed too.
  await api.leaveClass(created.id);
  const violin = blocks.find((block) => block.instrument === "violin");
  await api.joinClass(created.id, violin.id);
  assert.equal(readDemoDb(storage).studentEnrollments.find((row) => row.class_id === created.id && row.status === "active").instrument, "violin");
});

test("a column for an instrument not on the account is still closed", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const created = await api.createEvent({
    title: "Everything", event_type: "class", instruments: ["piano", "violin", "viola"],
    starts_at: inDays(5, 15), ends_at: inDays(5, 16), location: "Hall",
    volunteer_capacity: 1, student_capacity: 20, enrollment_open: true,
    blocks: [{ label: "Keys", instrument: "piano", starts_at: inDays(5, 15), ends_at: inDays(5, 15, 30), capacity: 2 }],
  });
  await api.logout();
  await api.login(ari.email, ari.password);
  await api.updateInstruments(["violin", "viola"]);
  const keys = (await api.listEvents()).find((event) => event.id === created.id).blocks[0];
  await assert.rejects(api.joinClass(created.id, keys.id), /not your instrument/i);
});

test("a whole-class place in a class teaching two of your instruments is taken for one of them", async () => {
  const { api, storage } = loadDemoApi();
  await api.login(ari.email, ari.password);
  await api.updateInstruments(["violin", "viola"]);

  // ev-3 teaches violin and viola and has no blocks.
  await assert.rejects(api.joinClass("ev-3", null, "piano"), /cannot take this class for Piano/);
  const joined = await api.joinClass("ev-3", null, "viola");
  assert.equal(joined.block_id, null);
  assert.equal(readDemoDb(storage).studentEnrollments.find((row) => row.class_id === "ev-3").instrument, "viola");

  // Left unsaid, the class's first instrument the student plays is used.
  await api.leaveClass("ev-3");
  await api.joinClass("ev-3");
  assert.equal(readDemoDb(storage).studentEnrollments.find((row) => row.class_id === "ev-3" && row.status === "active").instrument, "violin");
});

test("the admin roster shows the instrument each student took the class for", async () => {
  const { api } = loadDemoApi();
  const created = await stringsClassWithBlocks(api);
  await api.login(ari.email, ari.password);
  await api.updateInstruments(["violin", "viola"]);
  const viola = (await api.listEvents()).find((event) => event.id === created.id).blocks
    .find((block) => block.instrument === "viola");
  await api.joinClass(created.id, viola.id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const roster = await api.listClassEnrollments(created.id);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].instrument, "viola");
  assert.equal(roster[0].instrument_name, "Viola");
});

test("demo accounts saved with a single instrument upgrade in place", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  const student = db.users.find((user) => user.id === "student-1");
  delete student.instruments;
  student.instrument = "viola";
  const volunteer = db.users.find((user) => user.id === "vol-1");
  delete volunteer.instruments;
  volunteer.instrument = null;
  writeDemoDb(storage, db);

  const user = await api.login(ari.email, ari.password);
  assert.deepEqual([...user.instruments], ["viola"]);
  assert.equal(user.needs_instrument, false);
  const upgraded = readDemoDb(storage);
  assert.equal(upgraded.users.find((row) => row.id === "student-1").instrument, undefined, "the single field is gone");
  assert.deepEqual(upgraded.users.find((row) => row.id === "vol-1").instruments, []);
});

test("the migration turns the profile column into an array and rebuilds what read it", () => {
  const sql = read("supabase/migrations/20261004000000_student_multiple_instruments.sql");
  assert.match(sql, /add column if not exists instruments text\[\] not null default '\{\}'/);
  assert.match(sql, /set instruments = array\[instrument\]/);
  assert.match(sql, /drop column if exists instrument cascade/);
  // The functions the pages call.
  assert.match(sql, /create or replace function public\.update_student_instruments\(new_instruments text\[\]\)/);
  assert.match(sql, /drop function if exists public\.update_student_instrument\(text\)/);
  assert.match(sql, /target_instrument text default null/);
  assert.match(sql, /drop function if exists public\.join_class\(uuid, uuid\);/, "both old signatures go, or PostgREST cannot choose");
  assert.match(sql, /grant execute on function public\.join_class\(uuid, uuid, text\) to authenticated/);
  // Removing an in-use instrument is refused and names the class.
  assert.match(sql, /not \(se\.instrument = any \(normalized\)\)/);
  assert.match(sql, /before removing % from your account/);
  assert.match(sql, /Keep at least one instrument on your account/);
  // A block has to be for one of the student's instruments; the snapshot is the block's.
  assert.match(sql, /not \(slot\.instrument = any \(viewer\.instruments\)\)/);
  assert.match(sql, /chosen_instrument := slot\.instrument/);
  // The row policies move to array overlap.
  assert.match(sql, /instruments && \(select public\.current_instruments\(\)\)/);
  assert.match(sql, /cardinality\(instruments\) > 0/);
  // First login reads the list from signup metadata, and still the old key.
  assert.match(sql, /jsonb_typeof\(auth_metadata -> 'instruments'\) = 'array'/);
  assert.match(sql, /auth_metadata ->> 'instrument'/);
  // Every list is normalised the same way a class's is.
  assert.match(sql, /create or replace function public\.normalize_student_instruments\(requested text\[\]\)/);
  assert.match(sql, /create trigger enforce_student_instruments/);
});

test("schema.sql agrees with the migration", () => {
  const schema = read("supabase/schema.sql");
  assert.match(schema, /add column if not exists instruments text\[\] not null default '\{\}'/);
  assert.doesNotMatch(schema, /add column if not exists instrument text references/);
  assert.doesNotMatch(schema, /current_instrument\(\)/);
  assert.doesNotMatch(schema, /update_student_instrument\(/);
  assert.match(schema, /public\.update_student_instruments\(new_instruments text\[\]\)/);
  assert.match(schema, /public\.join_class\(\s*target_class_id uuid,\s*target_block_id uuid default null,\s*target_instrument text default null\s*\)/);
  // The superseded single-instrument join_class is gone rather than created and dropped.
  assert.doesNotMatch(schema, /join_class\(target_class_id uuid\)\n/);
});

test("the edge functions filter by the student's list and read the class's", () => {
  for (const file of ["supabase/functions/event-reminders/index.ts", "supabase/functions/weekly-digest/index.ts"]) {
    const source = read(file);
    assert.match(source, /select\("id, full_name, role, instruments,/);
    assert.doesNotMatch(source, /p\.instrument\b/);
    assert.doesNotMatch(source, /ev(ent)?\.instrument\b/);
    assert.match(source, /p\.instruments \?\? \[\]\)\.some/);
  }
});

test("signup and Settings offer tick boxes, and the pages send the list", () => {
  const signup = read("signup.html");
  assert.match(signup, /id="instrument-choices" role="group"/);
  assert.match(signup, /Select your instruments/);
  assert.doesNotMatch(signup, /<select id="instrument"/);

  const page = read("js/page-signup.js");
  assert.match(page, /input\.type = "checkbox"/);
  assert.match(page, /instruments: role\.value === "student" \? chosenInstruments\(\) : \[\]/);
  assert.match(page, /Select at least one instrument/);

  const app = read("js/app.js");
  assert.match(app, /id="drawer-instruments" role="group"/);
  assert.match(app, /type="checkbox" name="drawer-instruments"/);
  assert.match(app, /api\.updateInstruments\(chosenInstruments\(\)\)/);
  assert.doesNotMatch(app, /updateInstrument\(/);
  // The one-instrument student who has not chosen is sent to the first box.
  assert.match(app, /#drawer-instruments input"\)\?\.focus\(\)/);

  const api = read("js/api.js");
  assert.match(api, /rpc\("update_student_instruments", \{ new_instruments: instruments \}\)/);
  assert.match(api, /target_instrument: instrument,/);
  assert.match(api, /data: \{ full_name: name, role, instruments: selectedInstruments, phone_number: phone \}/);
});

test("the timetable shows every column the student can book, sized to fit", () => {
  const calendar = read("js/calendar.js");
  const css = read("css/style.css");
  // Columns are the ones for instruments on the account, however many.
  assert.match(calendar, /shown = columns\s*\n\s*\.filter\(\(column\) => plays\(column\.slug\)\)/);
  // The grid takes its column count from what is shown, so two columns fill
  // the width two ways and one fills it once.
  assert.match(calendar, /table\.style\.setProperty\("--tt-columns", String\(shown\.length\)\)/);
  assert.match(css, /grid-template-columns: var\(--tt-axis\) repeat\(var\(--tt-columns, 3\), minmax\(0, 1fr\)\)/);
  // Booking follows the account's list in both layouts.
  assert.equal((calendar.match(/plays\(column\.slug\)/g) || []).length >= 4, true);
  // The way back names the columns, not a single instrument.
  assert.match(calendar, /`Just \$\{ownNames\}`/);
  // Joining a whole-class place for one of two shared instruments asks which.
  assert.match(calendar, /title: "Which instrument\?"/);
  assert.match(calendar, /api\.joinClass\(event\.id, null, forInstrument\)/);
  // The scope line lists them all.
  assert.match(calendar, /You can join \$\{listNames\(user\.instrument_names\)\} classes\./);
  assert.match(calendar, /Pick a slot in one of your instruments' columns\./);
});
