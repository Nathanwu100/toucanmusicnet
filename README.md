# Toucan Music

A classic HTML/CSS/JS site for a music nonprofit teaching underprivileged
children — landing page, login/signup (student or volunteer), an editable
calendar with volunteer capacity, notification settings, and Supabase-backed
weekly digest + class-reminder emails.

## Try it right now (demo mode)

No build step, no backend needed:

```sh
cd Toucan
python3 -m http.server 8080
# open http://localhost:8080
```

On localhost, the site runs in **demo mode**: accounts, events, and volunteer
signups live in your browser's localStorage. The seed data includes example
classes, showcase/lending-library events, and a few claimed volunteer spots.

- **Demo admin login:** name `admin`, password `toucan2026` (on the login page)
- **Volunteer login:** `maya@example.com`, `jordan@example.com`, or
  `sam@example.com`, password `toucan2026`
- **Student login:** `ari@example.com`, password `toucan2026`
- Sign up as a **volunteer** to claim spots on events; as a **student** to
  just see the schedule.
- The admin can create/edit/delete events and set the number of volunteer
  spots per event.

Demo credentials and localStorage are for local testing only. They are not a
production security boundary. A deployed site uses Supabase Auth and the
row-level policies in `supabase/schema.sql` for admin-only event changes.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Landing page — mission, programs, how volunteering works |
| `login.html` | Log in with email (the admin logs in with the name `admin`) |
| `signup.html` | Create an account; choose **student** or **volunteer** |
| `calendar.html` | Selectable month calendar with a full day-details panel. Everyone sees events; volunteers see spots left and can sign up; the admin creates, edits, and deletes events and sees who signed up |
| Settings drawer | Available from every page: weekly email, class reminders, text notifications, and the site guide |
| `mission.html` | Mission statement, organization background, and community values; linked from the homepage and footer rather than the top navigation |

## Going live with Supabase

1. **Create a project** at [supabase.com](https://supabase.com), then put your
   Project URL and anon key into `js/config.js`.

2. **Run the schema**: paste `supabase/schema.sql` into the SQL editor and run
   it. It creates `profiles`, `events`, `volunteer_signups`, `reminders_sent`,
   row-level security, and a trigger that enforces volunteer capacity
   server-side (so the spot limit holds even against a modified client).

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
   Configuration, set **Site URL** to the deployed app origin, not localhost.
   Add that origin to **Redirect URLs** as well. For the repository's current
   public URL, use:

   ```text
   Site URL: https://toucanmusicnet.vercel.app
   Redirect URL: https://toucanmusicnet.vercel.app/login.html?confirmed=1
   ```

   Add each preview or alternate production origin that is allowed to send
   signup emails. The browser includes its current origin in confirmation
   requests; Supabase will only honor it when that exact callback is
   allowlisted. Wildcards should be reserved for preview deployments.

5. **Emails** — sign up at [resend.com](https://resend.com) (or swap the
   `fetch` call in the functions for any provider), then deploy the two edge
   functions:

   ```sh
   supabase functions deploy weekly-digest event-reminders --no-verify-jwt
   supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="Toucan Music <hello@yourdomain.org>"
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

7. Host the static files anywhere (Netlify, GitHub Pages, S3…) and update the
   `your-site.example` links inside the two edge functions to your real URL.

### Notes on behavior

- **Reminder timing**: "an hour and thirty minutes before" is implemented as
  two nudges — one at 60 minutes and one at 30 minutes before start. To make
  it a single 90-minute reminder instead, change `OFFSETS_MINUTES` in
  `supabase/functions/event-reminders/index.ts` to `[90]`.
- **Who sees spot counts**: only volunteers and the admin — enforced by RLS
  on `volunteer_signups`, not just hidden in the UI.
- **Capacity**: enforced by a locking trigger in Postgres; two volunteers
  racing for the last spot can't both get it.
- Email and text delivery honor the per-user notification settings
  (`weekly_digest`, `class_reminders`, `text_notifications`). Text reminders
  require the Twilio secrets above; phone numbers and opt-in state are stored
  on the user's protected profile row.
