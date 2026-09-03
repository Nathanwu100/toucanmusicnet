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
  assert.match(calendar, /function collectBlocks\(\) \{\s*return draftBlocks\.map\(forSaving\);/);
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

test("a block that has never been saved carries no id", async () => {
  // A locally minted id like "id-jdn4qmugmtksd0r5" is not a uuid, and
  // save_class_blocks casts this field straight to one. New blocks must
  // therefore arrive with the field absent, and let the server assign it.
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");

  const drawn = {
    label: "Beginners", instrument: "violin",
    starts_at: inDays(3, 15), ends_at: inDays(3, 15, 30), capacity: 3,
  };
  assert.ok(!("id" in drawn));

  const created = await api.createEvent({
    title: "Fresh class", event_type: "class", instruments: ["violin"],
    starts_at: inDays(3, 15), ends_at: inDays(3, 16), location: "Room A",
    volunteer_capacity: 0, student_capacity: 6, enrollment_open: true,
    blocks: [drawn],
  });

  // The demo store stands in for the server here and assigns one on save.
  assert.equal(created.blocks.length, 1);
  assert.ok(created.blocks[0].id, "saving is what gives a block its id");
});

test("the grid never sends its local drafting key to the server", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");
  // _key exists only so the grid can address a block it has drawn but not
  // saved. forSaving drops it, and every outbound path goes through that.
  assert.match(calendar, /const forSaving = \(block\) => \{/);
  assert.match(calendar, /_key, \.\.\.keep/);
  assert.match(calendar, /return draftBlocks\.map\(forSaving\)/);
  // Cards are addressed by id when there is one, and by _key when there is not.
  assert.match(calendar, /const blockKey = \(block\) => block\.id \|\| block\._key/);
  assert.match(calendar, /card\.dataset\.blockId = blockKey\(block\)/);
});

test("a student presses the block itself to take a slot", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");

  // The block is the control, not a container with a control inside it.
  assert.match(calendar, /element\(interactive \? "button" : "div", "tt-block"\)/);
  const blockCard = calendar.slice(
    calendar.indexOf("function blockCard("),
    calendar.indexOf("// A slice of a day calendar")
  );
  assert.doesNotMatch(blockCard, /element\("button"/,
    "the card must not build a button inside itself");
  // A full slot is not pressable, and says so to a screen reader.
  assert.match(calendar, /aria-disabled/);
  // Leaving your own slot asks first -- a stray click should not drop it --
  // through the site's own dialog rather than the browser's.
  assert.match(calendar, /title: "Leave this slot\?"/);
  // Taking one asks too, and says when and where before they commit.
  assert.match(calendar, /title: `Take \$\{block\.label\}\?`/);
  assert.doesNotMatch(calendar, /[^.\w]confirm\(`/, "no native confirm() left");
  // Each instrument colours its own blocks.
  for (const instrument of ["piano", "violin", "viola"]) {
    assert.ok(
      css.includes(`.tt-block[data-instrument="${instrument}"]`),
      `${instrument} blocks need their own colour`
    );
  }
  // The slot you are in is filled solid so it cannot be mistaken.
  assert.match(css, /\.tt-block\.is-mine \{[^}]*background: var\(--block-ink/);
});

test("the timetable lives in the day panel, and the panel is sized for it", () => {
  const markup = fs.readFileSync(path.join(__dirname, "../calendar.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");

  // The timetable opens under the day it belongs to, not in a slab further
  // down the page.
  const panel = markup.slice(markup.indexOf('id="day-panel"'), markup.indexOf("</aside>"));
  assert.ok(panel.includes('id="class-timetable"'), "the timetable belongs inside the day panel");
  // Which means the panel needs the width a three-column grid asks for.
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(380px, 520px\)/);
});

test("a stacked layout takes you to the day you tapped", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");

  assert.match(calendar, /const stackedLayout = \(\) => window\.matchMedia\("\(max-width: 1000px\)"\)/);
  assert.match(calendar, /function revealDayPanel/);
  assert.match(calendar, /selectDate\(date, \{ reveal: true \}\)/);
  // The stylesheet has to agree about when the layout stacks.
  assert.match(css, /@media \(max-width: 1000px\)/);
  // Qualified, or the sticky rule further down the file wins on source order.
  assert.match(css, /\.calendar-layout \.day-panel \{[^}]*position: static/);
  // Scrolled-to panels should clear the sticky nav.
  assert.match(css, /scroll-margin-top/);
});

test("once a student has a place, a narrow screen shows just that slot", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");

  assert.match(calendar, /const onlyMine = focusOwn && Boolean\(enrolledBlockId\) && narrow/);
  // shown must be computed before the column count and headings read it.
  const fn = calendar.slice(calendar.indexOf("function renderBlockGrid(ctx)"));
  assert.ok(fn.indexOf("const shown =") < fn.indexOf("shown.length"),
    "shown has to be declared before its first use");
  // And there is always a way back to the whole grid.
  assert.match(calendar, /See every slot|See the other instruments/);
  assert.match(calendar, /showWholeTimetable = true/);
  // Collapsed, the one block that matters keeps its detail.
  assert.match(css, /\.tt\.is-focused \.tt-block-time/);
});

test("destructive questions use the site's dialog, not the browser's", () => {
  const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");

  assert.match(app, /window\.confirmDialog = function/);
  // Escape cancels, and Tab cannot wander out of a modal.
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /event\.key === "Tab"/);
  // Focus goes back where it came from, or the next Tab starts from the top.
  assert.match(app, /previouslyFocused instanceof HTMLElement/);

  // Every destructive path asks through it.
  // Leave a slot, take a slot, remove a student, delete a class.
  assert.equal((calendar.match(/await confirmDialog\(/g) || []).length, 4);
  assert.match(calendar, /title: `Remove \$\{entry\.student_name\}\?`/);
  assert.match(calendar, /confirmLabel: "Delete it"/);
});

test("a notice that needs answering takes the middle of the screen", () => {
  const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");

  // Losing a place interrupts; being moved does not.
  assert.match(app, /notices\.some\(\(notice\) => notice\.kind !== "moved"\)/);
  assert.match(app, /notice-centred/);
  assert.match(app, /aria-modal/);
  assert.match(css, /\.notice-scrim \{[\s\S]*?place-items: center/);
  // Dismissing the last card takes the backdrop with it.
  assert.match(app, /host\.closest\("\.notice-scrim"\) \|\| host/);
});

test("icons ship with the site instead of being fetched at runtime", () => {
  const icons = fs.readFileSync(path.join(__dirname, "../js/icons.js"), "utf8");
  const pages = ["index.html", "calendar.html", "about.html", "mission.html",
                 "login.html", "signup.html", "verify-email.html", "diagnostics.html"];

  // The element the markup already uses, rendered from a bundled map.
  assert.match(icons, /customElements\.define\("iconify-icon"/);
  assert.match(icons, /pixelarticons:calendar/);

  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.ok(!html.includes("code.iconify.design"),
      `${page} should not reach the icon CDN at runtime`);
    assert.ok(html.includes("js/icons.js"), `${page} should bundle its icons`);
  }

  // Every icon the markup asks for has to be in the bundle, or it renders blank.
  const used = new Set();
  for (const file of [...pages, "js/app.js", "js/calendar.js", "js/team.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const match of source.matchAll(/icon="([^"]+)"/g)) used.add(match[1]);
  }
  for (const name of used) {
    assert.ok(icons.includes(`"${name}"`), `${name} is used but not bundled`);
  }
});

test("the walkthrough library loads only when the walkthrough runs", () => {
  const tutorial = fs.readFileSync(path.join(__dirname, "../js/tutorial.js"), "utf8");
  const calendar = fs.readFileSync(path.join(__dirname, "../calendar.html"), "utf8");

  assert.ok(!calendar.includes("driver.js.iife.js"),
    "driver.js should not load on every calendar visit");
  assert.ok(!calendar.includes("driver.css"));
  assert.match(tutorial, /function loadDriver/);
  assert.match(tutorial, /await loadDriver\(\)/);
  // A failed fetch is reported, not silently ignored.
  assert.match(tutorial, /could not load/);
});

test("a student is told which instrument they may book, and where to change it", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");

  // The rule is stated on the timetable, not only after a refused attempt.
  assert.match(calendar, /You can only take slots in the \$\{user\.instrument_name\} column/);
  assert.match(calendar, /because that is the instrument on your account/);
  // A class that does not teach their instrument says so plainly.
  assert.match(calendar, /This class does not teach \$\{user\.instrument_name\}/);
  // No instrument chosen yet is its own case.
  assert.match(calendar, /Choose an instrument in /);
  // Every one of them points at Settings, which is a drawer, not a page.
  assert.match(calendar, /function settingsLink/);
  assert.match(calendar, /\[data-open-settings\]/);

  // Pressing somebody else's column explains itself rather than doing nothing.
  assert.match(calendar, /is-other-instrument/);
  assert.match(calendar, /Change your instrument in Settings/);
});

test("a student sees only the column they can actually book", () => {
  const calendar = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");

  // Their own instrument's column, and only when the class teaches it.
  assert.match(calendar, /const ownColumn = isStudent && user\?\.instrument/);
  assert.match(calendar, /columns\.some\(\(column\) => column\.slug === user\.instrument\)/);
  assert.match(calendar, /column\.slug === user\.instrument/);
  // Admins and signed-out visitors keep the whole grid.
  assert.match(calendar, /let shown = columns;/);
  // There is always a way to see the rest.
  assert.match(calendar, /See the other instruments/);
  // Filtering must not mutate the listing it was handed.
  assert.match(calendar, /\.map\(\(column\) => \(\{\s*\.\.\.column,/);
});
