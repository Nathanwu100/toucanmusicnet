begin;

-- The home page's "Coming up" strip shows an illustration on every card. It
-- used to alternate between two drawings; now an admin picks one of the
-- site's default icons per class or event, or leaves it to the page to choose
-- from the type and instruments. The column holds the icon's slug, and the
-- catalog of slugs lives with the pages (js/api.js), since it is the pages
-- that ship the drawings.

alter table public.events
  add column if not exists icon text;

alter table public.events drop constraint if exists events_icon_slug;
alter table public.events add constraint events_icon_slug check (
  icon is null or icon ~ '^[a-z0-9-]{1,40}$'
);

-- ------------------------------------------------------------ public listing
-- Dropped before recreation because the return columns changed: icon rides
-- along with the event.
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
  blocks jsonb,
  icon text
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
    coalesce(blocks.list, '[]'::jsonb) as blocks,
    e.icon
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

commit;
