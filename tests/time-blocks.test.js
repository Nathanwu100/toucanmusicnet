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

test("a block a student is booked into cannot be removed underneath them", async () => {
  const { api } = loadDemoApi();
  const created = await classWithBlocks(api);
  await api.logout();
  await api.login("ari@example.com", "toucan2026");
  const block = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.find((row) => row.instrument === "violin");
  await api.joinClass(created.id, block.id);
  await api.logout();

  await api.login("admin", "toucan2026");
  const remaining = (await api.listEvents()).find((event) => event.id === created.id)
    .blocks.filter((row) => row.id !== block.id)
    .map(({ taken, spots_left, is_mine, instrument_name, ...keep }) => keep);
  // updateEvent takes the whole event, which is what the drag handler sends.
  const { id, time_slot_id, created_by, blocks, ...fields } = created;
  await assert.rejects(
    api.updateEvent(created.id, { ...fields, blocks: remaining }),
    /still has students booked in/i
  );
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
