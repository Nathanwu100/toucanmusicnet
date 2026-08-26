const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  DemoStorage,
  loadDemoApi,
  readDemoDb,
  writeDemoDb,
} = require("./helpers/load-demo-api");

const student = { email: "ari@example.com", password: "toucan2026" };

test("student signup requires a supported instrument and persists it across login", async () => {
  const { api } = loadDemoApi();
  await assert.rejects(
    api.signup({ name: "New Student", email: "new@example.com", password: "password1", role: "student" }),
    /Select an instrument/
  );

  const created = await api.signup({
    name: "New Student",
    email: "new@example.com",
    password: "password1",
    role: "student",
    instrument: "viola",
  });
  assert.equal(created.instrument, "viola");
  await api.logout();
  const loggedIn = await api.login("new@example.com", "password1");
  assert.equal(loggedIn.instrument, "viola");
  assert.equal(loggedIn.needs_instrument, false);
});

test("volunteer signup does not require or retain a student instrument", async () => {
  const { api } = loadDemoApi();
  const volunteer = await api.signup({
    name: "Helpful Person",
    email: "helper@example.com",
    password: "password1",
    role: "volunteer",
    instrument: "viola",
  });
  assert.equal(volunteer.instrument, null);
});

test("the schedule is unscoped for students, but joining still is not", async () => {
  const { api } = loadDemoApi();
  await api.login(student.email, student.password);
  const visible = await api.listEvents();
  assert.deepEqual(
    new Set(visible.flatMap((event) => event.instruments)),
    new Set(["piano", "violin", "viola"]),
    "a violin student browses every instrument"
  );

  // The instrument argument is now a filter anyone may use, not a cage the
  // server puts students in.
  const pianoOnly = await api.listEvents("piano");
  assert.ok(pianoOnly.length > 0);
  assert.ok(pianoOnly.every((event) => event.instruments.includes("piano")));

  // Seeing a class is not permission to join it.
  await assert.rejects(api.joinClass("ev-2"), /does not match/);
});

test("signed-out visitors read the whole schedule but cannot act on it", async () => {
  const { api } = loadDemoApi();
  const visible = await api.listEvents();
  assert.ok(visible.length > 0, "the calendar is readable with no session");
  assert.deepEqual(
    new Set(visible.flatMap((event) => event.instruments)),
    new Set(["piano", "violin", "viola"])
  );
  assert.ok(visible.every((event) => event.is_enrolled === false),
    "is_enrolled is a real false, never undefined, for anonymous callers");
  assert.ok(visible.every((event) => typeof event.spots_left === "number"),
    "capacity is public so visitors can see how full a class is");

  const pianoOnly = await api.listEvents("piano");
  assert.ok(pianoOnly.every((event) => event.instruments.includes("piano")),
    "the instrument filter works without a session");

  await assert.rejects(api.joinClass("ev-1"), /Log in|logged in|session/i);
});

test("past events stay in the listing so the calendar can look backwards", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  const started = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  db.events.push({
    id: "ev-past", time_slot_id: "slot-past", title: "Finished recital rehearsal",
    description: "Already over.", event_type: "class", instruments: ["violin"],
    starts_at: started.toISOString(),
    ends_at: new Date(started.getTime() + 3600000).toISOString(),
    location: "Community Hall", volunteer_capacity: 2,
    student_capacity: 12, enrollment_open: false,
  });
  writeDemoDb(storage, db);

  const visible = await api.listEvents();
  const past = visible.find((event) => event.id === "ev-past");
  assert.ok(past, "a finished class is still returned to an anonymous caller");
  assert.ok(new Date(past.starts_at).getTime() < Date.now());
  assert.equal(visible[0].id, "ev-past", "listings stay sorted oldest first");
});

test("admin sees all instruments and can filter explicitly", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const all = await api.listEvents();
  assert.deepEqual(new Set(all.flatMap((event) => event.instruments)), new Set(["piano", "violin", "viola"]));
  const pianoOnly = await api.listEvents("piano");
  assert.ok(pianoOnly.length > 0);
  assert.ok(pianoOnly.every((event) => event.instruments.includes("piano")));
});

test("eligible join and leave update spots immediately without counting cancellation", async () => {
  const { api } = loadDemoApi();
  await api.login(student.email, student.password);
  const before = (await api.listEvents()).find((event) => event.id === "ev-1");
  assert.equal(before.spots_left, 8);

  const joined = await api.joinClass("ev-1");
  assert.equal(joined.spots_left, 7);
  const afterJoin = (await api.listEvents()).find((event) => event.id === "ev-1");
  assert.equal(afterJoin.spots_left, 7);
  assert.equal(afterJoin.is_enrolled, true);
  await assert.rejects(api.joinClass("ev-1"), /already enrolled/);

  const left = await api.leaveClass("ev-1");
  assert.equal(left.spots_left, 8);
  const afterLeave = (await api.listEvents()).find((event) => event.id === "ev-1");
  assert.equal(afterLeave.spots_left, 8);
  assert.equal(afterLeave.is_enrolled, false);
});

test("full and closed classes reject enrollment", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  const event = db.events.find((row) => row.id === "ev-1");
  event.student_capacity = 1;
  db.studentEnrollments.push({
    id: "existing-enrollment", student_id: "someone-else", class_id: "ev-1",
    instrument: "violin", time_slot_id: event.time_slot_id,
    class_starts_at: event.starts_at, class_ends_at: event.ends_at, status: "active",
  });
  writeDemoDb(storage, db);
  await api.login(student.email, student.password);
  await assert.rejects(api.joinClass("ev-1"), /Class full/);

  const updated = readDemoDb(storage);
  updated.studentEnrollments = [];
  updated.events.find((row) => row.id === "ev-1").enrollment_open = false;
  writeDemoDb(storage, updated);
  await assert.rejects(api.joinClass("ev-1"), /not open/);
});

test("overlapping active classes are rejected", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  const base = db.events.find((event) => event.id === "ev-1");
  db.events.push({ ...base, id: "ev-conflict", time_slot_id: "slot-conflict", title: "Overlapping violin class" });
  writeDemoDb(storage, db);
  await api.login(student.email, student.password);
  await api.joinClass("ev-1");
  await assert.rejects(api.joinClass("ev-conflict"), /conflicts/);
});

test("instrument changes are blocked by enrollment and refresh visibility after leaving", async () => {
  const { api } = loadDemoApi();
  await api.login(student.email, student.password);
  await api.joinClass("ev-1");
  await assert.rejects(api.updateInstrument("piano"), /Leave or transfer/);

  await api.leaveClass("ev-1");
  const updated = await api.updateInstrument("piano");
  assert.equal(updated.instrument, "piano");

  // Visibility never depended on the instrument, so it does not change here.
  // What changes is what the student may join.
  await assert.rejects(api.joinClass("ev-1"), /does not match/);
  const joined = await api.joinClass("ev-2");
  assert.ok(joined.spots_left >= 0);
});

test("legacy students without an instrument can browse but not join", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  db.users.find((user) => user.id === "student-1").instrument = null;
  writeDemoDb(storage, db);
  const user = await api.login(student.email, student.password);
  assert.equal(user.needs_instrument, true);
  assert.ok((await api.listEvents()).length > 0, "an unset instrument no longer empties the calendar");
  await assert.rejects(api.joinClass("ev-1"), /instrument/i);

  await api.updateInstrument("viola");
  const joined = await api.joinClass("ev-3");
  assert.ok(joined.spots_left >= 0, "choosing an instrument unlocks joining, not seeing");
});

test("admin cannot invalidate an active student's instrument or time slot", async () => {
  const { api } = loadDemoApi();
  await api.login(student.email, student.password);
  await api.joinClass("ev-1");
  await api.logout();
  await api.login("admin", "toucan2026");
  const event = (await api.listEvents()).find((row) => row.id === "ev-1");
  await assert.rejects(
    api.updateEvent(event.id, { ...event, starts_at: new Date(new Date(event.starts_at).getTime() + 3600000).toISOString() }),
    /active student enrollments/
  );
});

test("two student sessions racing for one demo spot produce one enrollment", async () => {
  const sharedDatabase = new Map();
  const first = loadDemoApi(new DemoStorage(sharedDatabase));
  const second = loadDemoApi(new DemoStorage(sharedDatabase));
  await first.api.signup({ name: "Student One", email: "one@example.com", password: "password1", role: "student", instrument: "violin" });
  await second.api.signup({ name: "Student Two", email: "two@example.com", password: "password1", role: "student", instrument: "violin" });
  const db = readDemoDb(first.storage);
  db.events.find((event) => event.id === "ev-1").student_capacity = 1;
  writeDemoDb(first.storage, db);

  const outcomes = await Promise.allSettled([first.api.joinClass("ev-1"), second.api.joinClass("ev-1")]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal(readDemoDb(first.storage).studentEnrollments.filter((row) => row.class_id === "ev-1" && row.status === "active").length, 1);
});

test("admin can assign a class to the violin, piano, and viola instruments", async () => {
  const { api } = loadDemoApi();
  const catalog = await api.listInstruments();
  for (const slug of ["violin", "piano", "viola"]) {
    assert.ok(catalog.some((instrument) => instrument.slug === slug), `${slug} is a supported instrument`);
  }

  await api.login("admin", "toucan2026");
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const created = await api.createEvent({
    title: "Beginner viola", event_type: "class", instruments: ["viola"],
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600000).toISOString(),
    location: "Room C", volunteer_capacity: 1, student_capacity: 4, enrollment_open: true,
  });
  await api.logout();

  const violaStudent = await api.signup({
    name: "Viola Student", email: "viola@example.com", password: "password1",
    role: "student", instrument: "viola",
  });
  assert.equal(violaStudent.instrument, "viola");
  const visible = await api.listEvents();
  const createdRow = visible.find((event) => event.id === created.id);
  assert.ok(createdRow, "the new viola class shows up in the shared listing");
  assert.equal(createdRow.spots_left, 4);
  const joined = await api.joinClass(created.id);
  assert.equal(joined.spots_left, 3);
  await api.logout();

  // The violin student sees the viola class -- the calendar is shared -- but
  // the instrument rule still stops them at the door.
  await api.login(student.email, student.password);
  assert.ok((await api.listEvents()).some((event) => event.id === created.id));
  await assert.rejects(api.joinClass(created.id), /does not match/);
});

test("volunteer accounts also receive the student spots-left counts", async () => {
  const { api } = loadDemoApi();
  await api.login("maya@example.com", "toucan2026");
  const visible = await api.listEvents();
  const classRow = visible.find((event) => event.id === "ev-1");
  assert.equal(classRow.spots_left, 8);
  assert.equal(classRow.student_capacity, 8);
});

test("classes cannot be created on or moved to an unsupported instrument", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await assert.rejects(
    api.createEvent({
      title: "Guitar basics", event_type: "class", instruments: ["guitar"],
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600000).toISOString(),
      location: "Room A", volunteer_capacity: 1, student_capacity: 4, enrollment_open: true,
    }),
    /supported instrument/
  );
  const existing = (await api.listEvents()).find((event) => event.id === "ev-1");
  await assert.rejects(
    api.updateEvent("ev-1", { ...existing, instruments: ["strings"] }),
    /supported instrument/
  );
  await assert.rejects(
    api.updateEvent("ev-1", { ...existing, instruments: [] }),
    /supported instrument/
  );
});

test("admin can schedule concurrent classes for different instruments", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const starts = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const shared = {
    event_type: "class", starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + 3600000).toISOString(),
    volunteer_capacity: 1, student_capacity: 6, enrollment_open: true,
  };
  const piano = await api.createEvent({ ...shared, title: "Piano basics", instruments: ["piano"], location: "Room A" });
  const violin = await api.createEvent({ ...shared, title: "Violin basics", instruments: ["violin"], location: "Room B" });
  const all = await api.listEvents();
  assert.ok(all.some((event) => event.id === piano.id));
  assert.ok(all.some((event) => event.id === violin.id));
});

test("stored demo databases gain newly added catalog instruments without losing data", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  db.instruments = db.instruments.filter((instrument) => instrument.slug !== "viola");
  writeDemoDb(storage, db);

  const catalog = await api.listInstruments();
  for (const slug of ["piano", "violin", "viola"]) {
    assert.ok(catalog.some((instrument) => instrument.slug === slug), `${slug} survives the upgrade`);
  }
  assert.ok(readDemoDb(storage).users.some((user) => user.email === student.email));
});

test("a class taught for several instruments accepts students from each of them", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const created = await api.createEvent({
    // Duplicated and out of catalog order on purpose: the stored list is
    // normalized the same way the database trigger normalizes it.
    title: "Strings intensive", event_type: "class", instruments: ["viola", "violin", "violin"],
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600000).toISOString(),
    location: "Main Hall", volunteer_capacity: 1, student_capacity: 6, enrollment_open: true,
  });
  assert.deepEqual(created.instruments, ["violin", "viola"], "deduplicated and in catalog order");
  await api.logout();

  await api.login(student.email, student.password);
  await api.joinClass(created.id);
  await api.logout();
  await api.signup({
    name: "Viola Student", email: "viola@example.com", password: "password1",
    role: "student", instrument: "viola",
  });
  await api.joinClass(created.id);
  await api.logout();

  const pianoStudent = await api.signup({
    name: "Piano Student", email: "keys@example.com", password: "password1",
    role: "student", instrument: "piano",
  });
  assert.equal(pianoStudent.instrument, "piano");
  await assert.rejects(api.joinClass(created.id), /does not match/);

  const row = (await api.listEvents()).find((event) => event.id === created.id);
  assert.equal(row.active_enrollments, 2);
  assert.deepEqual(row.instrument_names, ["Violin", "Viola"]);
});

test("admin can add instruments to an enrolled class but not remove one in use", async () => {
  const { api, storage } = loadDemoApi();
  await api.login(student.email, student.password);
  await api.joinClass("ev-1");
  await api.logout();

  await api.login("admin", "toucan2026");
  const event = (await api.listEvents()).find((row) => row.id === "ev-1");
  const widened = await api.updateEvent("ev-1", { ...event, instruments: ["violin", "viola"] });
  assert.deepEqual(widened.instruments, ["violin", "viola"], "adding an instrument is allowed");

  await assert.rejects(
    api.updateEvent("ev-1", { ...event, instruments: ["viola"] }),
    /no longer teach/,
    "removing the enrolled student's instrument is not"
  );

  const enrollment = readDemoDb(storage).studentEnrollments.find((row) => row.class_id === "ev-1");
  assert.equal(enrollment.instrument, "violin", "the snapshot records the student's own instrument");
});

test("stored demo events from the single-instrument era upgrade in place", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  db.events.push({
    id: "ev-legacy", time_slot_id: "slot-legacy", title: "Old-format violin class",
    description: "Saved before classes could teach several instruments.",
    event_type: "class", instrument: "violin",
    starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    location: "Room A", volunteer_capacity: 1, student_capacity: 4, enrollment_open: true,
  });
  writeDemoDb(storage, db);

  const legacy = (await api.listEvents()).find((event) => event.id === "ev-legacy");
  // Spread before comparing: the api runs in a vm context, so this array's
  // prototype belongs to that realm and would fail deepEqual's proto check.
  assert.deepEqual([...legacy.instruments], ["violin"]);
  assert.equal(legacy.instrument, undefined, "the single-instrument field is gone after upgrade");

  await api.login(student.email, student.password);
  const joined = await api.joinClass("ev-legacy");
  assert.ok(joined.spots_left >= 0, "upgraded events are joinable");
});

test("multi-instrument migration rebuilds everything the dropped column took with it", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260825000000_multi_instrument_classes.sql"), "utf8");
  assert.match(sql, /add column if not exists instruments text\[\]/i);
  assert.match(sql, /drop column if exists instrument cascade/i);
  assert.match(sql, /cardinality\(instruments\) > 0/i);
  assert.match(sql, /viewer\.instrument = any \(target\.instruments\)/i);
  assert.match(sql, /auth\.uid\(\), target\.id, viewer\.instrument/i, "enrollments snapshot the student's instrument");
  assert.match(sql, /not \(se\.instrument = any \(new\.instruments\)\)/i, "removal of an in-use instrument is guarded");
  assert.match(sql, /\(select public\.current_instrument\(\)\) = any \(instruments\)/i, "the select policy is recreated in array form");
  assert.match(sql, /grant execute on function public\.list_visible_events\(text\) to anon, authenticated/i);
  assert.match(sql, /using gin \(instruments\)/i);
});

test("migration contains server-side RLS and atomic overbooking defenses", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260718000000_student_instruments_and_enrollment.sql"), "utf8");
  assert.match(sql, /where id = target_class_id for update/i);
  assert.match(sql, /unique \(student_id, class_id\)/i);
  assert.match(sql, /where se\.class_id = target\.id and se\.status = 'active'/i);
  assert.match(sql, /role and instrument scoped events/i);
  assert.match(sql, /instrument = \(select public\.current_instrument\(\)\)/i);
  assert.match(sql, /revoke insert, update, delete on public\.student_enrollments/i);
  assert.match(sql, /guard_enrolled_class_changes/i);
  assert.match(sql, /enforce_supported_instrument/i);
  assert.match(sql, /ensure_current_profile/i);
  assert.match(sql, /auth_created_at >= catalog_created_at/i);
  assert.match(sql, /role = 'student'\s+and instrument is not null/i);
});
