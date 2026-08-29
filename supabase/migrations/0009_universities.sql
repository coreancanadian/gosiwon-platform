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
