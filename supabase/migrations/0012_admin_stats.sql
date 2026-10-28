-- ============================================================================
-- Operator dashboard numbers: one admin-only call returning everything the
-- overview page shows.
--
-- SECURITY DEFINER because it needs auth.users (confirmation + last sign-in)
-- and rows owned by other people. Guarded by is_admin(), so anyone else gets
-- an error instead of data. Written to be re-runnable.
-- ============================================================================
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),

    'users', (
      select jsonb_build_object(
        'total',        count(*),
        'tenants',      count(*) filter (where p.role = 'tenant'),
        'owners',       count(*) filter (where p.role = 'owner'),
        'admins',       count(*) filter (where p.role = 'admin'),
        'confirmed',    count(*) filter (where u.email_confirmed_at is not null),
        'unconfirmed',  count(*) filter (where u.email_confirmed_at is null),
        'new_24h',      count(*) filter (where u.created_at > now() - interval '1 day'),
        'new_7d',       count(*) filter (where u.created_at > now() - interval '7 days'),
        'new_30d',      count(*) filter (where u.created_at > now() - interval '30 days'),
        'active_7d',    count(*) filter (where u.last_sign_in_at > now() - interval '7 days')
      )
      from auth.users u
      join public.profiles p on p.id = u.id
    ),

    -- One row per Seoul calendar day for the last 30 days, zeros included,
    -- so the chart has no gaps.
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from (
        select generate_series(
                 (now() at time zone 'Asia/Seoul')::date - 29,
                 (now() at time zone 'Asia/Seoul')::date,
                 interval '1 day'
               )::date as day
      ) d
      left join (
        select (u.created_at at time zone 'Asia/Seoul')::date as day, count(*) as n
          from auth.users u
         group by 1
      ) c on c.day = d.day
    ),

    'recent_signups', (
      select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
      from (
        select u.id,
               p.full_name as name,
               u.email,
               p.role,
               u.created_at,
               (u.email_confirmed_at is not null) as confirmed
          from auth.users u
          join public.profiles p on p.id = u.id
         order by u.created_at desc
         limit 10
      ) r
    ),

    'listings', (
      select jsonb_build_object(
        'total',     count(*),
        'published', count(*) filter (where is_published),
        'claimed',   count(*) filter (where claim_status = 'claimed'),
        'pending',   count(*) filter (where claim_status = 'pending'),
        'unclaimed', count(*) filter (where claim_status = 'unclaimed')
      )
      from public.properties
    ),

    'claims_waiting', (
      select count(*) from public.property_claims where status = 'pending'
    ),

    'inquiries', (
      select jsonb_build_object(
        'total',        count(*),
        'pending',      count(*) filter (where i.status = 'pending'),
        'new_7d',       count(*) filter (where i.created_at > now() - interval '7 days'),
        -- Demand nobody is answering yet: the best line for convincing an
        -- operator to claim their listing.
        'on_unclaimed', count(*) filter (where p.claim_status <> 'claimed')
      )
      from public.inquiries i
      join public.properties p on p.id = i.property_id
    ),

    'messages_7d', (
      select count(*) from public.messages where created_at > now() - interval '7 days'
    ),

    'support_unread', (
      select count(*) from public.support_threads where admin_unread
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_platform_stats() from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;
