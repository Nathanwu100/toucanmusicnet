# Toucan Music

A classic HTML/CSS/JS site for a music nonprofit teaching underprivileged
children — landing page, instrument-aware student signup, an editable class
calendar, transaction-safe student enrollment, volunteer capacity,
notification settings, and Supabase-backed weekly digest + reminders.

## Try it right now (demo mode)

No build step, no backend needed:

```sh
cd Toucan
python3 -m http.server 8080
# open http://localhost:8080
```

On localhost, the site runs in **demo mode**: accounts, events, student
enrollments, and volunteer signups live in your browser's localStorage. The
seed data includes Piano, Violin, and Viola schedules — the only three
instruments Toucan supports — with student and volunteer capacities.

- **Demo admin login:** name `admin`, password `toucan2026` (on the login page)
- **Volunteer login:** `maya@example.com`, `jordan@example.com`, or
  `sam@example.com`, password `toucan2026`
- **Student login:** `ari@example.com`, password `toucan2026` (Violin)
- Sign up as a **volunteer** to claim spots on events; as a **student** to
  choose one instrument, see only that instrument's schedule, and join a
  class with space remaining.
- The admin sees every instrument, can filter the calendar, inspect student
  and volunteer rosters, and set both student and volunteer capacity.

Demo credentials and localStorage are for local testing only. They are not a
production security boundary. A deployed site uses Supabase Auth and the
row-level policies in `supabase/schema.sql` for admin-only event changes.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Landing page — mission, programs, how volunteering works |
| `login.html` | Log in with email (the admin logs in with the name `admin`) |
| `signup.html` | Create a student or volunteer account; students must choose a supported instrument |
| `calendar.html` | Instrument-scoped student schedule with live class capacity and join/leave controls; all-instrument volunteer/admin views; admin filtering, editing, and rosters |
| Settings drawer | Student instrument changes with enrollment protection, notification preferences, and the site guide |
| `mission.html` | Mission statement, organization background, and community values; linked from the homepage and footer rather than the top navigation |

## Going live with Supabase

1. **Create a project** at [supabase.com](https://supabase.com), then put your
   Project URL and anon key into `js/config.js`.

2. **Run the database changes**. For a new project, paste
   `supabase/schema.sql` into the SQL editor. For an existing Toucan database,
   apply `supabase/migrations/20260718000000_student_instruments_and_enrollment.sql`
   (or run `supabase db push`). The current schema includes:

   - `instruments` with the supported Piano, Violin, and Viola tracks (any
     older tracks such as Strings, Percussion, or Voice are deactivated);
   - `profiles.instrument` and instrument/time-slot/capacity fields on `events`;
   - `student_enrollments`, with one student/class row and active/cancelled status;
   - `join_class` and `leave_class` RPCs that lock the class row, prevent
     duplicates, conflicts, and overbooking, and return the new spots-left count;
   - RLS that lets students read only events matching their profile instrument,
     keeps other students' enrollments private, preserves volunteer access, and
     gives admins the all-instrument view; and
   - database guards that reject instrument/time changes, deletion, or capacity
     reductions that would invalidate active student enrollments.

   Legacy schedule rows are backfilled by existing title/description keywords;
   unmatched legacy rows are assigned to Violin and should be reviewed by an
   admin. Events and profiles still on a retired track are moved to a supported
   instrument where safe — classes with active enrollments and their enrolled
   students are left for an admin to migrate by hand. Existing students without
   an instrument get no schedule and are prompted to choose one in Settings at
   their next login.

3. **Create and confirm the admin account**: in Dashboard → Authentication →
   Users → *Add user*, create `admin@toucanmusic.org` with a unique password
   from a password manager, and enable **Auto Confirm User**. If the account
   already exists and shows *Waiting for verification*, open that user and
   confirm its email before trying to log in.
   Then promote it:

   ```sql
   insert into public.profiles (id, full_name, role)
   select id, 'admin', 'admin' from auth.users
   where email = 'admin@toucanmusic.org'
   on conflict (id) do update set role = 'admin', full_name = 'admin';
   ```

   The login page maps the name `admin` to this email automatically. Never
   use the localhost demo password for this account, and never commit or share
   the production password. Do not place a Supabase secret or service-role key
   in `js/config.js`; that file must contain only the browser-safe publishable
   key.

4. **Set the authentication URLs**: in Dashboard → Authentication → URL
   Configuration, use the canonical production domain:

   ```text
   Site URL: https://toucan-music.com
   Redirect URL: https://toucan-music.com/login?confirmed=1
   ```

   The app always requests this canonical callback so confirmation emails do
   not inherit localhost or preview deployment URLs. Supabase will only honor
   it when the exact callback is allowlisted. Wildcards should be reserved for
   preview deployments.

5. **Emails** — sign up at [resend.com](https://resend.com) (or swap the
   `fetch` call in the functions for any provider), then deploy the two edge
   functions:

   ```sh
   supabase functions deploy weekly-digest event-reminders --no-verify-jwt
   supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="Toucan Music <hello@yourdomain.org>" SITE_URL=https://toucan-music.com
   ```

   For text reminders, add a Twilio number and set the SMS secrets used by
   `event-reminders`:

   ```sh
   supabase secrets set TWILIO_ACCOUNT_SID=AC_xxx TWILIO_AUTH_TOKEN=xxx TWILIO_FROM_NUMBER=+15551234567
   ```

6. **Schedule them** with pg_cron (Dashboard → Database → Extensions → enable
   `pg_cron` and `pg_net`, then run — replace `PROJECT_REF` and the anon key):

   ```sql
   -- Monday 8:00 AM weekly digest
   select cron.schedule('weekly-digest', '0 8 * * 1', $$
     select net.http_post(
       url := 'https://PROJECT_REF.supabase.co/functions/v1/weekly-digest',
       headers := '{"Authorization": "Bearer YOUR-ANON-KEY"}'::jsonb
     );
   $$);

   -- Reminders sweep every 5 minutes (sends at the 60- and 30-minute marks)
   select cron.schedule('event-reminders', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://PROJECT_REF.supabase.co/functions/v1/event-reminders',
       headers := '{"Authorization": "Bearer YOUR-ANON-KEY"}'::jsonb
     );
   $$);
   ```

7. Host the static files on the canonical `https://toucan-music.com` domain.
   The browser config and email links already default to this origin. If the
   public domain changes, update `PUBLIC_SITE_URL` in `js/config.js` and the
   `SITE_URL` Supabase secret together.

### Notes on behavior

- **Secret keys**: `js/config.js` is downloaded by every visitor and must only
  contain the browser-safe Supabase publishable/anon key. Keep secret and
  service-role keys out of the repository and local browser code. Local `.env`
  and `.dev.vars` files are ignored; production function credentials belong in
  Supabase Edge Function secrets. Rotate any credential that has been pasted
  into chat, logs, or other third-party systems.

- **Reminder timing**: "an hour and thirty minutes before" is implemented as
  two nudges — one at 60 minutes and one at 30 minutes before start. To make
  it a single 90-minute reminder instead, change `OFFSETS_MINUTES` in
  `supabase/functions/event-reminders/index.ts` to `[90]`.
- **Schedule privacy**: guests receive no schedule; students receive only the
  event rows matching `profiles.instrument`; volunteers and admins retain the
  all-instrument schedule. The edge functions apply the same student filter to
  weekly emails and reminders.
- **Student capacity**: spots left are always `student_capacity - active
  enrollments`. Canceled enrollments are ignored. The locking `join_class` RPC
  makes two students racing for the last spot serialize safely.
- **Instrument changes**: a student with an active enrollment must explicitly
  leave or transfer before changing instruments. Enrollment instrument and time
  slot are stored as snapshots and are never silently moved.
- **Volunteer capacity**: the existing locking trigger still prevents two
  volunteers from claiming the same final volunteer spot.
- Email and text delivery honor the per-user notification settings
  (`weekly_digest`, `class_reminders`, `text_notifications`). Text reminders
  require the Twilio secrets above; phone numbers and opt-in state are stored
  on the user's protected profile row.

## Tests

The test suite exercises signup requirements, login persistence, student/admin
visibility, direct filter-bypass attempts, eligible/full/duplicate/conflicting
enrollment, spots after join/leave, a two-session final-spot race, instrument
changes, legacy profiles, admin schedule guards, and SQL security contracts.

```sh
npm test
npm run check
```
