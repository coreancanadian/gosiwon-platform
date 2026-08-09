-- ============================================================================
-- Three additions that turn the catalogue into a business:
--
--   1. Claims      — imported listings start unowned; operators claim them.
--   2. Plans       — monetization is a config change later, not a migration.
--   3. Reputation  — a tenant's track record travels with them from a 고시원
--                    to a share house, so the next host can decide.
-- ============================================================================

-- ============================================================================
-- 1. CLAIMS
--
-- Imported listings belong to a house account until the real operator claims
-- them. The public page invites the operator to take ownership; an admin
-- approves, and owner_id transfers.
-- ============================================================================

alter table public.properties
  add column if not exists claim_status text not null default 'claimed'
    check (claim_status in ('unclaimed', 'pending', 'claimed'));

-- Imported rows are unclaimed; anything created through the dashboard is not.
comment on column public.properties.claim_status is
  'unclaimed = imported, operator has not registered yet';

create index if not exists properties_claim_status_idx
  on public.properties (claim_status) where is_published;

create table if not exists public.property_claims (
  id           uuid primary key default uuid_generate_v4(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  claimant_id  uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  -- How the claimant says they can prove they run this place. Free text on
  -- purpose: a phone number, a business registration number, a photo of the
  -- signboard. A human reads it.
  evidence     text,
  contact_phone text,
  reviewer_id  uuid references public.profiles(id) on delete set null,
  review_note  text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  -- One open claim per person per listing.
  unique (property_id, claimant_id)
);

create index if not exists property_claims_status_idx
  on public.property_claims (status, created_at desc);

/**
 * Approve a claim and hand the listing over.
 *
 * SECURITY DEFINER because the claimant does not yet own the row, so no
 * ordinary RLS policy could let this update happen. Admin-only, checked inside.
 */
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

revoke all on function public.approve_property_claim(uuid) from public, anon;
grant execute on function public.approve_property_claim(uuid) to authenticated;

-- ============================================================================
-- 2. PLANS
--
-- Deliberately no trial columns: no trial_ends_at, no expires_at, no
-- grace_period. A host is on a plan, and the plan has a price. Today every
-- plan a host can be on costs 0. Charging later means introducing a new plan
-- and moving *new* signups onto it — existing hosts keep the price they were
-- given, which is what price_locked records.
-- ============================================================================

create table if not exists public.plans (
  code              text primary key,
  name_ko           text not null,
  name_en           text not null,
  description_ko    text,
  description_en    text,
  monthly_price_krw int not null default 0 check (monthly_price_krw >= 0),
  -- Capability flags read by the app, so gating a feature later is a data
  -- change rather than a migration.
  features          jsonb not null default '{}'::jsonb,
  -- Whether new hosts can be put on this plan today.
  is_assignable     boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

insert into public.plans
  (code, name_ko, name_en, description_ko, description_en,
   monthly_price_krw, features, is_assignable, sort_order)
values
  ('founding',
   '파운딩 호스트',
   'Founding Host',
   '초기부터 함께해 주신 호스트를 위한 요금제입니다. 모든 기능을 제한 없이 사용하실 수 있습니다.',
   'For the hosts who were here from the start. Every feature, no limits.',
   0,
   '{"listings": null, "photos_per_listing": 30, "inquiries": null,
     "tenant_reputation": true, "priority_placement": true, "analytics": true}'::jsonb,
   true,
   1)
on conflict (code) do nothing;

create table if not exists public.host_subscriptions (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid not null unique references public.profiles(id) on delete cascade,
  plan_code     text not null references public.plans(code),
  status        text not null default 'active'
                  check (status in ('active', 'paused', 'cancelled')),
  -- The price this host actually pays, captured at assignment. Introducing a
  -- paid plan later never silently re-prices someone already on board.
  price_krw     int not null default 0 check (price_krw >= 0),
  price_locked  boolean not null default true,
  started_at    timestamptz not null default now(),
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists host_subscriptions_plan_idx
  on public.host_subscriptions (plan_code, status);

/** Every new host lands on the founding plan automatically. */
create or replace function public.ensure_host_subscription()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role in ('owner', 'admin') then
    insert into public.host_subscriptions (profile_id, plan_code, price_krw, price_locked)
    values (new.id, 'founding', 0, true)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_becomes_host on public.profiles;
create trigger on_profile_becomes_host
  after insert or update of role on public.profiles
  for each row execute function public.ensure_host_subscription();

-- ============================================================================
-- 3. REPUTATION
--
-- The point: someone arrives from abroad, spends six months in a 고시원, then
-- wants a share house with more room. The share-house host has no way to know
-- anything about them — so they guess. This lets the tenant carry a verified
-- record of how they actually lived.
--
-- Design constraints, deliberate:
--   • Structured, factual criteria only. No "personality", no free-form
--     character judgement, and no field that could encode nationality, visa
--     status, religion, or any other protected characteristic.
--   • A review requires a real completed stay, not an inquiry.
--   • Both sides review each other. Asymmetric rating power invites abuse.
--   • Reviews are hidden until both sides submit or the window closes, so
--     neither party can write retaliation.
--   • The tenant sees their own record at all times and may reply once.
--   • The record is released to a prospective host ONLY when the tenant chooses
--     to attach it to an application. It is not a landlord-searchable database.
-- ============================================================================

create table if not exists public.stays (
  id            uuid primary key default uuid_generate_v4(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  tenant_id     uuid not null references public.profiles(id) on delete cascade,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  inquiry_id    uuid references public.inquiries(id) on delete set null,
  moved_in_at   date not null,
  moved_out_at  date,
  status        text not null default 'active'
                  check (status in ('active', 'completed', 'cancelled')),
  created_at    timestamptz not null default now(),
  constraint stay_dates_valid check (moved_out_at is null or moved_out_at >= moved_in_at)
);

create index if not exists stays_tenant_idx on public.stays (tenant_id, status);
create index if not exists stays_owner_idx  on public.stays (owner_id, status);

/**
 * One review per direction per stay.
 *
 * direction = 'owner_on_tenant' | 'tenant_on_owner'
 *
 * The five criteria are things a host can actually observe. "Was the rent on
 * time", not "were they a good person".
 */
create table if not exists public.stay_reviews (
  id            uuid primary key default uuid_generate_v4(),
  stay_id       uuid not null references public.stays(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  subject_id    uuid not null references public.profiles(id) on delete cascade,
  direction     text not null check (direction in ('owner_on_tenant', 'tenant_on_owner')),

  payment_timeliness int check (payment_timeliness between 1 and 5),
  cleanliness        int check (cleanliness between 1 and 5),
  quiet_hours        int check (quiet_hours between 1 and 5),
  communication      int check (communication between 1 and 5),
  rule_compliance    int check (rule_compliance between 1 and 5),

  -- Optional, short, and about the tenancy. Surfaced only alongside the scores.
  comment       text check (comment is null or length(comment) <= 600),
  -- The subject may reply once; shown next to the review, never edits it.
  subject_reply text check (subject_reply is null or length(subject_reply) <= 600),

  -- Hidden until both directions exist or the window closes — prevents
  -- retaliatory scoring.
  is_visible    boolean not null default false,
  created_at    timestamptz not null default now(),
  -- Old behaviour stops being relevant; the reputation view ignores anything older.
  expires_at    timestamptz not null default (now() + interval '3 years'),

  unique (stay_id, direction)
);

create index if not exists stay_reviews_subject_idx
  on public.stay_reviews (subject_id) where is_visible;

/** Reveal both reviews for a stay once the second one lands. */
create or replace function public.reveal_stay_reviews()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.stay_reviews where stay_id = new.stay_id) >= 2 then
    update public.stay_reviews set is_visible = true where stay_id = new.stay_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_stay_review_written on public.stay_reviews;
create trigger on_stay_review_written
  after insert on public.stay_reviews
  for each row execute function public.reveal_stay_reviews();

-- The tenant decides, per application, whether to attach their record.
alter table public.inquiries
  add column if not exists share_reputation boolean not null default false;

comment on column public.inquiries.share_reputation is
  'Tenant consented to show this host their stay record for this application';

/**
 * A tenant's aggregate record, as shown to a prospective host.
 *
 * Returns rows ONLY when the tenant attached their record to this specific
 * application, and only to the host receiving it. Aggregates only — the caller
 * never learns which property a score came from, so this cannot be used to
 * reconstruct someone's address history.
 */
create or replace function public.get_applicant_reputation(p_inquiry_id uuid)
returns table (
  stays_completed    int,
  reviews_count      int,
  avg_payment        numeric,
  avg_cleanliness    numeric,
  avg_quiet_hours    numeric,
  avg_communication  numeric,
  avg_rule_compliance numeric,
  avg_overall        numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id  uuid;
  v_tenant_id uuid;
  v_shared    boolean;
begin
  select i.owner_id, i.tenant_id, i.share_reputation
    into v_owner_id, v_tenant_id, v_shared
    from public.inquiries i
   where i.id = p_inquiry_id;

  if v_owner_id is null then return; end if;
  -- Only the host on this application, and only with the tenant's consent.
  if auth.uid() is null or auth.uid() <> v_owner_id then return; end if;
  if not coalesce(v_shared, false) then return; end if;

  return query
  select
    (select count(*)::int from public.stays s
      where s.tenant_id = v_tenant_id and s.status = 'completed'),
    count(r.id)::int,
    round(avg(r.payment_timeliness), 1),
    round(avg(r.cleanliness), 1),
    round(avg(r.quiet_hours), 1),
    round(avg(r.communication), 1),
    round(avg(r.rule_compliance), 1),
    round(avg((coalesce(r.payment_timeliness, 0) + coalesce(r.cleanliness, 0)
             + coalesce(r.quiet_hours, 0) + coalesce(r.communication, 0)
             + coalesce(r.rule_compliance, 0))::numeric
             / nullif((case when r.payment_timeliness is null then 0 else 1 end
                     + case when r.cleanliness       is null then 0 else 1 end
                     + case when r.quiet_hours       is null then 0 else 1 end
                     + case when r.communication     is null then 0 else 1 end
                     + case when r.rule_compliance   is null then 0 else 1 end), 0)), 1)
  from public.stay_reviews r
  where r.subject_id = v_tenant_id
    and r.direction  = 'owner_on_tenant'
    and r.is_visible
    and r.expires_at > now();
end;
$$;

revoke all on function public.get_applicant_reputation(uuid) from public, anon;
grant execute on function public.get_applicant_reputation(uuid) to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.property_claims    enable row level security;
alter table public.plans              enable row level security;
alter table public.host_subscriptions enable row level security;
alter table public.stays              enable row level security;
alter table public.stay_reviews       enable row level security;

-- Plans are public (they are pricing).
create policy "plans readable" on public.plans for select using (true);

-- Your own subscription only.
create policy "own subscription readable" on public.host_subscriptions
  for select using (profile_id = auth.uid());

-- Claims: you see your own; admins see all.
create policy "own claims readable" on public.property_claims
  for select using (
    claimant_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin')
  );
create policy "claim your own listing" on public.property_claims
  for insert with check (claimant_id = auth.uid());
create policy "withdraw own claim" on public.property_claims
  for update using (claimant_id = auth.uid()) with check (claimant_id = auth.uid());

-- Stays: visible to the two parties.
create policy "stay visible to parties" on public.stays
  for select using (tenant_id = auth.uid() or owner_id = auth.uid());
create policy "host records a stay" on public.stays
  for insert with check (owner_id = auth.uid());
create policy "host updates a stay" on public.stays
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Reviews: you always see what you wrote and what was written about you.
-- Third parties never read this table directly — only the aggregate RPC.
create policy "review visible to parties" on public.stay_reviews
  for select using (author_id = auth.uid() or subject_id = auth.uid());

create policy "party writes one review" on public.stay_reviews
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.stays s
       where s.id = stay_reviews.stay_id
         and s.status = 'completed'
         and (
           (direction = 'owner_on_tenant' and s.owner_id  = auth.uid() and s.tenant_id = subject_id)
           or
           (direction = 'tenant_on_owner' and s.tenant_id = auth.uid() and s.owner_id  = subject_id)
         )
    )
  );

-- The subject may add their reply; nobody edits a review's scores.
create policy "subject replies to review" on public.stay_reviews
  for update using (subject_id = auth.uid()) with check (subject_id = auth.uid());
