-- Toucan Music Project — database schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run: everything is idempotent.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'student' check (role in ('student', 'volunteer', 'admin')),
  weekly_digest boolean not null default true,
  class_reminders boolean not null default true,
  text_notifications boolean not null default false,
  phone_number text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists text_notifications boolean not null default false;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles drop constraint if exists profiles_phone_number_format;
alter table public.profiles add constraint profiles_phone_number_format check (
  phone_number is null or phone_number ~ '^\+[1-9][0-9]{9,14}$'
);
alter table public.profiles drop constraint if exists profiles_text_notification_phone;
alter table public.profiles add constraint profiles_text_notification_phone check (
  not text_notifications or phone_number is not null
);

-- Profiles are created by the site on first login (Supabase no longer
-- allows user-defined triggers on auth.users). The insert policy below
-- clamps self-created roles to student/volunteer, so nobody can make
-- themselves admin; the admin profile is inserted manually (see README).

-- Clean up the old trigger approach if a previous version ran.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Only signed-in users may invoke the role check. The browser uses a
-- publishable key; authorization still happens here against auth.uid().
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------------ events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'class' check (event_type in ('class', 'event')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  volunteer_capacity int not null default 0 check (volunteer_capacity >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- volunteer signups
create table if not exists public.volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, volunteer_id)
);

-- Capacity is enforced here, server-side, so the limit holds no matter
-- what the client does. Rows are locked to avoid two volunteers racing
-- for the last spot.
create or replace function public.enforce_volunteer_capacity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  cap int;
  taken int;
begin
  select volunteer_capacity into cap
  from public.events where id = new.event_id for update;

  if cap is null then
    raise exception 'Event not found.';
  end if;

  select count(*) into taken
  from public.volunteer_signups where event_id = new.event_id;

  if taken >= cap then
    raise exception 'All volunteer spots for this event are filled.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_volunteer_capacity on public.volunteer_signups;
create trigger check_volunteer_capacity
  before insert on public.volunteer_signups
  for each row execute function public.enforce_volunteer_capacity();

-- Dedupe each delivery channel independently so an email failure does not
-- prevent an SMS reminder, or vice versa.
create table if not exists public.reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  offset_minutes int not null,
  channel text not null default 'email' check (channel in ('email', 'sms')),
  sent_at timestamptz not null default now(),
  primary key (event_id, user_id, offset_minutes, channel)
);

alter table public.reminders_sent add column if not exists channel text not null default 'email';
alter table public.reminders_sent drop constraint if exists reminders_sent_channel_check;
alter table public.reminders_sent add constraint reminders_sent_channel_check check (channel in ('email', 'sms'));
alter table public.reminders_sent drop constraint if exists reminders_sent_pkey;
alter table public.reminders_sent add primary key (event_id, user_id, offset_minutes, channel);

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.volunteer_signups enable row level security;
alter table public.reminders_sent enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id or (select public.is_admin()));

-- First-login profile creation; role is clamped so nobody self-registers
-- as admin.
drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles
  for insert to authenticated with check (
    auth.uid() = id and role in ('student', 'volunteer')
  );

drop policy if exists "update own prefs" on public.profiles;
create policy "update own prefs" on public.profiles
  for update to authenticated using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

-- Update only notification fields through a narrow RPC. Keeping the function
-- server-side prevents a client from including role or identity fields.
create or replace function public.update_notification_preferences(
  new_weekly_digest boolean,
  new_class_reminders boolean,
  new_text_notifications boolean,
  new_phone_number text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Log in to update notification settings.';
  end if;

  update public.profiles
  set weekly_digest = new_weekly_digest,
      class_reminders = new_class_reminders,
      text_notifications = new_text_notifications,
      phone_number = new_phone_number
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found.';
  end if;
  return updated_profile;
end;
$$;

revoke execute on function public.update_notification_preferences(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.update_notification_preferences(boolean, boolean, boolean, text) to authenticated;

drop policy if exists "events readable by everyone" on public.events;
create policy "events readable by everyone" on public.events
  for select to anon, authenticated using (true);
drop policy if exists "admin manages events" on public.events;
drop policy if exists "admin creates events" on public.events;
create policy "admin creates events" on public.events
  for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
drop policy if exists "admin updates events" on public.events;
create policy "admin updates events" on public.events
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
drop policy if exists "admin deletes events" on public.events;
create policy "admin deletes events" on public.events
  for delete to authenticated
  using ((select public.is_admin()));

-- Spot counts are for volunteers and the admin only — students can't
-- read the signups table at all.
drop policy if exists "volunteers and admin read signups" on public.volunteer_signups;
create policy "volunteers and admin read signups" on public.volunteer_signups
  for select to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'volunteer'
    )
  );
drop policy if exists "volunteers claim their own spot" on public.volunteer_signups;
create policy "volunteers claim their own spot" on public.volunteer_signups
  for insert to authenticated with check (
    volunteer_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'volunteer'
    )
  );
drop policy if exists "volunteers withdraw their own spot" on public.volunteer_signups;
create policy "volunteers withdraw their own spot" on public.volunteer_signups
  for delete to authenticated using (volunteer_id = auth.uid() or (select public.is_admin()));

-- reminders_sent is written only by the service-role edge functions,
-- which bypass RLS; no user-facing policies needed.
