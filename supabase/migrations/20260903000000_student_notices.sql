begin;

-- ============================================== displacing a student
-- Until now an admin who needed to change a class that people had already
-- booked into was simply refused. That is safe but useless: the class still
-- has to change, and refusing only moves the problem to a phone call.
--
-- So the guards come off and the consequence is recorded instead. When a
-- booking is cancelled or moved out from under somebody -- by an admin acting
-- directly, or by a time block being removed or shifted -- a notice is filed
-- for that student. They see it the next time they open the site, told what
-- happened and pointed at the class to pick a new time.

create table if not exists public.student_notices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  -- The class to send them back to. Kept even when the booking is gone, so
  -- the notice can still link somewhere useful.
  class_id uuid references public.events (id) on delete set null,
  kind text not null check (kind in ('removed', 'moved', 'slot_changed')),
  -- What they had, in words, because the block itself may no longer exist.
  previous_slot text,
  new_slot text,
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists student_notices_open_idx
  on public.student_notices (student_id, created_at desc) where resolved_at is null;

alter table public.student_notices enable row level security;

-- A student reads and dismisses their own notices and nobody else's. They are
-- only ever written by the security-definer functions below.
drop policy if exists "students read their own notices" on public.student_notices;
create policy "students read their own notices" on public.student_notices
  for select to authenticated using (student_id = (select auth.uid()));

drop policy if exists "students resolve their own notices" on public.student_notices;
create policy "students resolve their own notices" on public.student_notices
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

grant select, update on public.student_notices to authenticated;

-- A readable description of a booking, for a notice that has to make sense
-- after the block it refers to is gone.
create or replace function public.describe_slot(target_block_id uuid, fallback_class uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select b.label || ' at ' || to_char(b.starts_at at time zone 'UTC', 'FMHH12:MI am')
     from public.class_time_blocks b where b.id = target_block_id),
    (select e.title from public.events e where e.id = fallback_class),
    'a class'
  );
$$;

revoke execute on function public.describe_slot(uuid, uuid) from public, anon;
grant execute on function public.describe_slot(uuid, uuid) to authenticated;

-- ------------------------------------------------- admin removes a student
create or replace function public.admin_cancel_enrollment(target_enrollment_id uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.student_enrollments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove a student from a class.';
  end if;
  select * into row from public.student_enrollments
  where id = target_enrollment_id and status = 'active' for update;
  if row.id is null then
    raise exception 'That enrolment is no longer active.';
  end if;

  update public.student_enrollments
  set status = 'cancelled', left_at = now(), updated_at = now()
  where id = row.id;

  insert into public.student_notices (student_id, class_id, kind, previous_slot, note)
  values (row.student_id, row.class_id, 'removed',
          public.describe_slot(row.block_id, row.class_id), note);
end;
$$;

revoke execute on function public.admin_cancel_enrollment(uuid, text) from public, anon;
grant execute on function public.admin_cancel_enrollment(uuid, text) to authenticated;

-- ---------------------------------------------------- admin moves a student
-- The destination is checked the same way join_class checks it, so an admin
-- cannot put somebody somewhere they could not have booked themselves.
create or replace function public.admin_move_enrollment(
  target_enrollment_id uuid,
  destination_class_id uuid,
  destination_block_id uuid default null,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.student_enrollments%rowtype;
  destination public.events%rowtype;
  slot public.class_time_blocks%rowtype;
  block_count int;
  taken_count int;
  slot_capacity int;
  slot_starts timestamptz;
  slot_ends timestamptz;
  was text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can move a student.';
  end if;
  select * into row from public.student_enrollments
  where id = target_enrollment_id and status = 'active' for update;
  if row.id is null then
    raise exception 'That enrolment is no longer active.';
  end if;

  select * into destination from public.events where id = destination_class_id for update;
  if destination.id is null or destination.event_type <> 'class' then
    raise exception 'That class does not exist.';
  end if;
  if not (row.instrument = any (destination.instruments)) then
    raise exception 'That class does not teach %.', row.instrument;
  end if;

  select count(*) into block_count
  from public.class_time_blocks b where b.class_id = destination.id;

  if block_count > 0 then
    if destination_block_id is null then
      raise exception 'Choose a time block in the new class.';
    end if;
    select * into slot from public.class_time_blocks b
    where b.id = destination_block_id and b.class_id = destination.id for update;
    if slot.id is null then
      raise exception 'That time block is not part of that class.';
    end if;
    if slot.instrument <> row.instrument then
      raise exception 'That time block is for %, not %.', slot.instrument, row.instrument;
    end if;
    slot_capacity := slot.capacity;
    slot_starts := slot.starts_at;
    slot_ends := slot.ends_at;
    select count(*) into taken_count from public.student_enrollments se
    where se.block_id = slot.id and se.status = 'active' and se.id <> row.id;
  else
    if destination_block_id is not null then
      raise exception 'That class is not divided into time blocks.';
    end if;
    slot_capacity := destination.student_capacity;
    slot_starts := destination.starts_at;
    slot_ends := destination.ends_at;
    select count(*) into taken_count from public.student_enrollments se
    where se.class_id = destination.id and se.status = 'active' and se.id <> row.id;
  end if;

  if taken_count >= slot_capacity then
    raise exception 'That slot is already full.';
  end if;
  if destination.id <> row.class_id and exists (
    select 1 from public.student_enrollments se
    where se.student_id = row.student_id and se.class_id = destination.id
      and se.status = 'active' and se.id <> row.id
  ) then
    raise exception 'That student is already enrolled in that class.';
  end if;

  was := public.describe_slot(row.block_id, row.class_id);

  update public.student_enrollments
  set class_id = destination.id,
      block_id = slot.id,
      time_slot_id = destination.time_slot_id,
      class_starts_at = slot_starts,
      class_ends_at = slot_ends,
      updated_at = now()
  where id = row.id;

  -- Being moved is worth telling somebody about even though nothing was lost.
  insert into public.student_notices (student_id, class_id, kind, previous_slot, new_slot, note)
  values (row.student_id, destination.id, 'moved', was,
          public.describe_slot(slot.id, destination.id), note);
end;
$$;

revoke execute on function public.admin_move_enrollment(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.admin_move_enrollment(uuid, uuid, uuid, text) to authenticated;

-- ------------------------------------------- saving a class's time blocks
-- Block editing used to be direct table writes from the browser, which meant
-- guard_block_deletion had to refuse any removal that would strand a student.
-- It goes through here instead, so a removed or shifted block displaces the
-- people in it and files them a notice rather than blocking the edit.
--
-- `blocks` is the full intended set for the class: rows with an id are kept
-- and updated, rows without one are new, and anything missing is removed.
create or replace function public.save_class_blocks(target_class_id uuid, blocks jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.events%rowtype;
  incoming uuid[];
  gone record;
  changed record;
  item jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change a class timetable.';
  end if;
  select * into parent from public.events where id = target_class_id for update;
  if parent.id is null then
    raise exception 'That class does not exist.';
  end if;

  select coalesce(array_agg((value ->> 'id')::uuid), '{}')
  into incoming
  from jsonb_array_elements(coalesce(blocks, '[]'::jsonb))
  where value ->> 'id' is not null and value ->> 'id' <> '';

  -- Anyone in a block that is about to disappear loses their place and is
  -- told so, rather than the whole edit being refused.
  for gone in
    select se.id as enrollment_id, se.student_id, se.block_id
    from public.student_enrollments se
    join public.class_time_blocks b on b.id = se.block_id
    where b.class_id = parent.id and se.status = 'active' and not (b.id = any (incoming))
  loop
    update public.student_enrollments
    set status = 'cancelled', left_at = now(), updated_at = now()
    where id = gone.enrollment_id;
    insert into public.student_notices (student_id, class_id, kind, previous_slot, note)
    values (gone.student_id, parent.id, 'slot_changed',
            public.describe_slot(gone.block_id, parent.id),
            'That time block was removed from the class.');
  end loop;

  delete from public.class_time_blocks b
  where b.class_id = parent.id and not (b.id = any (incoming));

  for item in select value from jsonb_array_elements(coalesce(blocks, '[]'::jsonb))
  loop
    if item ->> 'id' is null or item ->> 'id' = '' then
      insert into public.class_time_blocks (class_id, instrument, label, starts_at, ends_at, capacity)
      values (
        parent.id,
        item ->> 'instrument',
        coalesce(nullif(item ->> 'label', ''), 'Session'),
        (item ->> 'starts_at')::timestamptz,
        (item ->> 'ends_at')::timestamptz,
        coalesce((item ->> 'capacity')::int, 4)
      );
    else
      update public.class_time_blocks b
      set instrument = item ->> 'instrument',
          label = coalesce(nullif(item ->> 'label', ''), 'Session'),
          starts_at = (item ->> 'starts_at')::timestamptz,
          ends_at = (item ->> 'ends_at')::timestamptz,
          capacity = coalesce((item ->> 'capacity')::int, 4)
      where b.id = (item ->> 'id')::uuid and b.class_id = parent.id;
    end if;
  end loop;

  -- A block that moved in time, or to another instrument, is no longer the
  -- thing anybody signed up for. Their snapshot is corrected and they are
  -- told, so nobody turns up at the old hour.
  for changed in
    select se.id as enrollment_id, se.student_id, b.id as block_id,
           b.starts_at, b.ends_at, b.instrument
    from public.student_enrollments se
    join public.class_time_blocks b on b.id = se.block_id
    where b.class_id = parent.id and se.status = 'active'
      and (se.class_starts_at <> b.starts_at
        or se.class_ends_at is distinct from b.ends_at
        or se.instrument <> b.instrument)
  loop
    if changed.instrument <> (
      select se.instrument from public.student_enrollments se where se.id = changed.enrollment_id
    ) then
      -- The block now belongs to a different instrument, so the student
      -- cannot stay in it at all.
      update public.student_enrollments
      set status = 'cancelled', left_at = now(), updated_at = now()
      where id = changed.enrollment_id;
      insert into public.student_notices (student_id, class_id, kind, previous_slot, note)
      values (changed.student_id, parent.id, 'slot_changed',
              public.describe_slot(changed.block_id, parent.id),
              'That time block was moved to a different instrument.');
    else
      update public.student_enrollments
      set class_starts_at = changed.starts_at,
          class_ends_at = changed.ends_at,
          updated_at = now()
      where id = changed.enrollment_id;
      insert into public.student_notices (student_id, class_id, kind, previous_slot, new_slot, note)
      values (changed.student_id, parent.id, 'slot_changed',
              null, public.describe_slot(changed.block_id, parent.id),
              'That time block moved to a new time.');
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_class_blocks(uuid, jsonb) from public, anon;
grant execute on function public.save_class_blocks(uuid, jsonb) to authenticated;

-- The trigger stays as a backstop for anyone deleting a block by hand, but
-- save_class_blocks has already emptied it by the time it fires.
-- ------------------------------------------------------------ the student
create or replace function public.list_my_notices()
returns setof public.student_notices
language sql
stable
security definer
set search_path = public
as $$
  select * from public.student_notices
  where student_id = auth.uid() and resolved_at is null
  order by created_at desc;
$$;

revoke execute on function public.list_my_notices() from public, anon;
grant execute on function public.list_my_notices() to authenticated;

commit;
