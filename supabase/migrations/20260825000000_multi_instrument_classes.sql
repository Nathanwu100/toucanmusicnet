begin;

-- Classes and events can now be taught for several instruments at once. The
-- single events.instrument column becomes an instruments text[] array, and
-- every function, trigger, index, and policy built on the old column is
-- recreated in array form. Enrollment snapshots now record the *student's*
-- instrument (one of the class's taught instruments) rather than the class's
-- single track, and the enrollment guard loosens accordingly: an admin may
-- add instruments to a class with active students, but cannot remove an
-- instrument an active enrollment depends on.

-- ------------------------------------------------------- events.instruments
alter table public.events
  add column if not exists instruments text[];

update public.events
set instruments = array[instrument]
where instruments is null and instrument is not null;

-- Rows that somehow still have no instrument at all fall back to the same
-- title matching the original instrument migration used.
update public.events
set instruments = array[case
  when concat_ws(' ', title, description) ~* 'viola' then 'viola'
  when concat_ws(' ', title, description) ~* '(piano|keyboard)' then 'piano'
  else 'violin'
end]
where instruments is null;

alter table public.events alter column instruments set not null;
alter table public.events drop constraint if exists events_instruments_not_empty;
alter table public.events add constraint events_instruments_not_empty check (
  cardinality(instruments) > 0
);

-- Dropping the old column also drops the select policy and index built on
-- it; both are recreated below in array form.
alter table public.events drop column if exists instrument cascade;

create index if not exists events_instruments_gin_idx
  on public.events using gin (instruments);

-- Enrollment snapshots must name an instrument their class still teaches.
-- After the one-to-array conversion above this matches nothing; it only
-- repairs rows a partial earlier run left behind.
update public.student_enrollments se
set instrument = e.instruments[1]
from public.events e
where e.id = se.class_id
  and not (se.instrument = any (e.instruments));

-- ------------------------------------------------------------ public listing
-- Dropped before recreation because the return columns changed: instrument /
-- instrument_name become instruments / instrument_names arrays.
drop function if exists public.list_visible_events(text);
create function public.list_visible_events(requested_instrument text default null)
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
  instruments text[],
  instrument_names text[],
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
  select
    e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
    e.location, e.volunteer_capacity, e.created_by, e.created_at,
    e.instruments, names.instrument_names, e.student_capacity, e.enrollment_open,
    e.time_slot_id, counts.active_enrollments,
    greatest(e.student_capacity - counts.active_enrollments::int, 0) as spots_left,
    exists (
      select 1 from public.student_enrollments mine
      where mine.class_id = e.id
        and mine.student_id = auth.uid()
        and mine.status = 'active'
    ) as is_enrolled
  from public.events e
  cross join lateral (
    -- Same catalog order the enforce_supported_instrument trigger stores the
    -- slugs in, so names[n] labels instruments[n].
    select array_agg(i.name order by i.sort_order) as instrument_names
    from public.instruments i
    where i.slug = any (e.instruments)
  ) names
  cross join lateral (
    select count(*) as active_enrollments
    from public.student_enrollments se
    where se.class_id = e.id and se.status = 'active'
  ) counts
  where requested_instrument is null or requested_instrument = any (e.instruments)
  order by e.starts_at;
$$;

revoke execute on function public.list_visible_events(text) from public;
grant execute on function public.list_visible_events(text) to anon, authenticated;

-- ---------------------------------------------------------------- join_class
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
  if not (viewer.instrument = any (target.instruments)) then
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

  -- The snapshot records the student's own instrument -- the one of the
  -- class's taught instruments they are actually enrolled for.
  insert into public.student_enrollments (
    student_id, class_id, instrument, time_slot_id,
    class_starts_at, class_ends_at, status, joined_at, left_at, updated_at
  ) values (
    auth.uid(), target.id, viewer.instrument, target.time_slot_id,
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

-- ------------------------------------------------------------ event triggers
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
    new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.event_type is distinct from old.event_type
  ) then
    raise exception 'This class has active student enrollments. Students must leave or transfer before its time slot can change.';
  end if;
  -- Instruments may be added freely, but one an active student is enrolled
  -- for cannot be removed out from under them.
  if exists (
    select 1 from public.student_enrollments se
    where se.class_id = old.id
      and se.status = 'active'
      and not (se.instrument = any (new.instruments))
  ) then
    raise exception 'An active student is enrolled for an instrument this class would no longer teach. Students must leave or transfer first.';
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

-- Every listed instrument must be actively supported; the list is also
-- normalized: duplicates collapse and slugs are stored in catalog order.
create or replace function public.enforce_supported_instrument()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested int;
  normalized text[];
begin
  if tg_op = 'UPDATE' and new.instruments is not distinct from old.instruments then
    return new;
  end if;
  select count(distinct slug) into requested from unnest(new.instruments) as slug;
  select array_agg(i.slug order by i.sort_order) into normalized
  from public.instruments i
  where i.active and i.slug = any (new.instruments);
  if requested = 0 or normalized is null or cardinality(normalized) <> requested then
    raise exception 'Choose supported instruments.';
  end if;
  new.instruments := normalized;
  return new;
end;
$$;

drop trigger if exists enforce_supported_instrument on public.events;
create trigger enforce_supported_instrument
  before insert or update on public.events
  for each row execute function public.enforce_supported_instrument();

-- --------------------------------------------------------------------- RLS
-- The old policy was cascade-dropped with the instrument column above.
drop policy if exists "role and instrument scoped events" on public.events;
create policy "role and instrument scoped events" on public.events
  for select to authenticated using (
    (select public.is_admin())
    or (select public.current_profile_role()) = 'volunteer'
    or (
      (select public.current_profile_role()) = 'student'
      and (select public.current_instrument()) is not null
      and (select public.current_instrument()) = any (instruments)
    )
  );

commit;
