-- Toucan Music Project - database schema
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

-- Repair legacy rows before installing the checks below: phone numbers that
-- do not match the required +countrycode format are cleared, and text
-- notifications without a phone number on file are switched off. Affected
-- users re-enter their number in Settings.
-- The format rule is written without a regex because the SQL editor's
-- statement splitter mishandles a dollar sign inside a quoted string:
-- a leading +, a nonzero first digit, digits only, 10-15 digits total.
update public.profiles
set phone_number = null
where phone_number is not null
  and not (
    left(phone_number, 1) = '+'
    and substr(phone_number, 2, 1) <> '0'
    and translate(substr(phone_number, 2), '0123456789', '') = ''
    and length(phone_number) between 11 and 16
  );
update public.profiles
set text_notifications = false
where text_notifications and phone_number is null;

alter table public.profiles drop constraint if exists profiles_phone_number_format;
alter table public.profiles add constraint profiles_phone_number_format check (
  phone_number is null or (
    left(phone_number, 1) = '+'
    and substr(phone_number, 2, 1) <> '0'
    and translate(substr(phone_number, 2), '0123456789', '') = ''
    and length(phone_number) between 11 and 16
  )
);
alter table public.profiles drop constraint if exists profiles_text_notification_phone;
alter table public.profiles add constraint profiles_text_notification_phone check (
  not text_notifications or phone_number is not null
);

-- Profiles are created by the narrow ensure_current_profile RPC defined
-- below (Supabase no longer allows user-defined triggers on auth.users).
-- The final insert policy still clamps direct self-creation so nobody can
-- make themselves admin; the admin profile is inserted manually (README).

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

-- The final first-login creation policy is defined after instruments below.
drop policy if exists "create own profile" on public.profiles;

drop policy if exists "update own prefs" on public.profiles;

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
-- The final role/instrument-scoped select policy is defined below.
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

-- Spot counts are for volunteers and the admin only - students can't
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

-- ================================================= student instruments/classes
-- This section is also shipped as the incremental migration in
-- supabase/migrations/20260718000000_student_instruments_and_enrollment.sql.

-- Toucan's existing schedule uses three program tracks: strings (violin and
-- cello), percussion, and voice. Keeping them in a lookup table gives signup
-- and admin forms one canonical, database-validated source of truth.
create table if not exists public.instruments (
  slug text primary key check (
    slug ~ '^[a-z]'
    and translate(slug, 'abcdefghijklmnopqrstuvwxyz0123456789-', '') = ''
  ),
  name text not null unique,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.instruments (slug, name, description, sort_order)
values
  ('strings', 'Strings', 'Violin and cello classes', 10),
  ('percussion', 'Percussion', 'Rhythm, drums, and hand percussion', 20),
  ('voice', 'Voice', 'Singing and chorus classes', 30),
  ('violin', 'Violin', 'Dedicated violin technique and repertoire', 40),
  ('piano', 'Piano', 'Piano and keyboard classes', 50),
  ('viola', 'Viola', 'Dedicated viola technique and ensemble playing', 60)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

alter table public.profiles
  add column if not exists instrument text references public.instruments (slug);

alter table public.events
  add column if not exists instrument text references public.instruments (slug);
alter table public.events
  add column if not exists student_capacity int not null default 12;
alter table public.events
  add column if not exists enrollment_open boolean not null default true;
alter table public.events
  add column if not exists time_slot_id uuid not null default gen_random_uuid();

-- Legacy records did not have an instrument. Match the program language that
-- was already used by the site. Unmatched general events are assigned to the
-- Strings track so no row is left publicly unscoped; admins should review
-- those records after applying the migration.
update public.events
set instrument = case
  when concat_ws(' ', title, description) ~* '(percussion|rhythm|drum)' then 'percussion'
  when concat_ws(' ', title, description) ~* '(voice|chorus|sing)' then 'voice'
  else 'strings'
end
where instrument is null;

update public.events
set student_capacity = 0,
    enrollment_open = false
where event_type <> 'class';

alter table public.events alter column instrument set not null;
alter table public.events drop constraint if exists events_student_capacity_check;
alter table public.events add constraint events_student_capacity_check check (
  (event_type = 'class' and student_capacity > 0)
  or (event_type = 'event' and student_capacity >= 0)
);
-- Legacy rows with an end time at or before the start become open-ended so
-- the check below can be installed; the site already treats a null end as a
-- one-hour default.
update public.events
set ends_at = null
where ends_at is not null and ends_at <= starts_at;

alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start check (
  ends_at is null or ends_at > starts_at
);

create unique index if not exists events_time_slot_id_uidx
  on public.events (time_slot_id);
create index if not exists events_instrument_starts_at_idx
  on public.events (instrument, starts_at);

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.events (id) on delete cascade,
  instrument text not null references public.instruments (slug),
  time_slot_id uuid not null references public.events (time_slot_id) on delete cascade,
  class_starts_at timestamptz not null,
  class_ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, class_id),
  check ((status = 'active' and left_at is null) or status = 'cancelled'),
  check (class_ends_at is null or class_ends_at > class_starts_at)
);

create index if not exists student_enrollments_student_status_idx
  on public.student_enrollments (student_id, status);
create index if not exists student_enrollments_class_status_idx
  on public.student_enrollments (class_id, status);
create index if not exists student_enrollments_instrument_idx
  on public.student_enrollments (instrument);
create index if not exists student_enrollments_time_slot_idx
  on public.student_enrollments (time_slot_id);

create or replace function public.current_profile_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_instrument()
returns text
language sql stable security definer set search_path = public
as $$
  select instrument from public.profiles where id = auth.uid();
$$;

revoke execute on function public.current_profile_role() from public, anon;
revoke execute on function public.current_instrument() from public, anon;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_instrument() to authenticated;

-- Create a missing profile from trusted auth metadata. New accounts (created
-- after the instrument catalog was installed) must carry a valid student
-- instrument. Older auth users may be created with a null instrument so the
-- Settings requirement can repair them safely at next login.
create or replace function public.ensure_current_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile public.profiles%rowtype;
  auth_metadata jsonb;
  auth_created_at timestamptz;
  catalog_created_at timestamptz;
  requested_role text;
  requested_instrument text;
begin
  if auth.uid() is null then
    raise exception 'Log in to create a profile.';
  end if;
  select * into existing_profile from public.profiles where id = auth.uid();
  if existing_profile.id is not null then
    return existing_profile;
  end if;

  select raw_user_meta_data, created_at
  into auth_metadata, auth_created_at
  from auth.users
  where id = auth.uid();
  if auth_created_at is null then
    raise exception 'Authenticated user not found.';
  end if;

  select min(created_at) into catalog_created_at from public.instruments;
  requested_role := case when auth_metadata ->> 'role' = 'volunteer' then 'volunteer' else 'student' end;
  requested_instrument := case when requested_role = 'student' then auth_metadata ->> 'instrument' else null end;

  if requested_role = 'student' and not exists (
    select 1 from public.instruments
    where slug = requested_instrument and active
  ) then
    if auth_created_at >= catalog_created_at then
      raise exception 'Select an instrument to finish creating your student account.';
    end if;
    requested_instrument := null;
  end if;

  insert into public.profiles (id, full_name, role, instrument)
  values (
    auth.uid(),
    coalesce(nullif(auth_metadata ->> 'full_name', ''), 'Member'),
    requested_role,
    requested_instrument
  )
  returning * into existing_profile;
  return existing_profile;
end;
$$;

revoke execute on function public.ensure_current_profile() from public, anon;
grant execute on function public.ensure_current_profile() to authenticated;

-- Students cannot change instruments while an active class enrollment still
-- snapshots their old instrument and time slot. They must leave (or use a
-- future explicit transfer process) first.
create or replace function public.update_student_instrument(new_instrument text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.profiles%rowtype;
  updated_profile public.profiles%rowtype;
  blocking_class text;
begin
  if auth.uid() is null then
    raise exception 'Log in to choose an instrument.';
  end if;

  select * into viewer from public.profiles where id = auth.uid() for update;
  if viewer.id is null or viewer.role <> 'student' then
    raise exception 'Only student accounts have a selected instrument.';
  end if;
  if not exists (
    select 1 from public.instruments where slug = new_instrument and active
  ) then
    raise exception 'Choose a supported instrument.';
  end if;
  if viewer.instrument is not distinct from new_instrument then
    return viewer;
  end if;

  select e.title into blocking_class
  from public.student_enrollments se
  join public.events e on e.id = se.class_id
  where se.student_id = auth.uid() and se.status = 'active'
  order by se.joined_at
  limit 1;

  if blocking_class is not null then
    raise exception 'Leave or transfer your current class "%" before changing instruments.', blocking_class;
  end if;

  update public.profiles
  set instrument = new_instrument
  where id = auth.uid()
  returning * into updated_profile;
  return updated_profile;
end;
$$;

revoke execute on function public.update_student_instrument(text) from public, anon;
grant execute on function public.update_student_instrument(text) to authenticated;

-- A security-definer listing function can expose aggregate capacity without
-- granting students access to anybody else's enrollment rows. Its role and
-- instrument checks mirror the events RLS policy below.
create or replace function public.list_visible_events(requested_instrument text default null)
returns table (
  id uuid,
  title text,
  description text,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  volunteer_capacity int,
  created_by uuid,
  created_at timestamptz,
  instrument text,
  instrument_name text,
  student_capacity int,
  enrollment_open boolean,
  time_slot_id uuid,
  active_enrollments bigint,
  spots_left int,
  is_enrolled boolean
)
language sql stable
security definer
set search_path = public
as $$
  with viewer as (
    select p.role, p.instrument
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
    e.location, e.volunteer_capacity, e.created_by, e.created_at,
    e.instrument, i.name, e.student_capacity, e.enrollment_open,
    e.time_slot_id, counts.active_enrollments,
    greatest(e.student_capacity - counts.active_enrollments::int, 0) as spots_left,
    exists (
      select 1 from public.student_enrollments mine
      where mine.class_id = e.id
        and mine.student_id = auth.uid()
        and mine.status = 'active'
    ) as is_enrolled
  from public.events e
  join public.instruments i on i.slug = e.instrument
  cross join viewer v
  cross join lateral (
    select count(*) as active_enrollments
    from public.student_enrollments se
    where se.class_id = e.id and se.status = 'active'
  ) counts
  where
    (
      v.role in ('admin', 'volunteer')
      or (v.role = 'student' and v.instrument is not null and e.instrument = v.instrument)
    )
    and (
      requested_instrument is null
      or (v.role in ('admin', 'volunteer') and e.instrument = requested_instrument)
      or v.role = 'student'
    )
  order by e.starts_at;
$$;

revoke execute on function public.list_visible_events(text) from public, anon;
grant execute on function public.list_visible_events(text) to authenticated;

-- The class row lock serializes attempts for the final spot. Eligibility,
-- duplicate detection, schedule-conflict detection, capacity, and insertion
-- all happen inside this single transaction.
create or replace function public.join_class(target_class_id uuid)
returns table (class_id uuid, enrollment_id uuid, spots_left int)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.profiles%rowtype;
  target public.events%rowtype;
  taken int;
  saved_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in to join a class.';
  end if;

  select * into viewer from public.profiles where id = auth.uid() for update;
  if viewer.id is null or viewer.role <> 'student' then
    raise exception 'Only student accounts can join classes.';
  end if;
  if viewer.instrument is null then
    raise exception 'Choose an instrument in Settings before joining a class.';
  end if;

  select * into target from public.events where id = target_class_id for update;
  if target.id is null or target.event_type <> 'class' then
    raise exception 'Class not found.';
  end if;
  if target.instrument <> viewer.instrument then
    raise exception 'This class does not match your selected instrument.';
  end if;
  if not target.enrollment_open or target.starts_at <= now() then
    raise exception 'This class is not open for enrollment.';
  end if;
  if exists (
    select 1 from public.student_enrollments se
    where se.student_id = auth.uid()
      and se.class_id = target.id
      and se.status = 'active'
  ) then
    raise exception 'You are already enrolled in this class.';
  end if;
  if exists (
    select 1
    from public.student_enrollments se
    where se.student_id = auth.uid()
      and se.status = 'active'
      and se.class_id <> target.id
      and se.class_starts_at < coalesce(target.ends_at, target.starts_at + interval '1 hour')
      and coalesce(se.class_ends_at, se.class_starts_at + interval '1 hour') > target.starts_at
  ) then
    raise exception 'This class conflicts with another class on your schedule.';
  end if;

  select count(*) into taken
  from public.student_enrollments se
  where se.class_id = target.id and se.status = 'active';
  if taken >= target.student_capacity then
    raise exception 'Class full.';
  end if;

  insert into public.student_enrollments (
    student_id, class_id, instrument, time_slot_id,
    class_starts_at, class_ends_at, status, joined_at, left_at, updated_at
  ) values (
    auth.uid(), target.id, target.instrument, target.time_slot_id,
    target.starts_at, target.ends_at, 'active', now(), null, now()
  )
  on conflict (student_id, class_id) do update set
    instrument = excluded.instrument,
    time_slot_id = excluded.time_slot_id,
    class_starts_at = excluded.class_starts_at,
    class_ends_at = excluded.class_ends_at,
    status = 'active',
    joined_at = now(),
    left_at = null,
    updated_at = now()
  where public.student_enrollments.status = 'cancelled'
  returning id into saved_enrollment_id;

  if saved_enrollment_id is null then
    raise exception 'You are already enrolled in this class.';
  end if;

  return query select target.id, saved_enrollment_id,
    greatest(target.student_capacity - taken - 1, 0);
end;
$$;

revoke execute on function public.join_class(uuid) from public, anon;
grant execute on function public.join_class(uuid) to authenticated;

create or replace function public.leave_class(target_class_id uuid)
returns table (class_id uuid, spots_left int)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events%rowtype;
  changed uuid;
  taken int;
begin
  if auth.uid() is null then
    raise exception 'Log in to leave a class.';
  end if;
  select * into target from public.events where id = target_class_id for update;
  if target.id is null then
    raise exception 'Class not found.';
  end if;

  update public.student_enrollments as se
  set status = 'cancelled', left_at = now(), updated_at = now()
  where se.student_id = auth.uid() and se.class_id = target.id and se.status = 'active'
  returning id into changed;
  if changed is null then
    raise exception 'You are not enrolled in this class.';
  end if;

  select count(*) into taken
  from public.student_enrollments se
  where se.class_id = target.id and se.status = 'active';
  return query select target.id, greatest(target.student_capacity - taken, 0);
end;
$$;

revoke execute on function public.leave_class(uuid) from public, anon;
grant execute on function public.leave_class(uuid) to authenticated;

create or replace function public.guard_enrolled_class_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
begin
  select count(*) into active_count
  from public.student_enrollments
  where class_id = old.id and status = 'active';

  if tg_op = 'DELETE' then
    if active_count > 0 then
      raise exception 'This class has active student enrollments. Students must leave or transfer before it can be deleted.';
    end if;
    return old;
  end if;

  if new.time_slot_id is distinct from old.time_slot_id then
    raise exception 'A class time-slot identity cannot be replaced.';
  end if;
  if active_count > 0 and (
    new.instrument is distinct from old.instrument
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.event_type is distinct from old.event_type
  ) then
    raise exception 'This class has active student enrollments. Students must leave or transfer before its instrument or time slot can change.';
  end if;
  if active_count > new.student_capacity then
    raise exception 'Student capacity cannot be lower than the active enrollment count (%).', active_count;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_enrolled_class_changes on public.events;
create trigger guard_enrolled_class_changes
  before update or delete on public.events
  for each row execute function public.guard_enrolled_class_changes();

-- --------------------------------------------------------------------- RLS
alter table public.instruments enable row level security;
alter table public.student_enrollments enable row level security;

drop policy if exists "supported instruments are readable" on public.instruments;
create policy "supported instruments are readable" on public.instruments
  for select to anon, authenticated using (active or (select public.is_admin()));

drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles
  for insert to authenticated with check (
    auth.uid() = id
    and (
      (
        role = 'student'
        and instrument is not null
        and exists (
          select 1 from public.instruments i
          where i.slug = instrument and i.active
        )
      )
      or (role = 'volunteer' and instrument is null)
    )
  );

drop policy if exists "events readable by everyone" on public.events;
drop policy if exists "role and instrument scoped events" on public.events;
create policy "role and instrument scoped events" on public.events
  for select to authenticated using (
    (select public.is_admin())
    or (select public.current_profile_role()) = 'volunteer'
    or (
      (select public.current_profile_role()) = 'student'
      and (select public.current_instrument()) is not null
      and instrument = (select public.current_instrument())
    )
  );

drop policy if exists "students read own enrollments and admins read all" on public.student_enrollments;
create policy "students read own enrollments and admins read all" on public.student_enrollments
  for select to authenticated using (
    (student_id = auth.uid() and status = 'active') or (select public.is_admin())
  );

revoke insert, update, delete on public.student_enrollments from anon, authenticated;
grant select on public.student_enrollments to authenticated;
grant select on public.instruments to anon, authenticated;
