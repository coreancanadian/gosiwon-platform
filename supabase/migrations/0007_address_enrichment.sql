-- ============================================================================
-- Address enrichment from Kakao Local place search.
--
-- The source spreadsheets only give a district ("서울 서대문구 홍제동"), which is
-- too coarse to put a pin on a building. Searching Kakao by business name
-- within that district returns the road address, precise coordinates, the
-- listed phone number, and a canonical place id.
--
-- The original district string is preserved so a bad match is always reversible.
-- ============================================================================

alter table public.properties
  add column if not exists address_original text,
  add column if not exists road_address     text,
  add column if not exists jibun_address    text,
  add column if not exists address_source   text not null default 'import'
    check (address_source in ('import', 'kakao_place', 'manual')),
  add column if not exists address_verified_at timestamptz,
  -- Kakao's canonical place id; makes re-enrichment idempotent and lets us
  -- link out to the place page.
  add column if not exists kakao_place_id  text,
  add column if not exists kakao_place_url text,
  -- Publicly listed business phone. Distinct from profiles.phone, which is a
  -- registered user's own contact detail.
  add column if not exists listing_phone   text;

comment on column public.properties.address_original is
  'District-level address as imported, kept so an enrichment can be undone';
comment on column public.properties.address_source is
  'import = district only, kakao_place = resolved to a building, manual = host edited';

create index if not exists properties_kakao_place_idx
  on public.properties (kakao_place_id) where kakao_place_id is not null;

create index if not exists properties_address_source_idx
  on public.properties (address_source);

-- Backfill the archive column for rows imported before this migration.
update public.properties
   set address_original = address_ko
 where address_original is null;
