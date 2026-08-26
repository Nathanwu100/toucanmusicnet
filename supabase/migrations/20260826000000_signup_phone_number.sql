begin;

-- A mobile number can now be offered while creating an account, so the
-- profile that signup builds has to carry it through. Everything else about
-- ensure_current_profile is unchanged.
--
-- The number is validated here against the same rule as the
-- profiles_phone_number_format constraint rather than trusted from auth
-- metadata. A malformed value would otherwise raise on insert and leave the
-- account with no profile at all, which is a much worse failure than
-- quietly dropping the number and letting them add it in Settings.

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
  requested_instrument := case when requested_role = 'student' then auth_metadata ->> 'instrument' else null end;

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

  if requested_role = 'student' and not exists (
    select 1 from public.instruments
    where slug = requested_instrument and active
  ) then
    if auth_created_at >= catalog_created_at then
      raise exception 'Select an instrument to finish creating your student account.';
    end if;
    requested_instrument := null;
  end if;

  insert into public.profiles (id, full_name, role, instrument, phone_number, text_notifications)
  values (
    auth.uid(),
    coalesce(nullif(auth_metadata ->> 'full_name', ''), 'Member'),
    requested_role,
    requested_instrument,
    requested_phone,
    requested_phone is not null
  )
  returning * into existing_profile;
  return existing_profile;
end;
$$;
revoke execute on function public.ensure_current_profile() from public, anon;
grant execute on function public.ensure_current_profile() to authenticated;

commit;
