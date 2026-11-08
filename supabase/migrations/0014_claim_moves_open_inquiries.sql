-- ============================================================================
-- Approving a claim also hands the listing's open inquiries to the new owner.
--
-- inquiries.owner_id is copied from the listing when the inquiry is made, so
-- until now a renter who asked about a listing before it was claimed stayed
-- with the previous owner (usually the operator), and the real host never saw
-- them.
--
-- Left where they are:
--   * declined/closed inquiries: finished, and the new owner has no need to
--     read them.
--   * inquiries with a stay on record: that tenancy belongs to the previous
--     owner, and stays.owner_id doesn't move.
--   * the claimant's own inquiry, if they asked about this listing themselves:
--     nobody can be both sides of one conversation.
--
-- Same function as migration 0006 otherwise. Written to be re-runnable.
-- ============================================================================
create or replace function public.approve_property_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_claimant_id uuid;
begin
  if not exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only an admin can approve a claim';
  end if;

  select property_id, claimant_id
    into v_property_id, v_claimant_id
    from public.property_claims
   where id = p_claim_id and status = 'pending';

  if v_property_id is null then
    raise exception 'No pending claim with that id';
  end if;

  update public.properties
     set owner_id     = v_claimant_id,
         claim_status = 'claimed',
         updated_at   = now()
   where id = v_property_id;

  update public.inquiries i
     set owner_id = v_claimant_id
   where i.property_id = v_property_id
     and i.status in ('pending', 'accepted')
     and i.tenant_id <> v_claimant_id
     and not exists (select 1 from public.stays s where s.inquiry_id = i.id);

  update public.property_claims
     set status = 'approved', reviewer_id = auth.uid(), reviewed_at = now()
   where id = p_claim_id;

  -- Any competing claims on the same listing lose.
  update public.property_claims
     set status = 'rejected', reviewer_id = auth.uid(), reviewed_at = now()
   where property_id = v_property_id
     and id <> p_claim_id
     and status = 'pending';

  -- Claiming a listing makes you a host.
  update public.profiles
     set role = 'owner'
   where id = v_claimant_id and role = 'tenant';
end;
$$;
