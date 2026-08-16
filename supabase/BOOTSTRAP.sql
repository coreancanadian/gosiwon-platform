-- ============================================================================
--  고시원 스페이스 — full schema bootstrap
--
--  Paste this whole file into the Supabase SQL Editor and press Run.
--  Idempotent: re-running is a no-op, so a partial failure can be re-run
--  safely after fixing the cause.
-- ============================================================================


-- ==========================================================================
-- 0001_init.sql
-- ==========================================================================
-- ============================================================================
-- 고시원 / Shared Housing platform — initial schema
-- Postgres (Supabase). Bilingual KR/EN: *_ko / *_en column pairs.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user. Role decides tenant vs owner capabilities.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            text not null default 'tenant' check (role in ('tenant', 'owner', 'admin')),
  full_name       text,
  phone           text,
  -- Owners often prefer KakaoTalk/WhatsApp over email; surfaced on accepted inquiries only.
  kakao_id        text,
  whatsapp        text,
  preferred_locale text not null default 'ko' check (preferred_locale in ('ko', 'en')),
  created_at      timestamptz not null default now()
);

-- Mirror new auth users into profiles automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, preferred_locale)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'preferred_locale', 'ko')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Regions: the location tiles on the home page.
-- tier drives which grid a region renders in.
-- ---------------------------------------------------------------------------
create table if not exists public.regions (
  id          uuid primary key default uuid_generate_v4(),
  slug        text not null unique,
  name_ko     text not null,
  name_en     text not null,
  -- 'seoul' = 서울 자치구, 'incheon' = 인천 구, 'major_city' = 광역시/주요도시
  tier        text not null check (tier in ('seoul', 'incheon', 'major_city')),
  parent_ko   text,            -- e.g. '서울특별시'
  parent_en   text,
  image_url   text,
  lat         double precision,
  lng         double precision,
  sort_order  int not null default 0
);

-- ---------------------------------------------------------------------------
-- Subway stations: the subway tiles on the home page + per-property proximity.
-- ---------------------------------------------------------------------------
create table if not exists public.subway_stations (
  id          uuid primary key default uuid_generate_v4(),
  slug        text not null unique,
  name_ko     text not null,
  name_en     text not null,
  lines_ko    text[] not null default '{}',
  lines_en    text[] not null default '{}',
  image_url   text,
  lat         double precision,
  lng         double precision,
  -- Only the 10 headline stations show on the home page; the rest are searchable.
  is_featured boolean not null default false,
  sort_order  int not null default 0
);

-- ---------------------------------------------------------------------------
-- Properties: a building. Mirrors the room-room.kr detail layout.
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  slug            text not null unique,

  name_ko         text not null,
  name_en         text,

  -- Korean addresses: 도로명 (road) is canonical, 지번 (lot) kept for legacy matching.
  address_ko      text not null,
  address_en      text,
  address_detail  text,
  postal_code     text,
  region_id       uuid references public.regions(id) on delete set null,
  lat             double precision,
  lng             double precision,

  property_type   text not null default 'gosiwon'
                    check (property_type in ('gosiwon', 'share_house', 'one_room', 'dormitory')),
  gender          text not null default 'any' check (gender in ('any', 'male', 'female')),
  age_min         int check (age_min between 0 and 120),
  age_max         int check (age_max between 0 and 120),
  floors_total    int,
  floors_used     text,          -- free text, e.g. '2~4F'
  languages       text[] not null default '{}',

  description_ko  text,
  description_en  text,

  -- Denormalised for fast list/sort. Kept in sync by trigger below.
  price_min       int,
  price_max       int,

  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint age_range_valid check (age_max is null or age_min is null or age_max >= age_min)
);

create index if not exists properties_region_idx    on public.properties(region_id) where is_published;
create index if not exists properties_geo_idx       on public.properties(lat, lng) where is_published;
create index if not exists properties_owner_idx     on public.properties(owner_id);

-- ---------------------------------------------------------------------------
-- Rooms: a property has many rooms at different prices (ROOM A / B / C).
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id                uuid primary key default uuid_generate_v4(),
  property_id       uuid not null references public.properties(id) on delete cascade,
  name              text not null,
  monthly_rent      int not null check (monthly_rent >= 0),   -- KRW
  deposit           int not null default 0 check (deposit >= 0),
  size_sqm          numeric(6,2),
  min_contract_days int,
  max_contract_days int,                                       -- null = unlimited
  is_available      boolean not null default true,
  sort_order        int not null default 0
);

create index if not exists rooms_property_idx on public.rooms(property_id);

-- ---------------------------------------------------------------------------
-- Amenities: shared vocabulary, grouped into the categories room-room.kr uses.
-- ---------------------------------------------------------------------------
create table if not exists public.amenities (
  id        uuid primary key default uuid_generate_v4(),
  slug      text not null unique,
  name_ko   text not null,
  name_en   text not null,
  category  text not null check (category in
              ('living', 'safety', 'kitchen', 'laundry', 'provided', 'shared')),
  icon      text,
  sort_order int not null default 0
);

create table if not exists public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_id  uuid not null references public.amenities(id) on delete cascade,
  primary key (property_id, amenity_id)
);

create table if not exists public.room_amenities (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  primary key (room_id, amenity_id)
);

-- ---------------------------------------------------------------------------
-- Images: stored in the Supabase 'property-images' bucket; we keep the path.
-- ---------------------------------------------------------------------------
create table if not exists public.property_images (
  id           uuid primary key default uuid_generate_v4(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  room_id      uuid references public.rooms(id) on delete cascade,
  storage_path text not null,
  alt_ko       text,
  alt_en       text,
  is_cover     boolean not null default false,
  sort_order   int not null default 0
);

create index if not exists property_images_property_idx on public.property_images(property_id);
create unique index if not exists property_images_one_cover_idx
  on public.property_images(property_id) where is_cover;

-- Walking distance to nearby stations — drives subway-based search.
create table if not exists public.property_subway (
  property_id  uuid not null references public.properties(id) on delete cascade,
  station_id   uuid not null references public.subway_stations(id) on delete cascade,
  walk_minutes int,
  primary key (property_id, station_id)
);

-- ---------------------------------------------------------------------------
-- Inquiries: a tenant asks about a property; the owner accepts or declines.
-- This is the core of the platform — no realtime booking, just approval.
-- ---------------------------------------------------------------------------
create table if not exists public.inquiries (
  id            uuid primary key default uuid_generate_v4(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  tenant_id     uuid not null references public.profiles(id) on delete cascade,
  -- Denormalised so RLS can authorise the owner without joining properties.
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'closed')),
  move_in_date  date,
  duration_months int,
  intro_message text,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  -- One open inquiry per tenant per property.
  unique (property_id, tenant_id)
);

create index if not exists inquiries_owner_idx  on public.inquiries(owner_id, status);
create index if not exists inquiries_tenant_idx on public.inquiries(tenant_id);

create table if not exists public.messages (
  id          uuid primary key default uuid_generate_v4(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists messages_inquiry_idx on public.messages(inquiry_id, created_at);

-- ---------------------------------------------------------------------------
-- Keep properties.price_min/max in sync with the rooms underneath.
-- ---------------------------------------------------------------------------
create or replace function public.sync_property_price_range()
returns trigger
language plpgsql
as $$
declare
  target_id uuid := coalesce(new.property_id, old.property_id);
begin
  update public.properties p
     set price_min = sub.min_rent,
         price_max = sub.max_rent,
         updated_at = now()
    from (
      select min(monthly_rent) as min_rent, max(monthly_rent) as max_rent
        from public.rooms
       where property_id = target_id and is_available
    ) sub
   where p.id = target_id;
  return null;
end;
$$;

drop trigger if exists rooms_sync_price on public.rooms;
create trigger rooms_sync_price
  after insert or update or delete on public.rooms
  for each row execute function public.sync_property_price_range();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.regions            enable row level security;
alter table public.subway_stations    enable row level security;
alter table public.properties         enable row level security;
alter table public.rooms              enable row level security;
alter table public.amenities          enable row level security;
alter table public.property_amenities enable row level security;
alter table public.room_amenities     enable row level security;
alter table public.property_images    enable row level security;
alter table public.property_subway    enable row level security;
alter table public.inquiries          enable row level security;
alter table public.messages           enable row level security;

-- Reference data is world-readable.
drop policy if exists "regions readable" on public.regions;
create policy "regions readable" on public.regions         for select using (true);
drop policy if exists "stations readable" on public.subway_stations;
create policy "stations readable" on public.subway_stations for select using (true);
drop policy if exists "amenities readable" on public.amenities;
create policy "amenities readable" on public.amenities       for select using (true);

-- Profiles: you can read and edit only your own.
-- (Owner contact details are exposed through an accepted inquiry, not here.)
drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "own profile updatable" on public.profiles;
create policy "own profile updatable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Properties: published ones are public; owners fully control their own.
drop policy if exists "published properties readable" on public.properties;
create policy "published properties readable" on public.properties
  for select using (is_published or owner_id = auth.uid());
drop policy if exists "owner inserts own property" on public.properties;
create policy "owner inserts own property" on public.properties
  for insert with check (owner_id = auth.uid());
drop policy if exists "owner updates own property" on public.properties;
create policy "owner updates own property" on public.properties
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner deletes own property" on public.properties;
create policy "owner deletes own property" on public.properties
  for delete using (owner_id = auth.uid());

-- Child tables inherit visibility from the parent property.
drop policy if exists "rooms readable" on public.rooms;
create policy "rooms readable" on public.rooms
  for select using (exists (
    select 1 from public.properties p
     where p.id = rooms.property_id and (p.is_published or p.owner_id = auth.uid())));
drop policy if exists "owner writes rooms" on public.rooms;
create policy "owner writes rooms" on public.rooms
  for all using (exists (
    select 1 from public.properties p
     where p.id = rooms.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = rooms.property_id and p.owner_id = auth.uid()));

drop policy if exists "images readable" on public.property_images;
create policy "images readable" on public.property_images
  for select using (exists (
    select 1 from public.properties p
     where p.id = property_images.property_id and (p.is_published or p.owner_id = auth.uid())));
drop policy if exists "owner writes images" on public.property_images;
create policy "owner writes images" on public.property_images
  for all using (exists (
    select 1 from public.properties p
     where p.id = property_images.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = property_images.property_id and p.owner_id = auth.uid()));

drop policy if exists "property amenities readable" on public.property_amenities;
create policy "property amenities readable" on public.property_amenities
  for select using (exists (
    select 1 from public.properties p
     where p.id = property_amenities.property_id and (p.is_published or p.owner_id = auth.uid())));
drop policy if exists "owner writes property amenities" on public.property_amenities;
create policy "owner writes property amenities" on public.property_amenities
  for all using (exists (
    select 1 from public.properties p
     where p.id = property_amenities.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = property_amenities.property_id and p.owner_id = auth.uid()));

drop policy if exists "room amenities readable" on public.room_amenities;
create policy "room amenities readable" on public.room_amenities
  for select using (exists (
    select 1 from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.id = room_amenities.room_id and (p.is_published or p.owner_id = auth.uid())));
drop policy if exists "owner writes room amenities" on public.room_amenities;
create policy "owner writes room amenities" on public.room_amenities
  for all using (exists (
    select 1 from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.id = room_amenities.room_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.id = room_amenities.room_id and p.owner_id = auth.uid()));

drop policy if exists "property subway readable" on public.property_subway;
create policy "property subway readable" on public.property_subway
  for select using (true);
drop policy if exists "owner writes property subway" on public.property_subway;
create policy "owner writes property subway" on public.property_subway
  for all using (exists (
    select 1 from public.properties p
     where p.id = property_subway.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = property_subway.property_id and p.owner_id = auth.uid()));

-- Inquiries: visible to the two parties only.
drop policy if exists "inquiry visible to parties" on public.inquiries;
create policy "inquiry visible to parties" on public.inquiries
  for select using (tenant_id = auth.uid() or owner_id = auth.uid());
drop policy if exists "tenant creates inquiry" on public.inquiries;
create policy "tenant creates inquiry" on public.inquiries
  for insert with check (tenant_id = auth.uid());
-- Owners respond (accept/decline); tenants may close their own.
drop policy if exists "parties update inquiry" on public.inquiries;
create policy "parties update inquiry" on public.inquiries
  for update using (owner_id = auth.uid() or tenant_id = auth.uid())
  with check (owner_id = auth.uid() or tenant_id = auth.uid());

-- Messages: readable by either party on the thread; sender must be a party.
drop policy if exists "messages visible to parties" on public.messages;
create policy "messages visible to parties" on public.messages
  for select using (exists (
    select 1 from public.inquiries i
     where i.id = messages.inquiry_id
       and (i.tenant_id = auth.uid() or i.owner_id = auth.uid())));
drop policy if exists "party sends message" on public.messages;
create policy "party sends message" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.inquiries i
       where i.id = messages.inquiry_id
         and (i.tenant_id = auth.uid() or i.owner_id = auth.uid())));
drop policy if exists "sender marks read" on public.messages;
create policy "sender marks read" on public.messages
  for update using (exists (
    select 1 from public.inquiries i
     where i.id = messages.inquiry_id
       and (i.tenant_id = auth.uid() or i.owner_id = auth.uid())));


-- ==========================================================================
-- 0002_seed_reference_data.sql
-- ==========================================================================
-- ============================================================================
-- Reference data: home-page location tiles, subway tiles, amenity vocabulary.
-- Coordinates are district/city centroids — good enough to centre a map.
-- Individual properties get precise coordinates from Kakao geocoding on import.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 10 Seoul districts. Chosen for where 고시원/셰어하우스 demand actually is:
-- university belts (관악/서대문/마포/동작), CBD (종로/중구/영등포),
-- and the Gangnam job centres (강남/서초/송파).
-- ---------------------------------------------------------------------------
insert into public.regions (slug, name_ko, name_en, tier, parent_ko, parent_en, image_url, lat, lng, sort_order) values
  ('gangnam-gu',     '강남구',   'Gangnam-gu',     'seoul', '서울특별시', 'Seoul', '/images/regions/gangnam-gu.jpg',     37.5172, 127.0473,  1),
  ('seocho-gu',      '서초구',   'Seocho-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/seocho-gu.jpg',      37.4837, 127.0324,  2),
  ('songpa-gu',      '송파구',   'Songpa-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/songpa-gu.jpg',      37.5145, 127.1059,  3),
  ('mapo-gu',        '마포구',   'Mapo-gu',        'seoul', '서울특별시', 'Seoul', '/images/regions/mapo-gu.jpg',        37.5638, 126.9084,  4),
  ('seodaemun-gu',   '서대문구', 'Seodaemun-gu',   'seoul', '서울특별시', 'Seoul', '/images/regions/seodaemun-gu.jpg',   37.5791, 126.9368,  5),
  ('gwanak-gu',      '관악구',   'Gwanak-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/gwanak-gu.jpg',      37.4784, 126.9516,  6),
  ('jongno-gu',      '종로구',   'Jongno-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/jongno-gu.jpg',      37.5735, 126.9790,  7),
  ('jung-gu-seoul',  '중구',     'Jung-gu',        'seoul', '서울특별시', 'Seoul', '/images/regions/jung-gu-seoul.jpg',  37.5636, 126.9976,  8),
  ('yeongdeungpo-gu','영등포구', 'Yeongdeungpo-gu','seoul', '서울특별시', 'Seoul', '/images/regions/yeongdeungpo-gu.jpg',37.5264, 126.8962,  9),
  ('dongjak-gu',     '동작구',   'Dongjak-gu',     'seoul', '서울특별시', 'Seoul', '/images/regions/dongjak-gu.jpg',     37.5124, 126.9393, 10)
on conflict (slug) do nothing;

-- 5 Incheon districts
insert into public.regions (slug, name_ko, name_en, tier, parent_ko, parent_en, image_url, lat, lng, sort_order) values
  ('yeonsu-gu',    '연수구',   'Yeonsu-gu',    'incheon', '인천광역시', 'Incheon', '/images/regions/yeonsu-gu.jpg',    37.4101, 126.6784, 1),
  ('namdong-gu',   '남동구',   'Namdong-gu',   'incheon', '인천광역시', 'Incheon', '/images/regions/namdong-gu.jpg',   37.4471, 126.7314, 2),
  ('bupyeong-gu',  '부평구',   'Bupyeong-gu',  'incheon', '인천광역시', 'Incheon', '/images/regions/bupyeong-gu.jpg',  37.5070, 126.7219, 3),
  ('michuhol-gu',  '미추홀구', 'Michuhol-gu',  'incheon', '인천광역시', 'Incheon', '/images/regions/michuhol-gu.jpg',  37.4636, 126.6503, 4),
  ('seo-gu-incheon','서구',    'Seo-gu',       'incheon', '인천광역시', 'Incheon', '/images/regions/seo-gu-incheon.jpg',37.5455, 126.6759, 5)
on conflict (slug) do nothing;

-- 10 other major Korean cities
insert into public.regions (slug, name_ko, name_en, tier, parent_ko, parent_en, image_url, lat, lng, sort_order) values
  ('busan',     '부산광역시', 'Busan',     'major_city', null, null, '/images/regions/busan.jpg',     35.1796, 129.0756,  1),
  ('daegu',     '대구광역시', 'Daegu',     'major_city', null, null, '/images/regions/daegu.jpg',     35.8714, 128.6014,  2),
  ('daejeon',   '대전광역시', 'Daejeon',   'major_city', null, null, '/images/regions/daejeon.jpg',   36.3504, 127.3845,  3),
  ('gwangju',   '광주광역시', 'Gwangju',   'major_city', null, null, '/images/regions/gwangju.jpg',   35.1595, 126.8526,  4),
  ('ulsan',     '울산광역시', 'Ulsan',     'major_city', null, null, '/images/regions/ulsan.jpg',     35.5384, 129.3114,  5),
  ('suwon',     '수원시',     'Suwon',     'major_city', '경기도', 'Gyeonggi-do', '/images/regions/suwon.jpg',     37.2636, 127.0286,  6),
  ('seongnam',  '성남시',     'Seongnam',  'major_city', '경기도', 'Gyeonggi-do', '/images/regions/seongnam.jpg',  37.4200, 127.1267,  7),
  ('goyang',    '고양시',     'Goyang',    'major_city', '경기도', 'Gyeonggi-do', '/images/regions/goyang.jpg',    37.6584, 126.8320,  8),
  ('cheonan',   '천안시',     'Cheonan',   'major_city', '충청남도', 'Chungcheongnam-do', '/images/regions/cheonan.jpg', 36.8151, 127.1139,  9),
  ('cheongju',  '청주시',     'Cheongju',  'major_city', '충청북도', 'Chungcheongbuk-do', '/images/regions/cheongju.jpg', 36.6424, 127.4890, 10)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 10 featured Seoul subway stations.
-- ---------------------------------------------------------------------------
insert into public.subway_stations (slug, name_ko, name_en, lines_ko, lines_en, image_url, lat, lng, is_featured, sort_order) values
  ('gangnam',      '강남역',     'Gangnam',            '{"2호선","신분당선"}',              '{"Line 2","Sinbundang"}',                      '/images/subway/gangnam.jpg',      37.4979, 127.0276, true,  1),
  ('hongik-univ',  '홍대입구역', 'Hongik Univ.',       '{"2호선","공항철도","경의중앙선"}', '{"Line 2","AREX","Gyeongui-Jungang"}',         '/images/subway/hongik-univ.jpg',  37.5572, 126.9245, true,  2),
  ('sinchon',      '신촌역',     'Sinchon',            '{"2호선"}',                          '{"Line 2"}',                                   '/images/subway/sinchon.jpg',      37.5551, 126.9368, true,  3),
  ('seoul-station','서울역',     'Seoul Station',      '{"1호선","4호선","공항철도","경의중앙선"}', '{"Line 1","Line 4","AREX","Gyeongui-Jungang"}', '/images/subway/seoul-station.jpg', 37.5546, 126.9707, true,  4),
  ('jamsil',       '잠실역',     'Jamsil',             '{"2호선","8호선"}',                  '{"Line 2","Line 8"}',                          '/images/subway/jamsil.jpg',       37.5133, 127.1000, true,  5),
  ('konkuk-univ',  '건대입구역', 'Konkuk Univ.',       '{"2호선","7호선"}',                  '{"Line 2","Line 7"}',                          '/images/subway/konkuk-univ.jpg',  37.5405, 127.0700, true,  6),
  ('sillim',       '신림역',     'Sillim',             '{"2호선"}',                          '{"Line 2"}',                                   '/images/subway/sillim.jpg',       37.4842, 126.9296, true,  7),
  ('sadang',       '사당역',     'Sadang',             '{"2호선","4호선"}',                  '{"Line 2","Line 4"}',                          '/images/subway/sadang.jpg',       37.4766, 126.9816, true,  8),
  ('yeouido',      '여의도역',   'Yeouido',            '{"5호선","9호선"}',                  '{"Line 5","Line 9"}',                          '/images/subway/yeouido.jpg',      37.5215, 126.9243, true,  9),
  ('jongno-3ga',   '종로3가역',  'Jongno 3-ga',        '{"1호선","3호선","5호선"}',          '{"Line 1","Line 3","Line 5"}',                 '/images/subway/jongno-3ga.jpg',   37.5704, 126.9917, true, 10)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Amenity vocabulary, grouped the way the reference site groups them.
-- ---------------------------------------------------------------------------
insert into public.amenities (slug, name_ko, name_en, category, icon, sort_order) values
  -- living
  ('bed',            '침대',        'Bed',                'living',  'bed',        1),
  ('desk',           '책상',        'Desk',               'living',  'desk',       2),
  ('chair',          '의자',        'Chair',              'living',  'armchair',   3),
  ('wardrobe',       '옷장',        'Wardrobe',           'living',  'shirt',      4),
  ('wifi',           '와이파이',    'WiFi',               'living',  'wifi',       5),
  ('aircon-private', '개별 에어컨', 'Private AC',         'living',  'wind',       6),
  ('heating',        '난방',        'Heating',            'living',  'flame',      7),
  ('tv',             'TV',          'TV',                 'living',  'tv',         8),
  ('window',         '창문',        'Window',             'living',  'panel-top',  9),
  ('private-bath',   '개인 욕실',   'Private Bathroom',   'living',  'shower-head',10),

  -- safety
  ('cctv',           'CCTV',        'CCTV',               'safety',  'cctv',       1),
  ('door-lock',      '도어락',      'Digital Door Lock',  'safety',  'lock',       2),
  ('fire-equipment', '소방 설비',   'Fire Equipment',     'safety',  'fire-extinguisher', 3),
  ('security-24h',   '24시간 보안', '24h Security',       'safety',  'shield',     4),
  ('female-only-floor','여성 전용 층','Female-only Floor','safety',  'user-check', 5),

  -- kitchen
  ('shared-kitchen', '공용 주방',   'Shared Kitchen',     'kitchen', 'cooking-pot',1),
  ('cooktop',        '인덕션/가스레인지','Cooktop',       'kitchen', 'flame',      2),
  ('microwave',      '전자레인지',  'Microwave',          'kitchen', 'microwave',  3),
  ('fridge-shared',  '공용 냉장고', 'Shared Fridge',      'kitchen', 'refrigerator',4),
  ('fridge-private', '개인 냉장고', 'Private Fridge',     'kitchen', 'refrigerator',5),
  ('water-purifier', '정수기',      'Water Purifier',     'kitchen', 'droplets',   6),
  ('cookware',       '조리도구',    'Cookware',           'kitchen', 'utensils',   7),
  ('rice-free',      '쌀 무료 제공','Free Rice',          'kitchen', 'wheat',      8),
  ('ramen-free',     '라면 무료 제공','Free Ramen',       'kitchen', 'soup',       9),

  -- laundry
  ('washer',         '세탁기',      'Washing Machine',    'laundry', 'washing-machine', 1),
  ('dryer',          '건조기',      'Dryer',              'laundry', 'air-vent',   2),
  ('drying-rack',    '건조대',      'Drying Rack',        'laundry', 'grip',       3),

  -- provided
  ('bedding',        '침구 제공',   'Bedding Provided',   'provided','bed-double', 1),
  ('towels',         '수건 제공',   'Towels Provided',    'provided','bath',       2),
  ('toiletries',     '세면용품',    'Toiletries',         'provided','soap',       3),
  ('cleaning',       '청소 서비스', 'Cleaning Service',   'provided','sparkles',   4),
  ('utilities-incl', '공과금 포함', 'Utilities Included', 'provided','plug',       5),

  -- shared spaces
  ('lounge',         '라운지',      'Lounge',             'shared',  'sofa',       1),
  ('study-room',     '독서실',      'Study Room',         'shared',  'book-open',  2),
  ('rooftop',        '옥상',        'Rooftop',            'shared',  'building',   3),
  ('parking',        '주차장',      'Parking',            'shared',  'car',        4),
  ('elevator',       '엘리베이터',  'Elevator',           'shared',  'move-vertical',5),
  ('bike-storage',   '자전거 보관소','Bike Storage',      'shared',  'bike',       6)
on conflict (slug) do nothing;


-- ==========================================================================
-- 0003_counterparty_contact.sql
-- ==========================================================================
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


-- ==========================================================================
-- 0004_storage.sql
-- ==========================================================================
-- ============================================================================
-- Storage bucket for listing photos.
--
-- Path convention: <property_id>/<uuid>.<ext>
-- The first path segment is the property id, which is what the policies below
-- check ownership against.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

-- Anyone may view listing photos (the bucket is public and listings are public).
drop policy if exists "listing photos are public" on storage.objects;
create policy "listing photos are public" on storage.objects for select
  using (bucket_id = 'property-images');

-- Only the owning host may add, replace, or remove photos for their property.
drop policy if exists "host uploads own listing photos" on storage.objects;
create policy "host uploads own listing photos" on storage.objects for insert
  with check (
    bucket_id = 'property-images'
    and exists (
      select 1 from public.properties p
       where p.owner_id = auth.uid()
         and p.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "host updates own listing photos" on storage.objects;
create policy "host updates own listing photos" on storage.objects for update
  using (
    bucket_id = 'property-images'
    and exists (
      select 1 from public.properties p
       where p.owner_id = auth.uid()
         and p.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "host deletes own listing photos" on storage.objects;
create policy "host deletes own listing photos" on storage.objects for delete
  using (
    bucket_id = 'property-images'
    and exists (
      select 1 from public.properties p
       where p.owner_id = auth.uid()
         and p.id::text = (storage.foldername(name))[1]
    )
  );


-- ==========================================================================
-- 0005_real_data_schema.sql
-- ==========================================================================
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


-- ==========================================================================
-- 0006_claims_plans_reputation.sql
-- ==========================================================================
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
drop policy if exists "plans readable" on public.plans;
create policy "plans readable" on public.plans for select using (true);

-- Your own subscription only.
drop policy if exists "own subscription readable" on public.host_subscriptions;
create policy "own subscription readable" on public.host_subscriptions
  for select using (profile_id = auth.uid());

-- Claims: you see your own; admins see all.
drop policy if exists "own claims readable" on public.property_claims;
create policy "own claims readable" on public.property_claims
  for select using (
    claimant_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin')
  );
drop policy if exists "claim your own listing" on public.property_claims;
create policy "claim your own listing" on public.property_claims
  for insert with check (claimant_id = auth.uid());
drop policy if exists "withdraw own claim" on public.property_claims;
create policy "withdraw own claim" on public.property_claims
  for update using (claimant_id = auth.uid()) with check (claimant_id = auth.uid());

-- Stays: visible to the two parties.
drop policy if exists "stay visible to parties" on public.stays;
create policy "stay visible to parties" on public.stays
  for select using (tenant_id = auth.uid() or owner_id = auth.uid());
drop policy if exists "host records a stay" on public.stays;
create policy "host records a stay" on public.stays
  for insert with check (owner_id = auth.uid());
drop policy if exists "host updates a stay" on public.stays;
create policy "host updates a stay" on public.stays
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Reviews: you always see what you wrote and what was written about you.
-- Third parties never read this table directly — only the aggregate RPC.
drop policy if exists "review visible to parties" on public.stay_reviews;
create policy "review visible to parties" on public.stay_reviews
  for select using (author_id = auth.uid() or subject_id = auth.uid());

drop policy if exists "party writes one review" on public.stay_reviews;
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
drop policy if exists "subject replies to review" on public.stay_reviews;
create policy "subject replies to review" on public.stay_reviews
  for update using (subject_id = auth.uid()) with check (subject_id = auth.uid());


-- ==========================================================================
-- 0007_address_enrichment.sql
-- ==========================================================================
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
