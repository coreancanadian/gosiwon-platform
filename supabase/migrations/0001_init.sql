-- ============================================================================
-- 고시원 / Shared Housing platform — initial schema
-- Postgres (Supabase). Bilingual KR/EN: *_ko / *_en column pairs.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user. Role decides tenant vs owner capabilities.
-- ---------------------------------------------------------------------------
create table public.profiles (
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Regions: the location tiles on the home page.
-- tier drives which grid a region renders in.
-- ---------------------------------------------------------------------------
create table public.regions (
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
create table public.subway_stations (
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
create table public.properties (
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

create index properties_region_idx    on public.properties(region_id) where is_published;
create index properties_geo_idx       on public.properties(lat, lng) where is_published;
create index properties_owner_idx     on public.properties(owner_id);

-- ---------------------------------------------------------------------------
-- Rooms: a property has many rooms at different prices (ROOM A / B / C).
-- ---------------------------------------------------------------------------
create table public.rooms (
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

create index rooms_property_idx on public.rooms(property_id);

-- ---------------------------------------------------------------------------
-- Amenities: shared vocabulary, grouped into the categories room-room.kr uses.
-- ---------------------------------------------------------------------------
create table public.amenities (
  id        uuid primary key default uuid_generate_v4(),
  slug      text not null unique,
  name_ko   text not null,
  name_en   text not null,
  category  text not null check (category in
              ('living', 'safety', 'kitchen', 'laundry', 'provided', 'shared')),
  icon      text,
  sort_order int not null default 0
);

create table public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_id  uuid not null references public.amenities(id) on delete cascade,
  primary key (property_id, amenity_id)
);

create table public.room_amenities (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  primary key (room_id, amenity_id)
);

-- ---------------------------------------------------------------------------
-- Images: stored in the Supabase 'property-images' bucket; we keep the path.
-- ---------------------------------------------------------------------------
create table public.property_images (
  id           uuid primary key default uuid_generate_v4(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  room_id      uuid references public.rooms(id) on delete cascade,
  storage_path text not null,
  alt_ko       text,
  alt_en       text,
  is_cover     boolean not null default false,
  sort_order   int not null default 0
);

create index property_images_property_idx on public.property_images(property_id);
create unique index property_images_one_cover_idx
  on public.property_images(property_id) where is_cover;

-- Walking distance to nearby stations — drives subway-based search.
create table public.property_subway (
  property_id  uuid not null references public.properties(id) on delete cascade,
  station_id   uuid not null references public.subway_stations(id) on delete cascade,
  walk_minutes int,
  primary key (property_id, station_id)
);

-- ---------------------------------------------------------------------------
-- Inquiries: a tenant asks about a property; the owner accepts or declines.
-- This is the core of the platform — no realtime booking, just approval.
-- ---------------------------------------------------------------------------
create table public.inquiries (
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

create index inquiries_owner_idx  on public.inquiries(owner_id, status);
create index inquiries_tenant_idx on public.inquiries(tenant_id);

create table public.messages (
  id          uuid primary key default uuid_generate_v4(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index messages_inquiry_idx on public.messages(inquiry_id, created_at);

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
create policy "regions readable"   on public.regions         for select using (true);
create policy "stations readable"  on public.subway_stations for select using (true);
create policy "amenities readable" on public.amenities       for select using (true);

-- Profiles: you can read and edit only your own.
-- (Owner contact details are exposed through an accepted inquiry, not here.)
create policy "own profile readable" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile updatable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Properties: published ones are public; owners fully control their own.
create policy "published properties readable" on public.properties
  for select using (is_published or owner_id = auth.uid());
create policy "owner inserts own property" on public.properties
  for insert with check (owner_id = auth.uid());
create policy "owner updates own property" on public.properties
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner deletes own property" on public.properties
  for delete using (owner_id = auth.uid());

-- Child tables inherit visibility from the parent property.
create policy "rooms readable" on public.rooms
  for select using (exists (
    select 1 from public.properties p
     where p.id = rooms.property_id and (p.is_published or p.owner_id = auth.uid())));
create policy "owner writes rooms" on public.rooms
  for all using (exists (
    select 1 from public.properties p
     where p.id = rooms.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = rooms.property_id and p.owner_id = auth.uid()));

create policy "images readable" on public.property_images
  for select using (exists (
    select 1 from public.properties p
     where p.id = property_images.property_id and (p.is_published or p.owner_id = auth.uid())));
create policy "owner writes images" on public.property_images
  for all using (exists (
    select 1 from public.properties p
     where p.id = property_images.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = property_images.property_id and p.owner_id = auth.uid()));

create policy "property amenities readable" on public.property_amenities
  for select using (exists (
    select 1 from public.properties p
     where p.id = property_amenities.property_id and (p.is_published or p.owner_id = auth.uid())));
create policy "owner writes property amenities" on public.property_amenities
  for all using (exists (
    select 1 from public.properties p
     where p.id = property_amenities.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = property_amenities.property_id and p.owner_id = auth.uid()));

create policy "room amenities readable" on public.room_amenities
  for select using (exists (
    select 1 from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.id = room_amenities.room_id and (p.is_published or p.owner_id = auth.uid())));
create policy "owner writes room amenities" on public.room_amenities
  for all using (exists (
    select 1 from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.id = room_amenities.room_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.id = room_amenities.room_id and p.owner_id = auth.uid()));

create policy "property subway readable" on public.property_subway
  for select using (true);
create policy "owner writes property subway" on public.property_subway
  for all using (exists (
    select 1 from public.properties p
     where p.id = property_subway.property_id and p.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.properties p
     where p.id = property_subway.property_id and p.owner_id = auth.uid()));

-- Inquiries: visible to the two parties only.
create policy "inquiry visible to parties" on public.inquiries
  for select using (tenant_id = auth.uid() or owner_id = auth.uid());
create policy "tenant creates inquiry" on public.inquiries
  for insert with check (tenant_id = auth.uid());
-- Owners respond (accept/decline); tenants may close their own.
create policy "parties update inquiry" on public.inquiries
  for update using (owner_id = auth.uid() or tenant_id = auth.uid())
  with check (owner_id = auth.uid() or tenant_id = auth.uid());

-- Messages: readable by either party on the thread; sender must be a party.
create policy "messages visible to parties" on public.messages
  for select using (exists (
    select 1 from public.inquiries i
     where i.id = messages.inquiry_id
       and (i.tenant_id = auth.uid() or i.owner_id = auth.uid())));
create policy "party sends message" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.inquiries i
       where i.id = messages.inquiry_id
         and (i.tenant_id = auth.uid() or i.owner_id = auth.uid())));
create policy "sender marks read" on public.messages
  for update using (exists (
    select 1 from public.inquiries i
     where i.id = messages.inquiry_id
       and (i.tenant_id = auth.uid() or i.owner_id = auth.uid())));
