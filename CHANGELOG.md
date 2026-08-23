# Changelog

All notable changes to Toucan Music are recorded here.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Because the site is a public-facing web app rather than a library, the parts
carry site-specific meanings:

- **MAJOR** — a change to what visitors or staff can do: who may see the
  calendar, how enrollment works, a rebuild of a page's purpose.
- **MINOR** — a new capability that breaks nothing: a new page, a new filter,
  a new field in the admin editor.
- **PATCH** — fixes and polish: layout bugs, copy, colour and spacing
  corrections, dependency bumps.

Database migrations under `supabase/migrations/` are numbered by timestamp and
apply in that order. A release that includes a migration says so, because the
migration has to run before the matching front-end goes live.

The version in `package.json` matches the newest tag here.

## [1.0.0] - 2026-08-22

The first tagged release. Opens the calendar to the public, rebuilds the About
page, retires the site's ambient motion, and moves everything onto a single
documented colour system.

### Added
- **Public calendar.** Anyone can read the full class and event schedule
  without an account. Signing in is now only required to *act* — joining a
  class, volunteering, or administering events.
- **Past classes.** An Upcoming / Past / All filter on the calendar, with
  finished items marked "Ended". Choosing a period the current month has
  nothing in jumps to the nearest month that does.
- **Instrument filter for everyone.** Previously admin-only.
- **About page roster** with photographs, as flip cards: the portrait is the
  front, the name and bio the back. Bios are not written yet; the data shape
  and the empty state are in place, so filling one in is a one-line edit in
  `js/team.js`.
- `npm run verify` — syntax check plus the test suite in one command.
- Test coverage for anonymous reads, past-event listing, and the
  instrument rule that survives the visibility change.

### Changed
- **Rainforest colour system.** Canopy green as the single action colour over
  a green page gradient, toucan-beak amber as the single emphasis colour, and
  three fixed instrument hues that never appear as decoration. The rules are
  written at the top of `css/style.css`; every hardcoded hex now resolves to a
  token.
- **Motion removed almost everywhere.** The pointer/scroll parallax engine,
  the animated backdrop, staged entrance animations, hover lifts and card tilt
  are gone. What still moves: the reminder panel on the home page, a slow
  sweep across "a soundtrack" in the headline, the profile-card flip, and
  toasts.
- The brand bird idles roughly four times as often as before, and is now the
  site's only ambient motion.
- Contact address is `toucanexec@gmail.com`.
- `btn-beak` is now `btn-primary`; the four ad-hoc `accent-*` text classes
  collapsed into `hl-primary` and `hl-accent`.
- Illustrations retinted from petrol teal to forest green.
- Students may now browse every instrument's classes. The join button is
  disabled with an explanation on classes outside their own instrument —
  the server rule was always there, but until now no student could reach it.

### Fixed
- **The footer appeared to scroll at a different rate than the page.** The
  backdrop was pinned to the viewport while the footer sat on slightly
  translucent white, so the pattern showed through and stayed put as the
  footer moved. The backdrop is now anchored to the document and the footer
  is opaque.

### Database
- Migration `20260822000000_public_calendar_read.sql` — `list_visible_events`
  no longer reads `profiles`, returns every event to every caller, and is
  granted to `anon`. **Unapplied and untested against a live database.** It
  must run before this release is deployed against Supabase.

### Security notes
- `location` and `created_by` on every event are now world-readable. Scrub any
  event location that should not be public before deploying.
- No new table access was granted. Public reads go through the existing
  security-definer function; the `events` table keeps its authenticated-only
  RLS policy, and every write path stays `authenticated`-only.

### Removed
- `js/parallax.js`, along with the `data-parallax` markup hooks and the
  `float-follow` pointer-tilt engine.
