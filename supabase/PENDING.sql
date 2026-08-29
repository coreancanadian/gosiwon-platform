-- ============================================================================
-- Walking distance to nearby stations.
--
-- In Korea "도보 N분" on a property listing is regulated advertising: the
-- 표시·광고 규정 fix the conversion at 1분 = 80m and require it be based on
-- actual walking distance, not straight-line distance.
--
-- Kakao's category search returns straight-line distance, which is always
-- shorter than the walk — so publishing it directly would systematically
-- overstate how convenient every listing is. We store the raw metres alongside
-- the derived minutes so the claim is auditable and can be recomputed if the
-- estimation method changes.
-- ============================================================================

alter table public.property_subway
  add column if not exists distance_m int check (distance_m >= 0),
  -- 'kakao_sw8' = straight-line from Kakao, converted with a detour factor.
  -- 'manual'    = a host corrected it.
  add column if not exists distance_source text not null default 'kakao_sw8'
    check (distance_source in ('kakao_sw8', 'manual'));

comment on column public.property_subway.distance_m is
  'Straight-line metres from Kakao. walk_minutes derives from this, not vice versa.';
comment on column public.property_subway.walk_minutes is
  'Estimated: straight-line x 1.3 detour factor, at 80m/min, rounded up.';

-- Nearest station first when reading a property's stations.
create index if not exists property_subway_distance_idx
  on public.property_subway (property_id, distance_m);

-- Stations discovered from listing proximity rather than curated for the home
-- page. is_featured stays false so the home-page grid is unaffected.
alter table public.subway_stations
  add column if not exists source text not null default 'seed'
    check (source in ('seed', 'kakao_sw8'));
-- ============================================================================
-- Universities as a first-class way to browse.
--
-- Listings already carry properties.nearby_universities (text[], GIN-indexed)
-- straight from the source's 근처 대학교 column, so matching a listing to a
-- university needs no join table — this is the lookup side: canonical names,
-- slugs for URLs, coordinates for the map, and which ones are featured on the
-- home page.
-- ============================================================================

create table if not exists public.universities (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  -- Must match the string used in properties.nearby_universities exactly, or
  -- the array lookup silently returns nothing.
  name_ko       text not null unique,
  name_en       text not null,
  -- Short label for tiles: 서울대학교 rather than 서울대학교 관악캠퍼스.
  short_name_ko text,
  city_ko       text,
  city_en       text,
  lat           double precision,
  lng           double precision,
  image_url     text,
  -- How many published listings name this university. Drives the top-100
  -- ranking, refreshed by the seeding script.
  listing_count int not null default 0,
  -- Only featured universities appear on the home page grid; the rest stay
  -- searchable.
  is_featured   boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists universities_featured_idx
  on public.universities (is_featured, sort_order);

create index if not exists universities_rank_idx
  on public.universities (listing_count desc);

alter table public.universities enable row level security;

drop policy if exists "universities readable" on public.universities;
create policy "universities readable" on public.universities
  for select using (true);
