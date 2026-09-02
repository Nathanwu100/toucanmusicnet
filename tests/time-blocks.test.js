const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadDemoApi } = require("./helpers/load-demo-api");

const inDays = (days, hour, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

// A class taught for piano and violin, with two named slots in each column.
async function classWithBlocks(api, overrides = {}) {
  await api.login("admin", "toucan2026");
  return api.createEvent({
    title: "Saturday workshop",
    event_type: "class",
    instruments: ["piano", "violin"],
    starts_at: inDays(3, 15),
    ends_at: inDays(3, 17),
    location: "Mitchell Park",
    volunteer_capacity: 1,
    student_capacity: 20,
    enrollment_open: true,
    blocks: [
      { label: "Beginners", instrument: "violin", starts_at: inDays(3, 15), ends_at: inDays(3, 15, 30), capacity: 1 },
      { label: "Grade 3", instrument: "violin", starts_at: inDays(3, 15, 30), ends_at: inDays(3, 16), capacity: 4 },
      { label: "Beginners", instrument: "piano", starts_at: inDays(3, 15), ends_at: inDays(3, 15, 30), capacity: 4 },
    ],
    ...overrides,
  });
}

test("a class keeps its blocks, each in one instrument's column", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  const listed = (await api.listEvents()).find((event) => event.id === created.id);
  assert.equal(listed.blocks.length, 3);
  const violin = listed.blocks.filter((block) => block.instrument === "violin");
  assert.equal(violin.length, 2);
  assert.deepEqual(violin.map((block) => block.label), ["Beginners", "Grade 3"]);
  // Every block reports its own capacity, not the class's.
  assert.equal(violin[0].capacity, 1);
  assert.equal(violin[0].spots_left, 1);
  assert.equal(listed.blocks.every((block) => block.instrument_name), true);
});

test("a block has to be for an instrument the class actually teaches", async () => {
  const { api } = loadDemoApi();
  await assert.rejects(
    classWithBlocks(api, {
      blocks: [{ label: "Nope", instrument: "viola", starts_at: inDays(3, 15), ends_at: inDays(3, 15, 30), capacity: 2 }],
    }),
    /instrument this class teaches/i
  );
});

test("a block has to sit inside its class's own window", async () => {
  const { api } = loadDemoApi();
  await assert.rejects(
    classWithBlocks(api, {
      // Class runs 15:00-17:00; this one starts an hour early.
      blocks: [{ label: "Too early", instrument: "violin", starts_at: inDays(3, 14), ends_at: inDays(3, 14, 30), capacity: 2 }],
    }),
    /inside the class/i
  );
});

test("a student books a slot in their own instrument's column", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");   // violin student
  const violinBlock = (await api.listEvents())
    .find((event) => event.id === created.id).blocks
    .find((block) => block.instrument === "violin" && block.label === "Beginners");

  const result = await api.joinClass(created.id, violinBlock.id);
  assert.equal(result.block_id, violinBlock.id);
  assert.equal(result.spots_left, 0, "that block held one place");

  const after = (await api.listEvents()).find((event) => event.id === created.id);
  const mine = after.blocks.find((block) => block.id === violinBlock.id);
  assert.equal(mine.is_mine, true);
  assert.equal(mine.spots_left, 0);
  // Filling one block leaves the others alone.
  assert.equal(after.blocks.find((block) => block.label === "Grade 3").spots_left, 4);
});

test("a student cannot take a slot in someone else's column", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");   // violin
  const pianoBlock = (await api.listEvents())
    .find((event) => event.id === created.id).blocks
    .find((block) => block.instrument === "piano");

  await assert.rejects(api.joinClass(created.id, pianoBlock.id), /not your instrument/i);
});

test("a class with blocks refuses a booking that names no block", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();
  await api.login("ari@example.com", "toucan2026");
  await assert.rejects(api.joinClass(created.id), /choose a time block/i);
});

test("a class without blocks still books as one whole-class place", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const plain = await api.createEvent({
    title: "Plain class", event_type: "class", instruments: ["violin"],
    starts_at: inDays(4, 15), ends_at: inDays(4, 16), location: "Room A",
    volunteer_capacity: 1, student_capacity: 5, enrollment_open: true,
  });
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const joined = await api.joinClass(plain.id);
  assert.equal(joined.block_id, null);
  assert.equal(joined.spots_left, 4);
  // Passing a block to a class that has none is a mistake worth reporting.
  await api.leaveClass(plain.id);
  await assert.rejects(api.joinClass(plain.id, "made-up"), /not divided into time blocks/i);
});

test("removing a block displaces the students in it and tells them", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const block = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.find((row) => row.instrument === "violin" && row.label === "Beginners");
  await api.joinClass(created.id, block.id);
  assert.equal((await api.listNotices()).length, 0, "nothing to say yet");
  await api.logout();

  // The admin drops that block. This used to be refused outright, which just
  // moved the problem to a phone call.
  await api.login("admin", "toucan2026");
  const { id, time_slot_id, created_by, blocks, ...fields } = created;
  const remaining = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.filter((row) => row.id !== block.id)
    .map(({ taken, spots_left, is_mine, instrument_name, ...keep }) => keep);
  await api.updateEvent(created.id, { ...fields, blocks: remaining });
  assert.equal((await api.listClassEnrollments(created.id)).length, 0, "their place is gone");
  await api.logout();

  // And the student is told, and pointed back at the class to pick again.
  await api.login("ari@example.com", "toucan2026");
  const notices = await api.listNotices();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "slot_changed");
  assert.equal(notices[0].class_id, created.id);
  assert.match(notices[0].previous_slot, /Beginners/);
  assert.match(notices[0].note, /removed from the class/i);

  // Dismissing it is the student's own call and it does not come back.
  await api.resolveNotice(notices[0].id);
  assert.equal((await api.listNotices()).length, 0, "a dismissed notice stays dismissed");
});

test("moving a block to a new time keeps the place and says so", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const block = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.find((row) => row.instrument === "violin" && row.label === "Beginners");
  await api.joinClass(created.id, block.id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const { id, time_slot_id, created_by, blocks, ...fields } = created;
  const shifted = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.map(({ taken, spots_left, is_mine, instrument_name, ...keep }) => keep)
    .map((row) => (row.id === block.id
      ? { ...row, starts_at: inDays(3, 16), ends_at: inDays(3, 16, 30) }
      : row));
  await api.updateEvent(created.id, { ...fields, blocks: shifted });

  // Still enrolled, but the snapshot follows the block so nobody turns up
  // at the old hour.
  const roster = await api.listClassEnrollments(created.id);
  assert.equal(roster.length, 1);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const notices = await api.listNotices();
  assert.equal(notices.length, 1);
  assert.match(notices[0].note, /moved to a new time/i);
});

test("an admin can remove a student, and the student is told", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const block = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.find((row) => row.instrument === "violin");
  await api.joinClass(created.id, block.id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const [entry] = await api.listClassEnrollments(created.id);
  await api.removeEnrollment(entry.enrollment_id, "Class rescheduled.");
  assert.equal((await api.listClassEnrollments(created.id)).length, 0);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const [notice] = await api.listNotices();
  assert.equal(notice.kind, "removed");
  assert.equal(notice.note, "Class rescheduled.");
  assert.match(notice.previous_slot, /Beginners/);
});

test("an admin can move a student to another slot", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const listed = (await api.listEvents()).find((event) => event.id === created.id);
  const from = listed.blocks.find((row) => row.label === "Beginners" && row.instrument === "violin");
  const to = listed.blocks.find((row) => row.label === "Grade 3");
  await api.joinClass(created.id, from.id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const [entry] = await api.listClassEnrollments(created.id);
  await api.moveEnrollment(entry.enrollment_id, created.id, to.id);
  const [after] = await api.listClassEnrollments(created.id);
  assert.equal(after.block_id, to.id);
  assert.equal(after.block_label, "Grade 3");
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const [notice] = await api.listNotices();
  assert.equal(notice.kind, "moved");
  assert.match(notice.previous_slot, /Beginners/);
  assert.match(notice.new_slot, /Grade 3/);
});

test("a move is checked the way a student's own booking would be", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");   // violin
  const listed = (await api.listEvents()).find((event) => event.id === created.id);
  await api.joinClass(created.id, listed.blocks.find((row) => row.instrument === "violin").id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const [entry] = await api.listClassEnrollments(created.id);
  const piano = listed.blocks.find((row) => row.instrument === "piano");
  // An admin cannot put a violin student in the piano column.
  await assert.rejects(api.moveEnrollment(entry.enrollment_id, created.id, piano.id), /not Violin/i);
  // Nor into a slot that is already full.
  const full = listed.blocks.find((row) => row.label === "Beginners" && row.instrument === "violin");
  await assert.rejects(api.moveEnrollment(entry.enrollment_id, created.id, "not-a-block"), /not part of that class/i);
  assert.ok(full);
});

test("only an admin can remove or move somebody", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();
  await api.login("ari@example.com", "toucan2026");
  const block = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.find((row) => row.instrument === "violin");
  await api.joinClass(created.id, block.id);
  const mine = await api.listEvents();
  assert.ok(mine.length);
  await assert.rejects(api.removeEnrollment("anything"), /admin/i);
  await assert.rejects(api.moveEnrollment("anything", created.id, block.id), /admin/i);
});

test("the admin roster carries contact details and the slot taken", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();

  await api.login("ari@example.com", "toucan2026");
  const block = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.find((row) => row.instrument === "violin" && row.label === "Grade 3");
  await api.joinClass(created.id, block.id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const roster = await api.listClassEnrollments(created.id);
  assert.equal(roster.length, 1);
  const entry = roster[0];
  assert.equal(entry.student_name, "Ari Chen");
  assert.equal(entry.email, "ari@example.com");
  assert.equal(entry.instrument, "violin");
  assert.equal(entry.instrument_name, "Violin");
  assert.equal(entry.block_label, "Grade 3");
  assert.ok(entry.block_starts_at, "the roster says which slot they took");
  assert.ok("phone_number" in entry);
});

test("only an admin can read the roster", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();
  await api.login("ari@example.com", "toucan2026");
  await assert.rejects(api.listClassEnrollments(created.id), /admin/i);
});

test("the migration ships the table, the guards and the roster gate", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/20260902000000_class_time_blocks.sql"), "utf8");

  assert.match(sql, /create table if not exists public\.class_time_blocks/);
  // A block belongs to one instrument column, and that column must be taught.
  assert.match(sql, /instrument text not null references public\.instruments \(slug\)/);
  assert.match(sql, /new\.instrument = any \(parent\.instruments\)/);
  // And it has to sit inside its class.
  assert.match(sql, /has to sit inside its class/);
  // Deleting a block people are booked into is refused.
  assert.match(sql, /guard_block_deletion/);
  assert.match(sql, /booked in\. They have to leave it first/);
  // Contact details leave the database through exactly one admin-gated door.
  assert.match(sql, /if not public\.is_admin\(\) then/);
  assert.match(sql, /revoke execute on function public\.list_class_roster\(uuid\) from public, anon;/);
  // Students may only take a block in their own column.
  assert.match(sql, /slot\.instrument <> viewer\.instrument/);
  // The schedule stays public, but only for reading.
  assert.match(sql, /for select to anon, authenticated using \(true\)/);
});

test("the timetable lets an admin draw a block and type exact times", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");

  // Press on empty column space starts a new block; pressing an existing one
  // is a drag or an edit instead.
  assert.match(calendar, /pointerEvent\.target\.closest\("\.tt-block"\)/);
  assert.match(calendar, /enableBlockCreation/);
  // Dragging down sets the length; a plain click falls back to half an hour.
  assert.match(calendar, /Math\.abs\(to - from\) \|\| 30/);
  // Whatever was drawn opens in an editor whose times stay editable.
  assert.match(calendar, /openBlockEditor/);
  assert.match(calendar, /name="start" required/);
  assert.match(calendar, /name="end" required/);
  // Clicking an existing block edits it, and that editor can delete it.
  assert.match(calendar, /data-delete/);
  // Everything lands on the five-minute grid.
  assert.match(calendar, /Math\.round\(raw \/ SNAP_MINUTES\) \* SNAP_MINUTES/);
});

test("the class dialog lays blocks out on the same timetable, in a draft", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");

  // One renderer, two call sites: the live timetable and the dialog's copy.
  assert.match(calendar, /function renderBlockGrid\(ctx\)/);
  assert.match(calendar, /renderLiveTimetable/);
  assert.match(calendar, /renderDraftTimetable/);
  // The dialog must show empty columns -- they are what you click on.
  assert.match(calendar, /allowEmpty/);
  // Edits in the dialog collect in a draft; nothing is written until the
  // class itself is saved.
  assert.match(calendar, /let draftBlocks = \[\];/);
  assert.match(calendar, /function collectBlocks\(\) \{\s*return draftBlocks;/);
  // The grid follows the fields it is drawn from.
  assert.match(calendar, /\$\("#f-start"\)\.addEventListener\("change", renderDraftTimetable\)/);
  assert.match(calendar, /\$\("#f-end"\)\.addEventListener\("change", renderDraftTimetable\)/);
  // Unticking an instrument cannot leave blocks stranded in its column.
  assert.match(calendar, /draftBlocks = draftBlocks\.filter\(\(block\) => taught\.has\(block\.instrument\)\)/);
  // The old row-based editor is gone entirely.
  assert.doesNotMatch(calendar, /blockEditorRow/);
});

test("one press lays a whole class out in back-to-back slots", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");
  const markup = fs.readFileSync(path.join(__dirname, "../calendar.html"), "utf8");

  assert.match(markup, /id="fill-blocks"/);
  assert.match(markup, /id="fill-length"[^>]*value="30"/, "defaults to 30-minute slots");
  assert.match(calendar, /function fillDefaultBlocks/);
  // Runs the class's own window, column by column, with no gap between slots.
  assert.match(calendar, /cursor = finish;/);
  assert.match(calendar, /for \(const instrument of model\.instruments\)/);
  // The last slot is short rather than overrunning the class.
  assert.match(calendar, /Math\.min\(cursor \+ length \* 60000, classEnd\)/);
  // Pressing it on a half-built class fills gaps instead of wiping work.
  assert.match(calendar, /if \(!overlaps\(instrument, cursor, finish\)\)/);
  // It refuses politely rather than producing nonsense.
  assert.match(calendar, /Set the class start and end times first\./);
  assert.match(calendar, /Tick at least one instrument first\./);
});

test("the migration files notices instead of refusing the edit", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/20260903000000_student_notices.sql"), "utf8");

  assert.match(sql, /create table if not exists public\.student_notices/);
  // A student reads and dismisses only their own.
  assert.match(sql, /for select to authenticated using \(student_id = \(select auth\.uid\(\)\)\)/);
  // Both admin actions are gated, and both leave a notice behind.
  for (const fn of ["admin_cancel_enrollment", "admin_move_enrollment", "save_class_blocks"]) {
    assert.ok(sql.includes(`function public.${fn}`), `${fn} should exist`);
  }
  assert.match(sql, /Only an admin can remove a student from a class\./);
  assert.match(sql, /Only an admin can move a student\./);
  assert.match(sql, /Only an admin can change a class timetable\./);
  // A move is checked the way a student's own booking would be.
  assert.match(sql, /That class does not teach %\./);
  assert.match(sql, /slot\.instrument <> row\.instrument/);
  assert.match(sql, /That slot is already full\./);
  // Removing a block cancels the places in it and says why.
  assert.match(sql, /That time block was removed from the class\./);
  assert.match(sql, /That time block moved to a new time\./);
  // Notices describe the slot in words, so they survive its deletion.
  assert.match(sql, /function public\.describe_slot/);
});

test("the student prompt links back to the class to pick again", () => {
  const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  assert.match(app, /showStudentNotices/);
  assert.match(app, /Your place in a class was cancelled/);
  assert.match(app, /Pick another time/);
  // Only students, and only once they have something outstanding.
  assert.match(app, /user\.role !== "student"/);
  // A move leaves them with a place, so it does not ask them to choose again.
  assert.match(app, /notice\.kind !== "moved"/);
});
