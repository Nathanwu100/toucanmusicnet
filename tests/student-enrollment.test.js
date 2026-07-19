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
    instrument: "voice",
  });
  assert.equal(created.instrument, "voice");
  await api.logout();
  const loggedIn = await api.login("new@example.com", "password1");
  assert.equal(loggedIn.instrument, "voice");
  assert.equal(loggedIn.needs_instrument, false);
});

test("volunteer signup does not require or retain a student instrument", async () => {
  const { api } = loadDemoApi();
  const volunteer = await api.signup({
    name: "Helpful Person",
    email: "helper@example.com",
    password: "password1",
    role: "volunteer",
    instrument: "voice",
  });
  assert.equal(volunteer.instrument, null);
});

test("student schedule is always scoped to the profile instrument", async () => {
  const { api } = loadDemoApi();
  await api.login(student.email, student.password);
  const visible = await api.listEvents();
  assert.ok(visible.length > 0);
  assert.deepEqual(new Set(visible.map((event) => event.instrument)), new Set(["strings"]));

  const bypassAttempt = await api.listEvents("voice");
  assert.deepEqual(new Set(bypassAttempt.map((event) => event.instrument)), new Set(["strings"]));
  await assert.rejects(api.joinClass("ev-2"), /does not match/);
});

test("admin sees all instruments and can filter explicitly", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const all = await api.listEvents();
  assert.deepEqual(new Set(all.map((event) => event.instrument)), new Set(["strings", "percussion", "voice"]));
  const voiceOnly = await api.listEvents("voice");
  assert.ok(voiceOnly.length > 0);
  assert.ok(voiceOnly.every((event) => event.instrument === "voice"));
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
    instrument: "strings", time_slot_id: event.time_slot_id,
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
  db.events.push({ ...base, id: "ev-conflict", time_slot_id: "slot-conflict", title: "Overlapping strings class" });
  writeDemoDb(storage, db);
  await api.login(student.email, student.password);
  await api.joinClass("ev-1");
  await assert.rejects(api.joinClass("ev-conflict"), /conflicts/);
});

test("instrument changes are blocked by enrollment and refresh visibility after leaving", async () => {
  const { api } = loadDemoApi();
  await api.login(student.email, student.password);
  await api.joinClass("ev-1");
  await assert.rejects(api.updateInstrument("percussion"), /Leave or transfer/);
  assert.ok((await api.listEvents()).every((event) => event.instrument === "strings"));

  await api.leaveClass("ev-1");
  const updated = await api.updateInstrument("percussion");
  assert.equal(updated.instrument, "percussion");
  assert.ok((await api.listEvents()).every((event) => event.instrument === "percussion"));
});

test("legacy students without an instrument see no schedule until choosing one", async () => {
  const { api, storage } = loadDemoApi();
  await api.listInstruments();
  const db = readDemoDb(storage);
  db.users.find((user) => user.id === "student-1").instrument = null;
  writeDemoDb(storage, db);
  const user = await api.login(student.email, student.password);
  assert.equal(user.needs_instrument, true);
  assert.equal((await api.listEvents()).length, 0);
  await api.updateInstrument("voice");
  assert.ok((await api.listEvents()).every((event) => event.instrument === "voice"));
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
  await first.api.signup({ name: "Student One", email: "one@example.com", password: "password1", role: "student", instrument: "strings" });
  await second.api.signup({ name: "Student Two", email: "two@example.com", password: "password1", role: "student", instrument: "strings" });
  const db = readDemoDb(first.storage);
  db.events.find((event) => event.id === "ev-1").student_capacity = 1;
  writeDemoDb(first.storage, db);

  const outcomes = await Promise.allSettled([first.api.joinClass("ev-1"), second.api.joinClass("ev-1")]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal(readDemoDb(first.storage).studentEnrollments.filter((row) => row.class_id === "ev-1" && row.status === "active").length, 1);
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
});
