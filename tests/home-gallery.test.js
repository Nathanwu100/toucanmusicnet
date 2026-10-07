const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadDemoApi } = require("./helpers/load-demo-api");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const inDays = (days, hour) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

test("somebody signed in is kept off the signup page and its Join buttons lead home", () => {
  const page = read("js/page-signup.js");
  assert.match(page, /ToucanAPI\.getSession\(\)\.then\(\(user\) => \{\s*if \(user\) window\.location\.replace\("index\.html"\);/);
  const app = read("js/app.js");
  // Every link into signup, on every page, is re-pointed once a session is known.
  assert.match(app, /if \(currentUser\) \{\s*document\.querySelectorAll\('a\[href\^="signup\.html"\]'\)\.forEach/);
  assert.match(app, /link\.setAttribute\("href", "index\.html"\)/);
  // The mission page is one of the places that button lives.
  assert.match(read("mission.html"), /href="signup\.html">Join Toucan Music/);
});

test("every default icon in the catalog ships with the site", () => {
  const { api } = loadDemoApi();
  assert.ok(api.eventIcons.length >= 8, "a real choice, not two drawings");
  for (const icon of api.eventIcons) {
    const file = icon.src.replace(/\?.*$/, "");
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), `${icon.slug} -> ${file} exists`);
    assert.match(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), /<svg /);
  }
  // Spread before comparing: the api runs in a vm context, so the array's
  // prototype belongs to that realm and would fail deepEqual's proto check.
  assert.deepEqual(
    [...api.eventIcons.map((icon) => icon.slug)].sort(),
    ["concert-hall", "metronome", "notes", "piano", "sheet-music", "spotlight", "viola", "violin"]
  );
});

test("with no icon chosen the card follows the type and instruments", () => {
  const { api } = loadDemoApi();
  assert.equal(api.iconFor({ event_type: "class", instruments: ["piano"] }).slug, "piano");
  assert.equal(api.iconFor({ event_type: "class", instruments: ["viola"] }).slug, "viola");
  assert.equal(api.iconFor({ event_type: "class", instruments: ["violin", "viola"] }).slug, "sheet-music");
  assert.equal(api.iconFor({ event_type: "event", instruments: ["piano"] }).slug, "spotlight");
  // A chosen icon wins over all of that.
  assert.equal(api.iconFor({ event_type: "event", instruments: ["piano"], icon: "metronome" }).slug, "metronome");
  // An unknown slug stored by hand falls back rather than breaking the card.
  assert.equal(api.iconFor({ event_type: "class", instruments: ["piano"], icon: "nope" }).slug, "piano");
});

test("an admin saves an icon with the class, and only a catalog one", async () => {
  const { api } = loadDemoApi();
  await api.login("admin", "toucan2026");
  const base = {
    title: "Keys", event_type: "class", instruments: ["piano"],
    starts_at: inDays(2, 15), ends_at: inDays(2, 16), location: "Hall",
    volunteer_capacity: 1, student_capacity: 6, enrollment_open: true,
  };
  const created = await api.createEvent({ ...base, icon: "metronome" });
  assert.equal(created.icon, "metronome");
  const listed = (await api.listEvents()).find((event) => event.id === created.id);
  assert.equal(listed.icon, "metronome", "the listing carries it to the home page");

  await assert.rejects(api.createEvent({ ...base, icon: "clown" }), /default icons/);
  await assert.rejects(api.updateEvent(created.id, { ...base, icon: "clown" }), /default icons/);

  const cleared = await api.updateEvent(created.id, { ...base, icon: "" });
  assert.equal(cleared.icon, null, "an empty choice means automatic");
  await api.logout();
  const seen = (await api.listEvents()).find((event) => event.id === created.id);
  assert.equal(api.iconFor(seen).slug, "piano");
});

test("the class dialog offers the icons as tiles and sends the choice", () => {
  const markup = read("calendar.html");
  assert.match(markup, /id="f-icon" role="radiogroup"/);
  const calendar = read("js/calendar.js");
  assert.match(calendar, /iconTile\("", "Automatic", null\)/);
  assert.match(calendar, /api\.eventIcons\.forEach\(\(icon\) => iconHost\.appendChild\(iconTile\(icon\.slug, icon\.name, icon\.src\)\)\)/);
  assert.match(calendar, /icon: document\.querySelector\("#f-icon input:checked"\)\?\.value \|\| null/);
  // Editing a saved item shows its icon ticked, and the timetable's own
  // saves keep it.
  assert.match(calendar, /input\.checked = input\.value === chosenIcon/);
  assert.match(calendar, /icon: event\.icon \|\| null,/);
});

test("the migration adds the column and returns it from the listing", () => {
  const sql = read("supabase/migrations/20261007000000_event_icons.sql");
  assert.match(sql, /add column if not exists icon text/);
  assert.match(sql, /icon is null or icon ~ '\^\[a-z0-9-\]\{1,40\}\$'/);
  assert.match(sql, /drop function if exists public\.list_visible_events\(text\);/);
  assert.match(sql, /blocks jsonb,\s*icon text\s*\)/);
  assert.match(sql, /coalesce\(blocks\.list, '\[\]'::jsonb\) as blocks,\s*e\.icon/);
  const schema = read("supabase/schema.sql");
  assert.match(schema, /add column if not exists icon text/);
  assert.match(schema, /blocks jsonb,\s*icon text\s*\)/);
});

test("coming up is a sideways strip with a hover effect and hover-only arrows", () => {
  const app = read("js/app.js");
  const css = read("css/style.css");
  const markup = read("index.html");
  assert.match(app, /const UPCOMING_LIMIT = 8;/);
  assert.match(app, /api\.iconFor\(event\)/);
  assert.match(app, /function bindStripArrows\(gallery\)/);
  assert.match(markup, /data-upcoming-prev/);
  assert.match(markup, /data-upcoming-next/);
  // Sideways, a card at a time.
  assert.match(css, /\.event-gallery \{[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x mandatory;/);
  assert.match(css, /\.event-gallery-card \{[\s\S]*?scroll-snap-align: start;/);
  assert.doesNotMatch(css, /\.event-gallery \{ display: grid; grid-template-columns: repeat\(3/);
  // The hover: lift, picture, title.
  assert.match(css, /\.event-gallery-card:hover,\s*\.event-gallery-card:focus-visible \{[\s\S]*?transform: translateY\(-6px\)/);
  assert.match(css, /\.event-gallery-card:hover img,[\s\S]*?transform: scale\(1\.06\)/);
  // Arrows hide at either end and when there is nothing to scroll.
  assert.match(css, /\.event-gallery-strip\.at-start \[data-upcoming-prev\]/);
  assert.match(css, /\.event-gallery-strip\.no-overflow \.event-gallery-arrow \{ display: none; \}/);
});

test("the photo strip's arrows show only when the pointer is near them", () => {
  const css = read("css/style.css");
  const arrow = css.slice(css.indexOf(".gallery-arrow {"), css.indexOf(".gallery-dots {"));
  assert.match(arrow, /opacity: 0;/);
  // The halo is the "near": a wide invisible ring that counts as hovering.
  assert.match(arrow, /\.gallery-arrow::before \{ content: ""; position: absolute; inset: -34px;/);
  assert.match(arrow, /\.gallery-arrow:hover,\s*\.gallery-arrow:focus-visible \{ opacity: 1; \}/);
  // Nothing to hover on a touch screen, so there they stay visible.
  assert.match(arrow, /@media \(hover: none\) \{ \.gallery-arrow \{ opacity: 1; \}/);
});

test("small computers get a smaller site, and body text never drops below 14px", () => {
  const css = read("css/style.css");
  const start = css.indexOf("/* ------------------------------------------------------- small computers */");
  assert.ok(start > 0, "the compact layer exists");
  const compact = css.slice(start, css.indexOf("@media (prefers-reduced-motion: reduce)"));
  // Desktop only: phones keep their own layout.
  assert.match(compact, /@media \(min-width: 721px\) and \(max-width: 1280px\), \(min-width: 721px\) and \(max-height: 800px\)/);
  for (const size of compact.match(/html \{ font-size: ([\d.]+)px; \}/g).map((m) => parseFloat(m.match(/([\d.]+)px/)[1]))) {
    assert.ok(size >= 14, `root font-size ${size}px stays readable`);
  }
  // The things that are not in rem are brought down by hand.
  assert.match(compact, /\.cal-days \{ grid-auto-rows: 78px; \}/);
  assert.match(compact, /\.event-gallery-card \{ flex-basis: min\(270px, 78vw\)/);
});

test("Join us never flashes at somebody who was signed in last time", () => {
  const app = read("js/app.js");
  const css = read("css/style.css");
  // Before anything is drawn: hold the account corner back when the last
  // visit was signed in, and app.js blocks the first paint so that counts.
  assert.match(app, /if \(roleHint\(\) && roleHint\(\) !== "guest"\) document\.body\.classList\.add\("nav-auth-pending"\);/);
  assert.match(css, /\.nav-auth-pending \.nav-auth \{ visibility: hidden; \}/);
  // Released once the real nav is in, and the role remembered for next time.
  assert.match(app, /rememberRole\(document\.body\.dataset\.role\);\s*\n\s*document\.body\.classList\.remove\("nav-auth-pending"\);/);
  assert.match(app, /await api\.logout\(\);\s*\n\s*rememberRole\("guest"\);/);
  for (const page of ["index.html", "calendar.html", "mission.html", "about.html", "login.html", "signup.html"]) {
    assert.match(read(page), /js\/app\.js\?v=\d+" defer blocking="render"/, `${page} blocks render on app.js`);
  }
});
