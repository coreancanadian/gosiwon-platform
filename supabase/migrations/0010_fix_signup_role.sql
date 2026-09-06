-- handle_new_user() inserted full_name and preferred_locale but silently
-- dropped the role a signer-upper actually picked ("I am: a host listing a
-- property"), leaving every new profile defaulted to 'tenant' regardless.
--
-- raw_user_meta_data is client-supplied at signup, so it is trusted only for
-- 'owner' — never let it grant 'admin'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, preferred_locale, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'preferred_locale', 'ko'),
    case when new.raw_user_meta_data->>'role' = 'owner' then 'owner' else 'tenant' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Repair accounts created before this fix, where the trigger silently
-- dropped the role the signer-upper actually picked.
update public.profiles
set role = 'owner'
where id in (
  '26fd8caf-b32a-42a3-8b84-8c6e299060cc', -- jangjosh12345@gmail.com ("Chrissd")
  'b7c7b1de-2185-42cd-b3df-2ce55cc67ca0'  -- xycology@gmail.com ("과자")
)
and role = 'tenant';

-- Sweep up any other pre-fix signups in the same state: chose "owner" at
-- signup (still on record in their own metadata) but ended up a tenant.
update public.profiles p
set role = 'owner'
from auth.users u
where p.id = u.id
  and p.role = 'tenant'
  and u.raw_user_meta_data->>'role' = 'owner';

-- Rename the aggregator/admin account's display name to match the rebrand.
update public.profiles
set full_name = 'Campusflat'
where id = '9008eebc-cea7-4de7-a820-187778f63472' -- jangjosh@gmail.com
  and full_name = 'Gosiwon Space';
