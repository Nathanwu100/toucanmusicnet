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

## [1.8.1] - 2026-08-29

Email confirmation was switched off on the project. Verified the whole
account flow against it end to end and patched the one thing that changed.

### Fixed
- **A duplicate address comes back in a different shape with confirmation
  off**, and only one of the two was handled. With confirmation on Supabase
  hides the collision behind a decoy user; with it off there is no email step
  to leak through, so it returns a plain `422 user_already_exists`. Both are
  now translated to the same `email_exists`, because the setting can be
  flipped at any time and either shape can come back.
- Diagnostics summary said "1 thing need attention".

### Verified against the live project
- Signing up returns a session immediately and the account is auto-confirmed.
- `ensure_current_profile` builds the profile row with the right name and role.
- Logging in with that account works.
- `list_visible_events` returns events with the `instruments` array, so all
  three migrations are applied.

## [1.8.0] - 2026-08-29

### Fixed
- **Signing up with an address that already had an account claimed an email
  had been sent when none had.** Supabase deliberately does not error in that
  case, because erroring would let anyone probe which addresses have accounts.
  It returns a decoy user with an empty `identities` array, no session, and a
  `confirmation_sent_at` for mail it never sent. The code read "no session" as
  "confirmation pending" and sent people to wait on an inbox that would stay
  empty forever. An empty `identities` array is the reliable tell, and it is
  now checked: the signup form says the address is taken and links to log in.
- **A new account whose confirmation email failed to send was told to go and
  check for it.** `confirmation_sent_at` is now carried through, and the
  verification page says the mail did not go out instead of promising it did.

### Changed
- Auth errors are translated in one place and carry a code, so pages branch on
  the code rather than on English error strings. Named so far:
  `email_exists`, `email_rate_limited`, `email_send_failed`,
  `email_not_confirmed`, `invalid_credentials`, `already_confirmed`.
- Mailer rate limiting reads as "wait an hour", not "email rate limit
  exceeded", and holds the resend button rather than inviting a retry that
  will fail.
- Resending to an address that is already confirmed now says so and points at
  the login page, instead of surfacing an error.

## [1.7.0] - 2026-08-28

### Added
- **`diagnostics.html`** — checks the config, whether the Supabase client
  script loaded, which mode the data layer is really in, whether the database
  is reachable and has the schema, whether sign-ups are enabled, whether email
  confirmation is required, and who the browser is currently signed in as.
  Read-only, `noindex`, and it names the fix next to each failure.
- **A standing banner** when the site is configured for Supabase but running
  on browser-local data anyway. That state is not "demo mode", it is broken:
  accounts go nowhere and no email is sent. It used to be a toast that slid
  away after five seconds.

### Changed
- `api.demoReason` now says *why* local data is in use (`localhost`,
  `not-configured`, `library-missing`, `forced`), and `api.misconfigured`
  flags the one case that is a fault rather than a choice.
- An unconfirmed account failing to log in now gets the address handed to
  `verify-email.html`, so the resend button there works, plus a link to it
  from the login page.
- The walkthrough says so when driver.js fails to load instead of returning
  silently, which read as a dead "Site guide" button.

### Notes
- The walkthrough already ran on first login and replayed from Settings ›
  Site guide; both were verified rather than rebuilt.

## [1.6.0] - 2026-08-28

### Added
- **A confirm-your-email page after signing up.** New accounts on a Supabase
  project that requires a confirmed address land on `verify-email.html`, which
  names the address, spells out the three steps, and can resend the link.

### Fixed
- **Signing up with email confirmation on used to dump you on the calendar,
  signed out, with no explanation.** Supabase returns no session in that case,
  but the form redirected to the calendar regardless. `signup()` now reports
  `needs_verification` and the form only diverts when it is set, so accounts
  that are immediately usable still go straight through.

### Notes
- The address is handed to the page in `sessionStorage`, not the query string:
  a URL would put a new member's email in browser history, the referer header,
  and any log along the way.
- The resend button holds for 30 seconds after a send, because Supabase
  rate-limits confirmation emails and a rejected send is worse than a wait.
  Arriving at the page directly disables it rather than failing.

## [1.5.0] - 2026-08-26

### Fixed
- **The nav never highlighted the current page anywhere but home.** Cloudflare
  serves these files at extensionless URLs, so in production the path is
  `/about`, not `/about.html`, and the filename comparison matched nothing.
  Home only appeared to work because `/` falls through to a default. The path
  is now normalised before comparison, so `/about`, `/about.html`, `/about/`
  and `/` all resolve correctly.

### Added
- **Page transitions.** Cross-document view transitions fade one page into the
  next, with the nav and footer held still across the change. Pure progressive
  enhancement, and off under reduced motion.
- **Skeleton loaders** for the home schedule and the calendar's day panel,
  sized to what is coming so nothing jumps when the real content lands.
- **Notifications link to their event.** Reminder toasts and the cards on the
  home page now carry the event id; the calendar reads `?event=` on arrival,
  lands on that day, opens the item and highlights it.
- **Depth on the home page** from "Coming up" down: three planes, each with its
  own ground tone taken from the canopy palette, separated by curved seams cut
  in the same ribbon language as the backdrop, with elevation spent on the
  event cards.

### Changed
- **Copy rewritten across the site** to read like a person wrote it.
- Roster order is now Nathan, Bryan, Sean, Sameer, Aiden, Carrie, Luke.

### Performance
- Assets cut from 844 KB to 436 KB: `carrie.jpg` (380 KB) and both sponsor
  PNGs converted to WebP.
- Every script moved to `<head>` with `defer`, so they download during parse
  instead of after it, and execution order is unchanged. The two inline page
  scripts became `type="module"` to keep them running last.
- Added `preconnect` for the icon and CDN origins, and intrinsic
  `width`/`height` on every image to stop layout shift.
- Home page now loads in 19 requests and 93 KB.

## [1.4.0] - 2026-08-26

### Added
- **Country-code dropdown on every phone field.** Nobody has to type `+1`.
  The new `js/phone.js` is shared by the signup form and the settings
  drawer so both accept exactly the same things.
- **Forgiving number entry.** Spaces, dashes, dots and parentheses are all
  fine; a national trunk `0` is dropped; `00` works as the international
  prefix; and pasting a full international number re-points the dropdown at
  the country it names instead of fighting the selection.
- **A number can be given while creating an account.** The field is
  optional and says so. Supplying one switches text reminders on, since the
  `profiles_text_notification_phone` constraint pairs them; leaving it blank
  leaves texts off, which is where an account starts anyway.

### Changed
- Numbers are still stored strictly as E.164, unchanged. Only entry became
  loose -- `js/api.js` normalises once more before storage, mirroring the
  `profiles_phone_number_format` constraint.
- Cache-busting query strings across the site had drifted apart; every page
  now loads the same stylesheet and script versions.

### Database
- Migration `20260826000000_signup_phone_number.sql` teaches
  `ensure_current_profile` to carry a signup number onto the new profile. A
  malformed value in auth metadata is dropped rather than raised: a failed
  insert would leave a signed-up account with no profile row at all.

## [1.3.0] - 2026-08-25

### Added
- Classes and events can be taught for several instruments at once. The
  admin editor's single instrument dropdown is now a checkbox group, the
  calendar shows one badge per instrument, and a student can join a class
  whenever it includes their instrument.
- **A past classes and events archive** in a collapsed drawer below the
  calendar, newest first and grouped by month. Each row carries the date,
  time, location, and instrument badges, and clicking one selects that day
  on the calendar above. It always lists finished items regardless of the
  Upcoming/Past/All control, since a drawer labelled "Past" that could be
  empty because of a filter elsewhere would be a riddle; the instrument
  filter does apply, because that narrows what the whole page is about.

### Fixed
- The instrument checkboxes in the admin editor rendered with no gap
  between box and name: `.field label { display: block }` outweighed the
  `.instrument-option` flex rule, so the layout never applied. They are
  now selectable pills that fill in when checked.

### Changed
- Enrollments now record the student's own instrument rather than the
  class's single track. An admin can add instruments to a class that has
  active students, but cannot remove an instrument an active enrollment
  depends on; time-slot changes stay frozen as before.

### Database
- Migration `20260825000000_multi_instrument_classes.sql` must run before
  this front-end goes live: `events.instrument` becomes the
  `events.instruments` array, and `list_visible_events`, `join_class`, the
  event triggers, and the student select policy are rebuilt in array form.

## [1.2.1] - 2026-08-23

### Changed
- Titles removed from the team cards. Each card now shows the portrait, the
  name, and the bio on hover. The `role` field and its markup stay in place
  as an extension point -- give one a value and it renders again.
- Every stated length of experience is two years longer. Sameer's bio names
  no durations, so it is unchanged.

## [1.2.0] - 2026-08-23

The team roster gets its real content.

### Added
- **Nathan** joins the roster as Founder and Piano Tutor, from a photo that
  arrived as `IMG_5881.jpeg`: rotated upright (it carried EXIF orientation 6,
  so the rotation is now baked in rather than left to the viewer), scaled to
  match the other portraits, and converted to WebP -- 979 KB down to 26 KB.
- **Names, roles, and bios for all seven** team members.

### Changed
- **Cards reveal instead of flipping.** Name and role now sit permanently at
  the bottom of each portrait, and the bio unrolls above them on hover or
  keyboard focus. The click-to-flip interaction, its 3D machinery, and the
  corner turn-over mark are gone.
- Cards are focusable, so the bio opens for keyboard users too, and every bio
  is pinned open under `(hover: none)` -- a touch device is never left with
  content behind an interaction it cannot perform.
- Roster is ordered by role: founder, then co-founders, then tutors.

### Notes
- Two people appeared twice in the source copy with conflicting details, and
  one title was left blank. Resolved with the owner rather than guessed:
  Carrie is the 7-years-violin version, Sameer's two roles are one person, and
  Aiden is Co-Head of Technology alongside Sean's Head of Technology.

## [1.1.0] - 2026-08-23

Brings back pointer-driven depth, narrowly.

### Added
- **Background parallax.** The three canopy bands drift on pointer and
  scroll again, each at its own depth. This is the only parallax on the
  site; no content element rides the engine except the two below.
- **Pointer-follow 3D** on exactly two things: the "a soundtrack" phrase in
  the home headline, and the reminder panel beside it. Perspective is
  applied to each element's own parent rather than to the hero as a whole,
  so nothing else inherits a 3D plane.
- `js/parallax.js` is back, and back in `npm run check`.

### Changed
- The canopy plate is viewport-fixed again, which is what bounds and clips
  each band's travel. The footer bug this originally caused stays fixed by
  the opaque surfaces, not by the positioning — see the note in the
  stylesheet before changing either.
- `.day-panel` on the calendar is now opaque; it was the last surface still
  translucent over the backdrop.
- The "a soundtrack" phrase is an inline-block so it can take a transform,
  so the headline wraps before it rather than mid-phrase.

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
