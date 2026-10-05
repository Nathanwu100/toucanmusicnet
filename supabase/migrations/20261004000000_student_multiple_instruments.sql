begin;

-- A student can now learn more than one instrument. The single
-- profiles.instrument column becomes an instruments text[] array, and every
-- function and policy built on the old column is recreated in array form.
--
-- What a student may *do* follows the list: they can join a class, or take a
-- time block, for any instrument on their account. What they *see* does not
-- change -- the calendar has been public since 20260822. An enrollment still
-- snapshots one instrument: the one of the class's taught instruments the
-- student is actually taking it for (a block's own instrument, or, for a
-- whole-class place, the one named at join time).
--
-- Adding an instrument is always allowed. Removing one is refused while an
-- active enrollment still snapshots it, the same rule that used to guard a
-- change of the single instrument.

-- ------------------------------------------------------ profiles.instruments
alter table public.profiles
  add column if not exists instruments text[] not null default '{}';

update public.profiles
set instruments = array[instrument]
where instrument is not null and instruments = '{}';

-- Everything that read the old column is dropped by name before the column
-- goes, and rebuilt below. The policies are dropped explicitly rather than
-- left to the cascade so a half-applied earlier run cannot leave one behind.
drop policy if exists "create own profile" on public.profiles;
drop policy if exists "role and instrument scoped events" on public.events;
drop function if exists public.current_instrument();
drop function if exists public.update_student_instrument(text);

alter table public.profiles drop column if exists instrument cascade;

create index if not exists profiles_instruments_gin_idx
  on public.profiles using gin (instruments);

-- ----------------------------------------------------------- normalising
-- The same rule enforce_supported_instrument applies to events: every slug
-- must be an active catalog instrument, duplicates collapse, and the result
-- is kept in catalog order. Returns null when anything in the list is not
-- supported, so callers can refuse rather than silently drop it.
create or replace function public.normalize_student_instruments(requested text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  wanted int;
  normalized text[];
begin
  select count(distinct slug) into wanted
  from unnest(coalesce(requested, '{}'::text[])) as slug;
  if wanted = 0 then
    return '{}'::text[];
  end if;
  select array_agg(i.slug order by i.sort_order) into normalized
  from public.instruments i
  where i.active and i.slug = any (requested);
  if normalized is null or cardinality(normalized) <> wanted then
    return null;
  end if;
  return normalized;
end;
$$;

revoke execute on function public.normalize_student_instruments(text[]) from public, anon;
grant execute on function public.normalize_student_instruments(text[]) to authenticated;

-- A profile row can only ever hold supported instruments, in catalog order,
-- and only a student holds any at all.
create or replace function public.enforce_student_instruments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text[];
begin
  if new.role <> 'student' then
    new.instruments := '{}'::text[];
    return new;
  end if;
  normalized := public.normalize_student_instruments(new.instruments);
  if normalized is null then
    raise exception 'Choose supported instruments.';
  end if;
  new.instruments := normalized;
  return new;
end;
$$;

drop trigger if exists enforce_student_instruments on public.profiles;
create trigger enforce_student_instruments
  before insert or update on public.profiles
  for each row execute function public.enforce_student_instruments();

-- Already-stored rows pass through the same normalisation once.
update public.profiles
set instruments = coalesce(public.normalize_student_instruments(instruments), '{}'::text[])
where role = 'student';

update public.profiles set instruments = '{}'::text[] where role <> 'student';

-- ------------------------------------------------------- who plays what
create or replace function public.current_instruments()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(instruments, '{}'::text[]) from public.profiles where id = auth.uid();
$$;

revoke execute on function public.current_instruments() from public, anon;
grant execute on function public.current_instruments() to authenticated;

-- ------------------------------------------------------------- policies
create policy "create own profile" on public.profiles
  for insert to authenticated with check (
    auth.uid() = id
    and (
      (
        role = 'student'
        and cardinality(instruments) > 0
        and not exists (
          select 1 from unnest(instruments) as chosen(slug)
          where not exists (
            select 1 from public.instruments i where i.slug = chosen.slug and i.active
          )
        )
      )
      or (role = 'volunteer' and instruments = '{}'::text[])
    )
  );

create policy "role and instrument scoped events" on public.events
  for select to authenticated using (
    (select public.is_admin())
    or (select public.current_profile_role()) = 'volunteer'
    or (
      (select public.current_profile_role()) = 'student'
      and instruments && (select public.current_instruments())
    )
  );

-- ------------------------------------------------------ first-login profile
-- Signup metadata now carries `instruments` as a JSON array. The old single
-- `instrument` key is still honoured, for an account that signed up before
-- this change and only confirms its email afterwards.
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
  requested_instruments text[];
  requested_phone text;
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

  if requested_role = 'student' then
    if jsonb_typeof(auth_metadata -> 'instruments') = 'array' then
      select coalesce(array_agg(value), '{}'::text[]) into requested_instruments
      from jsonb_array_elements_text(auth_metadata -> 'instruments');
    elsif nullif(auth_metadata ->> 'instrument', '') is not null then
      requested_instruments := array[auth_metadata ->> 'instrument'];
    else
      requested_instruments := '{}'::text[];
    end if;
    requested_instruments := public.normalize_student_instruments(requested_instruments);
  else
    requested_instruments := '{}'::text[];
  end if;

  -- A mobile number may be offered at signup. Accept it only in the exact
  -- shape profiles_phone_number_format allows, so bad metadata cannot fail
  -- the whole insert and lock somebody out of their new account; anything
  -- else is dropped and they can add it in Settings. text_notifications
  -- follows the number, because the constraint pairs them.
  requested_phone := nullif(auth_metadata ->> 'phone_number', '');
  if requested_phone is not null and not (
    left(requested_phone, 1) = '+'
    and substr(requested_phone, 2, 1) <> '0'
    and translate(substr(requested_phone, 2), '0123456789', '') = ''
    and length(requested_phone) between 11 and 16
  ) then
    requested_phone := null;
  end if;

  if requested_role = 'student'
     and (requested_instruments is null or cardinality(requested_instruments) = 0) then
    if auth_created_at >= catalog_created_at then
      raise exception 'Select an instrument to finish creating your student account.';
    end if;
    requested_instruments := '{}'::text[];
  end if;

  insert into public.profiles (id, full_name, role, instruments, phone_number, text_notifications)
  values (
    auth.uid(),
    coalesce(nullif(auth_metadata ->> 'full_name', ''), 'Member'),
    requested_role,
    requested_instruments,
    requested_phone,
    requested_phone is not null
  )
  returning * into existing_profile;
  return existing_profile;
end;
$$;

revoke execute on function public.ensure_current_profile() from public, anon;
grant execute on function public.ensure_current_profile() to authenticated;

-- ------------------------------------------------ changing the instruments
-- The whole intended list, not a diff. Adding is always fine. An instrument
-- an active enrollment still snapshots cannot be dropped: the student leaves
-- or is moved first, exactly as before, and the message names the class.
create or replace function public.update_student_instruments(new_instruments text[])
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.profiles%rowtype;
  updated_profile public.profiles%rowtype;
  normalized text[];
  blocking record;
begin
  if auth.uid() is null then
    raise exception 'Log in to choose your instruments.';
  end if;

  select * into viewer from public.profiles where id = auth.uid() for update;
  if viewer.id is null or viewer.role <> 'student' then
    raise exception 'Only student accounts have selected instruments.';
  end if;

  normalized := public.normalize_student_instruments(new_instruments);
  if normalized is null then
    raise exception 'Choose supported instruments.';
  end if;
  if cardinality(normalized) = 0 then
    raise exception 'Keep at least one instrument on your account.';
  end if;
  if viewer.instruments = normalized then
    return viewer;
  end if;

  select e.title, i.name into blocking
  from public.student_enrollments se
  join public.events e on e.id = se.class_id
  join public.instruments i on i.slug = se.instrument
  where se.student_id = auth.uid()
    and se.status = 'active'
    and not (se.instrument = any (normalized))
  order by se.joined_at
  limit 1;

  if blocking.title is not null then
    raise exception 'Leave or transfer your current class "%" before removing % from your account.',
      blocking.title, blocking.name;
  end if;

  update public.profiles
  set instruments = normalized
  where id = auth.uid()
  returning * into updated_profile;
  return updated_profile;
end;
$$;

revoke execute on function public.update_student_instruments(text[]) from public, anon;
grant execute on function public.update_student_instruments(text[]) to authenticated;

-- ---------------------------------------------------------------- joining
-- A third argument names which of the student's instruments a whole-class
-- place is for, when the class teaches more than one of them. A time block
-- already belongs to one instrument, so for a block it is ignored. Both old
-- signatures go, or PostgREST cannot pick between them.
--
-- #variable_conflict use_column: see the note on the previous version of
-- this function in 20260902000000_class_time_blocks.sql.
drop function if exists public.join_class(uuid);
drop function if exists public.join_class(uuid, uuid);
drop function if exists public.join_class(uuid, uuid, text);
create function public.join_class(
  target_class_id uuid,
  target_block_id uuid default null,
  target_instrument text default null
)
returns table (class_id uuid, block_id uuid, enrollment_id uuid, spots_left int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  viewer public.profiles%rowtype;
  target public.events%rowtype;
  slot public.class_time_blocks%rowtype;
  shared text[];
  chosen_instrument text;
  block_count int;
  taken_count int;
  slot_capacity int;
  slot_starts timestamptz;
  slot_ends timestamptz;
  saved_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in to join a class.';
  end if;

  select * into viewer from public.profiles where id = auth.uid() for update;
  if viewer.id is null or viewer.role <> 'student' then
    raise exception 'Only student accounts can join classes.';
  end if;
  if cardinality(coalesce(viewer.instruments, '{}'::text[])) = 0 then
    raise exception 'Choose an instrument in Settings before joining a class.';
  end if;

  select * into target from public.events where id = target_class_id for update;
  if target.id is null or target.event_type <> 'class' then
    raise exception 'Class not found.';
  end if;

  -- The instruments this student could take the class for, in the class's
  -- own order.
  select coalesce(array_agg(taught order by ordinality), '{}'::text[]) into shared
  from unnest(target.instruments) with ordinality as t(taught, ordinality)
  where taught = any (viewer.instruments);
  if cardinality(shared) = 0 then
    raise exception 'This class does not match any of your instruments.';
  end if;
  if not target.enrollment_open or target.starts_at <= now() then
    raise exception 'This class is not open for enrollment.';
  end if;

  select count(*) into block_count
  from public.class_time_blocks b where b.class_id = target.id;

  if block_count > 0 then
    if target_block_id is null then
      raise exception 'Choose a time block for this class.';
    end if;
    -- Locked so two students cannot take the same last place at once.
    select * into slot from public.class_time_blocks b
    where b.id = target_block_id and b.class_id = target.id for update;
    if slot.id is null then
      raise exception 'That time block is not part of this class.';
    end if;
    if not (slot.instrument = any (viewer.instruments)) then
      raise exception 'That time block is for %, not your instrument.', slot.instrument;
    end if;
    if slot.starts_at <= now() then
      raise exception 'That time block has already started.';
    end if;
    chosen_instrument := slot.instrument;
    slot_capacity := slot.capacity;
    slot_starts := slot.starts_at;
    slot_ends := slot.ends_at;
    select count(*) into taken_count
    from public.student_enrollments se
    where se.block_id = slot.id and se.status = 'active';
  else
    if target_block_id is not null then
      raise exception 'This class is not divided into time blocks.';
    end if;
    if target_instrument is not null then
      if not (target_instrument = any (shared)) then
        raise exception 'You cannot take this class for %.', target_instrument;
      end if;
      chosen_instrument := target_instrument;
    else
      chosen_instrument := shared[1];
    end if;
    slot_capacity := target.student_capacity;
    slot_starts := target.starts_at;
    slot_ends := target.ends_at;
    select count(*) into taken_count
    from public.student_enrollments se
    where se.class_id = target.id and se.status = 'active';
  end if;

  if exists (
    select 1 from public.student_enrollments se
    where se.student_id = auth.uid()
      and se.class_id = target.id
      and se.status = 'active'
  ) then
    raise exception 'You are already enrolled in this class.';
  end if;

  -- Overlap is measured against the block actually being taken, so two
  -- classes in the same hour no longer clash if their blocks do not.
  if exists (
    select 1
    from public.student_enrollments se
    where se.student_id = auth.uid()
      and se.status = 'active'
      and se.class_id <> target.id
      and se.class_starts_at < coalesce(slot_ends, slot_starts + interval '1 hour')
      and coalesce(se.class_ends_at, se.class_starts_at + interval '1 hour') > slot_starts
  ) then
    raise exception 'This class conflicts with another class on your schedule.';
  end if;

  if taken_count >= slot_capacity then
    raise exception 'That time block is full.';
  end if;

  -- The snapshot records the instrument the student is taking this class
  -- for, and the times of the place they took, so a later edit cannot
  -- rewrite what they signed up for.
  insert into public.student_enrollments (
    student_id, class_id, block_id, instrument, time_slot_id,
    class_starts_at, class_ends_at, status, joined_at, left_at, updated_at
  ) values (
    auth.uid(), target.id, slot.id, chosen_instrument, target.time_slot_id,
    slot_starts, slot_ends, 'active', now(), null, now()
  )
  on conflict (student_id, class_id) do update set
    block_id = excluded.block_id,
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

  return query select target.id, slot.id, saved_enrollment_id,
    greatest(slot_capacity - taken_count - 1, 0);
end;
$$;

revoke execute on function public.join_class(uuid, uuid, text) from public, anon;
grant execute on function public.join_class(uuid, uuid, text) to authenticated;

commit;
