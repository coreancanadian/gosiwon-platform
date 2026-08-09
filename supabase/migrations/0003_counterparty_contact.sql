-- ============================================================================
-- Counterparty visibility on an inquiry thread.
--
-- The base `profiles` policy is deliberately strict (you may read only your own
-- row). But the two parties on an inquiry must see *something* about each
-- other, and the whole point of the accept/decline flow is that contact details
-- are released only once the host accepts.
--
-- Loosening the table policy would leak phone numbers on every pending inquiry,
-- so instead this SECURITY DEFINER function returns a status-dependent subset:
--   • always: the counterparty's display name
--   • only when status = 'accepted': phone, kakao_id, whatsapp
-- ============================================================================

create or replace function public.get_inquiry_counterparty(p_inquiry_id uuid)
returns table (
  id        uuid,
  full_name text,
  phone     text,
  kakao_id  text,
  whatsapp  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_owner_id  uuid;
  v_status    text;
  v_other_id  uuid;
  v_accepted  boolean;
begin
  select i.tenant_id, i.owner_id, i.status
    into v_tenant_id, v_owner_id, v_status
    from public.inquiries i
   where i.id = p_inquiry_id;

  if v_tenant_id is null then
    return;                          -- no such inquiry
  end if;

  -- Caller must be one of the two parties.
  if auth.uid() is null or auth.uid() not in (v_tenant_id, v_owner_id) then
    return;
  end if;

  v_other_id := case
                  when auth.uid() = v_owner_id then v_tenant_id
                  else v_owner_id
                end;
  v_accepted := (v_status = 'accepted');

  return query
    select p.id,
           p.full_name,
           case when v_accepted then p.phone    end,
           case when v_accepted then p.kakao_id end,
           case when v_accepted then p.whatsapp end
      from public.profiles p
     where p.id = v_other_id;
end;
$$;

-- SECURITY DEFINER bypasses RLS, so lock execution to signed-in users.
revoke all on function public.get_inquiry_counterparty(uuid) from public, anon;
grant execute on function public.get_inquiry_counterparty(uuid) to authenticated;
