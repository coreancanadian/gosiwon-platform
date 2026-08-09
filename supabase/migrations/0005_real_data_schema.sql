-- ============================================================================
-- Adjustments to fit the real source spreadsheets.
--
-- The source data describes each listing as ONE row with a min/max monthly rent
-- range rather than per-room pricing, and carries a facility vocabulary roughly
-- three times larger than the initial seed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Property types actually present in the data.
--    원룸텔 and 코리빙하우스 are distinct products in the Korean market, not
--    synonyms for 고시원, so they get their own values rather than being
--    flattened on import.
-- ---------------------------------------------------------------------------
alter table public.properties
  drop constraint if exists properties_property_type_check;

alter table public.properties
  add constraint properties_property_type_check
  check (property_type in (
    'gosiwon',      -- 고시원
    'oneroomtel',   -- 원룸텔
    'share_house',  -- 쉐어하우스
    'coliving',     -- 코리빙하우스
    'one_room',     -- 원･투룸
    'officetel',    -- 오피스텔
    'dormitory'     -- 기숙사
  ));

-- ---------------------------------------------------------------------------
-- 1b. The distinction renters actually shop on: do I get my own room, or am I
--     sharing a house with other people?
--
--     고시원/원룸텔/원룸/오피스텔 = your own lockable private room (shared
--     kitchen and often shared bathroom, but the room is yours).
--     쉐어하우스/코리빙하우스     = a house shared with housemates.
--
--     Generated + stored so it can never drift from property_type, and can be
--     indexed for the search filter.
-- ---------------------------------------------------------------------------
alter table public.properties
  drop column if exists housing_category;

alter table public.properties
  add column housing_category text
  generated always as (
    case
      when property_type in ('share_house', 'coliving') then 'shared'
      when property_type = 'dormitory'                  then 'shared'
      else 'private'
    end
  ) stored;

create index if not exists properties_housing_category_idx
  on public.properties (housing_category) where is_published;

-- ---------------------------------------------------------------------------
-- 2. Import bookkeeping and fields the source carries that we want to keep.
-- ---------------------------------------------------------------------------

-- 아이디 from the source sheets. Makes re-import idempotent: the same listing
-- updates in place instead of duplicating.
alter table public.properties
  add column if not exists external_id text;

create unique index if not exists properties_external_id_idx
  on public.properties (external_id)
  where external_id is not null;

-- 근처 대학교 — a primary way this audience searches for 고시원.
alter table public.properties
  add column if not exists nearby_universities text[] not null default '{}';

-- 소개영상 — most listings carry a YouTube walkthrough.
alter table public.properties
  add column if not exists video_url text;

-- 건물형태 (단독건물 / 상가건물 / 빌라·연립 / 단독주택)
alter table public.properties
  add column if not exists building_type text;

create index if not exists properties_universities_idx
  on public.properties using gin (nearby_universities);

-- ---------------------------------------------------------------------------
-- 3. Facility vocabulary observed in the source files.
--    Existing slugs are reused where they already match; these are the additions.
-- ---------------------------------------------------------------------------
insert into public.amenities (slug, name_ko, name_en, category, icon, sort_order) values
  -- living
  ('iptv',            'IPTV',        'IPTV',                 'living',  'tv',            11),
  ('aircon-shared',   '공용에어컨',  'Shared AC',            'living',  'wind',          12),
  ('air-purifier',    '공기청정기',  'Air Purifier',         'living',  'wind',          13),
  ('sofa',            '소파',        'Sofa',                 'living',  'sofa',          14),

  -- safety
  ('sprinkler',       '스프링쿨러',  'Sprinkler System',     'safety',  'droplets',       6),
  ('secure-entrance', '공동현관',    'Secure Entrance',      'safety',  'door-closed',    7),
  ('intercom',        '인터폰',      'Intercom',             'safety',  'phone-call',     8),
  ('fire-alarm',      '화재경보기',  'Fire Alarm',           'safety',  'bell-ring',      9),
  ('window-bars',     '방범창',      'Security Window Bars', 'safety',  'grid-3x3',      10),

  -- kitchen
  ('rice-cooker',     '전기밥솥',    'Rice Cooker',          'kitchen', 'cooking-pot',   10),
  ('gas-range',       '가스레인지',  'Gas Range',            'kitchen', 'flame',         11),
  ('dining-table',    '식탁',        'Dining Table',         'kitchen', 'utensils',      12),
  ('toaster',         '토스트기',    'Toaster',              'kitchen', 'sandwich',      13),
  ('electric-kettle', '전기포트',    'Electric Kettle',      'kitchen', 'cup-soda',      14),
  ('coffee-machine',  '커피머신',    'Coffee Machine',       'kitchen', 'coffee',        15),
  ('vending-machine', '자판기',      'Vending Machine',      'kitchen', 'cup-soda',      16),

  -- laundry
  ('iron',            '다리미',      'Iron',                 'laundry', 'shirt',          4),

  -- provided (free food and supplies — a real differentiator for 고시원)
  ('kimchi-free',     '김치 무료 제공',   'Free Kimchi',      'provided', 'salad',         6),
  ('seasoning-free',  '조미료 제공',      'Seasoning Provided','provided','soup',          7),
  ('tea-coffee-free', '차·커피 무료 제공','Free Tea & Coffee','provided', 'coffee',        8),
  ('side-dish-free',  '반찬 제공',        'Free Side Dishes', 'provided', 'utensils',      9),
  ('soup-free',       '국 제공',          'Free Soup',        'provided', 'soup',         10),
  ('egg-free',        '계란 제공',        'Free Eggs',        'provided', 'egg',          11),
  ('detergent-free',  '세탁세제 제공',    'Laundry Detergent','provided', 'droplets',     12),
  ('tissue-free',     '휴지 제공',        'Tissue Provided',  'provided', 'scroll',       13),
  ('slippers',        '실내화 제공',      'Indoor Slippers',  'provided', 'footprints',   14),

  -- shared spaces / facilities
  ('shared-toilet',   '공용 화장실', 'Shared Toilet',        'shared',  'toilet',         7),
  ('shared-shower',   '공용 샤워실', 'Shared Shower',        'shared',  'shower-head',    8),
  ('shared-pc',       '공용 PC',     'Shared PC',            'shared',  'monitor',        9),
  ('gym-equipment',   '운동기구',    'Gym Equipment',        'shared',  'dumbbell',      10),
  ('projector',       '프로젝터',    'Projector',            'shared',  'projector',     11),

  -- heating type (mutually exclusive in the source, modelled as flags)
  ('heating-central',  '중앙난방',   'Central Heating',      'living',  'flame',         15),
  ('heating-individual','개별난방',  'Individual Heating',   'living',  'flame',         16),
  ('heating-district', '지역난방',   'District Heating',     'living',  'flame',         17)
on conflict (slug) do nothing;
