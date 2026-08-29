begin;

-- Joining a class failed outright with:
--   42702: column reference "class_id" is ambiguous
--   It could refer to either a PL/pgSQL variable or a table column.
--
-- join_class declares an OUT parameter called class_id, which puts that name
-- in scope as a variable for the entire function body, and
-- student_enrollments has a column of the same name. Every other reference in
-- the function is written se.class_id, but the ON CONFLICT inference list
-- cannot take a table alias, so Postgres could not tell which one was meant
-- and refused to run the statement at all.
--
-- The function body is unchanged apart from the pragma below, which tells
-- PL/pgSQL that an ambiguous name inside this function refers to the column.
-- class_id is the only name it affects: enrollment_id and spots_left match no
-- column in profiles, events, or student_enrollments.

create or replace function public.join_class(target_class_id uuid)
returns table (class_id uuid, enrollment_id uuid, spots_left int)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT parameter named class_id is a PL/pgSQL variable for the whole body,
-- and student_enrollments has a column of the same name. Everywhere else that
-- column is written se.class_id, but the ON CONFLICT inference list below
-- cannot be table-qualified -- Postgres does not allow an alias there -- so it
-- saw both and raised 42702, "column reference class_id is ambiguous". That
-- aborted every join. This pragma settles it: inside this function an
-- ambiguous name means the column. The only name it applies to is class_id;
-- enrollment_id and spots_left match no column in any table used here.
#variable_conflict use_column
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

commit;
