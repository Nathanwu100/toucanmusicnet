begin;

-- ================================================== class time blocks
-- A class is a window of time taught for one or more instruments. Inside it,
-- an admin lays out time blocks: each belongs to ONE instrument and has a
-- name, so a class reads as a column per instrument with a run of named slots
-- down each one.
--
--   Saturday class, 3:00-5:00, violin + piano
--     violin            piano
--     Beginners  3:00   Beginners  3:00
--     Grade 2    3:30   Grade 2    3:30
--
-- Blocks are optional. A class with none keeps working exactly as before:
-- whole-class capacity, whole-class enrolment. Adding blocks switches that
-- class over, and nothing already stored has to change.

create table if not exists public.class_time_blocks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.events (id) on delete cascade,
  -- Which column this block sits in. Must be one the class actually teaches;
  -- the trigger below enforces that against events.instruments.
  instrument text not null references public.instruments (slug),
  label text not null default 'Session',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null default 4 check (capacity > 0),
  created_at timestamptz not null default now(),
  constraint class_time_blocks_order check (ends_at > starts_at)
);

create index if not exists class_time_blocks_class_idx
  on public.class_time_blocks (class_id, instrument, starts_at);

-- Which block an enrolment is for. Null means the class has no blocks, which
-- is what every enrolment written before this migration looks like.
alter table public.student_enrollments
  add column if not exists block_id uuid references public.class_time_blocks (id) on delete cascade;

create index if not exists student_enrollments_block_idx
  on public.student_enrollments (block_id) where block_id is not null;

-- A block has to belong to a class, sit inside that class's own window, and
-- be for an instrument the class teaches. Without this an admin could park a
-- viola block at 3am inside a piano-only class and the calendar would show it.
create or replace function public.enforce_block_within_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.events%rowtype;
begin
  select * into parent from public.events where id = new.class_id;
  if parent.id is null then
    raise exception 'That class does not exist.';
  end if;
  if parent.event_type <> 'class' then
    raise exception 'Only classes can be divided into time blocks.';
  end if;
  if not (new.instrument = any (parent.instruments)) then
    raise exception 'This class does not teach %, so it cannot hold a % block.',
      new.instrument, new.instrument;
  end if;
  if new.starts_at < parent.starts_at
     or new.ends_at > coalesce(parent.ends_at, parent.starts_at + interval '12 hours') then
    raise exception 'A time block has to sit inside its class, which runs % to %.',
      parent.starts_at, coalesce(parent.ends_at, parent.starts_at + interval '12 hours');
  end if;
  return new;
end;
$$;

drop trigger if exists class_time_blocks_within_class on public.class_time_blocks;
create trigger class_time_blocks_within_class
  before insert or update on public.class_time_blocks
  for each row execute function public.enforce_block_within_class();

-- Removing a block that people are booked into would silently drop their
-- places, so it is refused the same way deleting an enrolled class is.
create or replace function public.guard_block_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booked int;
begin
  select count(*) into booked
  from public.student_enrollments se
  where se.block_id = old.id and se.status = 'active';
  if booked > 0 then
    raise exception 'This time block has % student% booked in. They have to leave it first.',
      booked, case when booked = 1 then '' else 's' end;
  end if;
  return old;
end;
$$;

drop trigger if exists class_time_blocks_guard_delete on public.class_time_blocks;
create trigger class_time_blocks_guard_delete
  before delete on public.class_time_blocks
  for each row execute function public.guard_block_deletion();

alter table public.class_time_blocks enable row level security;

-- The schedule is public, so the blocks in it are too.
drop policy if exists "anyone reads time blocks" on public.class_time_blocks;
create policy "anyone reads time blocks" on public.class_time_blocks
  for select to anon, authenticated using (true);

drop policy if exists "admin creates time blocks" on public.class_time_blocks;
create policy "admin creates time blocks" on public.class_time_blocks
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "admin updates time blocks" on public.class_time_blocks;
create policy "admin updates time blocks" on public.class_time_blocks
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin deletes time blocks" on public.class_time_blocks;
create policy "admin deletes time blocks" on public.class_time_blocks
  for delete to authenticated using ((select public.is_admin()));

grant select on public.class_time_blocks to anon, authenticated;
grant insert, update, delete on public.class_time_blocks to authenticated;

-- ------------------------------------------------------------------ listing
-- Blocks ride along with the event that owns them, so the calendar still
-- makes one call. Each carries its instrument, its name, its own capacity,
-- and how much of that capacity is gone.
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
  is_enrolled boolean,
  blocks jsonb
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
    -- auth.uid() is null for a signed-out caller, so this matches nothing and
    -- yields false rather than null.
    exists (
      select 1 from public.student_enrollments mine
      where mine.class_id = e.id
        and mine.student_id = auth.uid()
        and mine.status = 'active'
    ) as is_enrolled,
    coalesce(blocks.list, '[]'::jsonb) as blocks
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
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'instrument', b.instrument,
        'instrument_name', bi.name,
        'label', b.label,
        'starts_at', b.starts_at,
        'ends_at', b.ends_at,
        'capacity', b.capacity,
        'taken', taken.n,
        'spots_left', greatest(b.capacity - taken.n::int, 0),
        -- Only ever true for the caller's own enrolment; nobody learns who
        -- else is in a block from this.
        'is_mine', exists (
          select 1 from public.student_enrollments m
          where m.block_id = b.id and m.student_id = auth.uid() and m.status = 'active'
        )
      ) order by bi.sort_order, b.starts_at
    ) as list
    from public.class_time_blocks b
    join public.instruments bi on bi.slug = b.instrument
    cross join lateral (
      select count(*) as n
      from public.student_enrollments se
      where se.block_id = b.id and se.status = 'active'
    ) taken
    where b.class_id = e.id
  ) blocks
  where requested_instrument is null or requested_instrument = any (e.instruments)
  order by e.starts_at;
$$;

revoke execute on function public.list_visible_events(text) from public;
grant execute on function public.list_visible_events(text) to anon, authenticated;

-- --------------------------------------------------------------- who is in
-- The admin roster. Email lives in auth.users and phone numbers in profiles,
-- and neither is readable by a normal client, so this is the one door to
-- them: security definer, and it refuses anybody who is not an admin.
-- Contact details for a whole class of children are exactly the kind of
-- thing that should have one narrow, audited way out of the database.
drop function if exists public.list_class_roster(uuid);
create function public.list_class_roster(target_class_id uuid)
returns table (
  enrollment_id uuid,
  student_id uuid,
  student_name text,
  email text,
  phone_number text,
  instrument text,
  instrument_name text,
  block_id uuid,
  block_label text,
  block_starts_at timestamptz,
  block_ends_at timestamptz,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can see who is enrolled.';
  end if;

  return query
    select
      se.id, se.student_id, p.full_name, u.email::text, p.phone_number,
      se.instrument, i.name,
      se.block_id, b.label, b.starts_at, b.ends_at,
      se.joined_at
    from public.student_enrollments se
    join public.profiles p on p.id = se.student_id
    left join auth.users u on u.id = se.student_id
    left join public.instruments i on i.slug = se.instrument
    left join public.class_time_blocks b on b.id = se.block_id
    where se.class_id = target_class_id and se.status = 'active'
    order by b.starts_at nulls first, p.full_name;
end;
$$;

revoke execute on function public.list_class_roster(uuid) from public, anon;
grant execute on function public.list_class_roster(uuid) to authenticated;

-- --------------------------------------------------------------- enrolment
-- Takes an optional block. A class that has blocks requires one, and the
-- block has to be in the student's own instrument column. A class without
-- blocks ignores the argument and behaves exactly as it did before.
--
-- #variable_conflict use_column is load-bearing. The OUT parameter class_id
-- puts that name in scope as a PL/pgSQL variable for the whole body, and
-- student_enrollments has a column of the same name. Every other reference is
-- written se.class_id, but the ON CONFLICT inference list below cannot take a
-- table alias, so Postgres saw both and raised 42702 -- "column reference
-- class_id is ambiguous" -- which aborted every join outright. The pragma
-- settles it in favour of the column. Local variables are named so that no
-- other collision exists: slot_capacity rather than capacity, which is a
-- column on class_time_blocks.
drop function if exists public.join_class(uuid);
drop function if exists public.join_class(uuid, uuid);
create function public.join_class(target_class_id uuid, target_block_id uuid default null)
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
    if slot.instrument <> viewer.instrument then
      raise exception 'That time block is for %, not your instrument.', slot.instrument;
    end if;
    if slot.starts_at <= now() then
      raise exception 'That time block has already started.';
    end if;
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

  -- The snapshot records the student's own instrument and the times of the
  -- block they took, so a later edit cannot rewrite what they signed up for.
  insert into public.student_enrollments (
    student_id, class_id, block_id, instrument, time_slot_id,
    class_starts_at, class_ends_at, status, joined_at, left_at, updated_at
  ) values (
    auth.uid(), target.id, slot.id, viewer.instrument, target.time_slot_id,
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

revoke execute on function public.join_class(uuid, uuid) from public, anon;
grant execute on function public.join_class(uuid, uuid) to authenticated;

commit;
