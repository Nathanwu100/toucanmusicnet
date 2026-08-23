begin;

-- The class and event calendar is public: anybody, signed in or not, can read
-- the whole schedule. Enrollment, volunteering, and admin writes stay gated on
-- login by their own policies and functions, which this migration leaves alone.

-- A security-definer listing function can expose aggregate capacity without
-- granting students access to anybody else's enrollment rows. The schedule
-- itself is public, so it returns every event - past and upcoming - to every
-- caller including anonymous visitors; only is_enrolled depends on who asks.
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
  select
    e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
    e.location, e.volunteer_capacity, e.created_by, e.created_at,
    e.instrument, i.name, e.student_capacity, e.enrollment_open,
    e.time_slot_id, counts.active_enrollments,
    greatest(e.student_capacity - counts.active_enrollments::int, 0) as spots_left,
    -- auth.uid() is null for a signed-out caller, so this matches nothing and
    -- yields false rather than null.
    exists (
      select 1 from public.student_enrollments mine
      where mine.class_id = e.id
        and mine.student_id = auth.uid()
        and mine.status = 'active'
    ) as is_enrolled
  from public.events e
  join public.instruments i on i.slug = e.instrument
  cross join lateral (
    select count(*) as active_enrollments
    from public.student_enrollments se
    where se.class_id = e.id and se.status = 'active'
  ) counts
  where requested_instrument is null or e.instrument = requested_instrument
  order by e.starts_at;
$$;

-- Anonymous visitors read the calendar through this function and nothing else,
-- so anon needs execute on it. It returns event columns plus aggregate counts;
-- no profile, enrollment, or contact data leaves the function body.
revoke execute on function public.list_visible_events(text) from public;
grant execute on function public.list_visible_events(text) to anon, authenticated;

-- The events table keeps its authenticated-only select policy on purpose. The
-- public calendar goes through the security-definer function above, so no
-- direct anonymous table read is needed and none is granted. Anonymous access
-- to the instruments catalog already exists from the previous migration.

commit;
