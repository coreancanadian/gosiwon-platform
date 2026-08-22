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
