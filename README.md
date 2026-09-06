# 캠퍼스플랫 / Campusflat

A bilingual (KR/EN) listing platform for Korean 고시원 and 셰어하우스. Renters
search by district or subway station, browse listings on an Airbnb-style
split map view, and send an inquiry. Hosts accept or decline inquiries, message
applicants, and manage their own listings from a dashboard.

Deliberately **not** a real-time booking engine: nothing is reservable. The host
always decides who gets in.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, React 19) |
| Styling | Tailwind CSS v4 |
| i18n | next-intl v4 — `/` is Korean, `/en` is English |
| Database / auth / storage | Supabase (Postgres + RLS) |
| Maps | Kakao Maps |
| Hosting | Vercel |

> **Next.js 16 note:** the `middleware.ts` convention is deprecated in favour of
> `proxy.ts` (Node runtime, not edge). See `src/proxy.ts`.

## Quick start

```bash
npm install && npm run dev
```

Open http://localhost:3000. With no environment variables set the app runs in
**demo mode**: 8 seeded listings, all 35 location/subway tiles, and full search
render from local fixtures. Auth, inquiries, and messaging show a "demo mode"
notice instead of erroring.

## Going live

### 1. Supabase

Create a project (choose the **Seoul `ap-northeast-2`** region for Korean
latency), then run the migrations in order from `supabase/migrations/`:

| File | What it does |
| --- | --- |
| `0001_init.sql` | Tables, indexes, triggers, and all RLS policies |
| `0002_seed_reference_data.sql` | Region tiles, subway stations, amenity vocabulary |
| `0003_counterparty_contact.sql` | Releases host contact details only after acceptance |
| `0004_storage.sql` | `property-images` bucket + per-host upload policies |

Copy `.env.example` to `.env.local` and fill in the URL and anon key. The app
switches off demo mode automatically.

Regenerate the hand-written types once the schema is live:

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
```

### 2. Kakao Maps

Register at [developers.kakao.com](https://developers.kakao.com), then:

- **JavaScript key** → `NEXT_PUBLIC_KAKAO_MAP_KEY` (the browser map)
- **REST API key** → `KAKAO_REST_API_KEY` (address geocoding in the importer)

Add your domain under **Platform → Web** or the SDK refuses to load. Without a
key the map degrades to a labelled placeholder rather than breaking the page.

### 3. Import your listings

```bash
npm run import -- --dry-run     # inspect the parse, write nothing
npm run import                  # write as drafts
npm run import -- --geocode --publish
```

You never need to look up a UUID. `properties.owner_id` references
`profiles.id`, which is itself a foreign key to `auth.users(id)` — so the auth
user id and the profile id are **the same UUID**, and the app always reads it
from `supabase.auth.getUser()`.

The importer is the one place that can't: it runs on the command line with a
service-role key and no browser session. So it resolves the owner itself —
automatically when your project has a single host account, or via
`--owner-email <email>` when there is more than one. It tells you exactly what
to do if it can't decide.

The importer handles how Korean listing spreadsheets are actually written:

- Finds the header row even when export junk sits above it
- Matches headers by alias, so `월세`, `월 세`, `월세(원)`, and `임대료` all map to rent
- Parses `38만원`, `38만`, `380,000`, and a bare `38` all to `380000`
- Converts `13평` to `42.98㎡`
- Treats rows sharing a name + address as one property with multiple rooms
- Geocodes addresses via Kakao when `lat`/`lng` columns are absent
- Reports unmapped columns so you can extend `scripts/column-map.ts`

Imports land as **drafts** unless you pass `--publish`.

### 4. Deploy

Import the repo into Vercel, add the same environment variables, and deploy.

**Your domain:** you do *not* need to move it off GoDaddy. Point DNS at Vercel
and you're done. Transfer only if Hostinger's renewal price is lower — the
domain registrar and the host are independent decisions.

## Cost

| Stage | Monthly |
| --- | --- |
| Pilot (Vercel Hobby + Supabase Free) | $0 |
| Commercial (Vercel Pro $20 + Supabase Pro $25) | ~$45 |

Vercel's Hobby tier prohibits commercial use, so budget for Pro once the site is
doing real business. Cloudflare Workers + D1 is the cheaper alternative whose
free tier permits commercial use.

## Layout

```
src/
  app/[locale]/          Home, search, property detail, inquiry, auth, dashboard
  app/api/auth/callback  Email-confirmation code exchange
  components/            UI, incl. KakaoMap, PhotoGallery, SearchBox
  lib/actions/           Server actions (inquiries, properties) — zod validated
  lib/data/              Queries + demo-mode fixtures
  proxy.ts               i18n routing + Supabase session refresh
supabase/migrations/     Schema, seed, security, storage
scripts/                 Excel importer + column alias map
```

## Security notes

- Every table has RLS on. Hosts can only read and write their own listings.
- Inquiries and messages are visible only to the two parties involved.
- `profiles` exposes only your own row. Counterparty details come from
  `get_inquiry_counterparty()`, a `SECURITY DEFINER` function that returns the
  other party's **name** always but their **phone / KakaoTalk / WhatsApp only
  once the inquiry is accepted**. Loosening the table policy instead would leak
  contact details on every pending inquiry.
- Server actions re-check ownership rather than trusting client input; RLS is
  the backstop, not the only gate.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is used only by the importer.
  Never prefix it with `NEXT_PUBLIC_`.

## Known gaps

- **Seeded demo listings have no photos**, so the gallery shows its empty state
  until you upload via the dashboard or import real images.
- **Region and subway tiles use generated gradients**, not photography. Drop a
  JPG at `public/images/regions/<slug>.jpg` and set `image_url` on the row.
- **Room names are single-language.** The `rooms` table has one `name` column,
  so a room called `내창 A` shows as-is on the English site. Add `name_en` if
  bilingual room labels matter.
- No email/push notification when an inquiry arrives — hosts must check the
  dashboard. Supabase lets you add this with a database webhook.
