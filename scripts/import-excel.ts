/**
 * Import 고시원 / 원룸텔 / 셰어하우스 listings from the source spreadsheets.
 *
 *   npm run import -- --dry-run
 *   npm run import                          # owner auto-resolved
 *   npm run import -- --owner-email you@example.com
 *
 * Flags:
 *   --dir <path>           Directory of spreadsheets (default "./room files")
 *   --owner-email <email>  Host account these listings belong to. Optional —
 *                          omit it and the only host account is used.
 *   --owner <uuid>         Explicit override; rarely needed.
 *   --dry-run              Parse and report; write nothing
 *   --publish        Mark imported listings published (default: draft)
 *   --geocode        Resolve 위치 to coordinates via Kakao (needs KAKAO_REST_API_KEY)
 *   --limit <n>      Import only the first n listings (useful for a trial run)
 *
 * Each source row is ONE listing carrying a min/max rent range, not a per-room
 * price, so rooms are left empty for the host to fill in later and
 * properties.price_min/max are set directly.
 *
 * Re-running is idempotent: listings are upserted on external_id (아이디).
 */
import { readdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  AMENITY_SLUG_BY_TOKEN,
  HEATING_SLUG_BY_VALUE,
  manwonToKrw,
  matchRegionSlug,
  normalizeAmenityToken,
  parseAllPropertyTypes,
  parseFloors,
  parseGender,
  parsePropertyType,
  parseStations,
  parseUniversities,
  type PropertyType,
} from "./source-map";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);

const DIR = flag("dir") ?? "./room files";
const OWNER_ID = flag("owner");
const OWNER_EMAIL = flag("owner-email");
const DRY_RUN = has("dry-run");
const PUBLISH = has("publish");
const GEOCODE = has("geocode");
const LIMIT = flag("limit") ? parseInt(flag("limit")!, 10) : Infinity;

// ---------------------------------------------------------------------------
// Source columns (header text -> our field). All four files share this schema;
// two files add 번호 and "English 업체명", which is why we match by header text
// rather than by position.
// ---------------------------------------------------------------------------
const COLUMNS = {
  external_id: "아이디",
  name_ko: "업체명",
  name_en: "English 업체명",
  location: "위치",
  stations: "근처 지하철",
  universities: "근처 대학교",
  type: "주거형태",
  deposit: "보증금(만원)",
  rent_min: "월세(최소)",
  rent_max: "월세(최대)",
  gender: "남녀구분",
  description: "지점소개",
  video: "소개영상",
  floors: "층 정보",
  building: "건물형태",
  parking: "주차",
  elevator: "엘리베이터",
  heating: "난방시설",
} as const;

const FACILITY_COLUMNS = [
  "세탁시설",
  "청결시설",
  "주방시설",
  "생활시설",
  "안전시설",
  "제공 비품",
] as const;

interface ParsedListing {
  external_id: string | null;
  name_ko: string;
  name_en: string | null;
  address_ko: string;
  regionSlug: string | null;
  property_type: PropertyType;
  allTypes: PropertyType[];
  gender: "any" | "male" | "female";
  separatedFloors: boolean;
  deposit: number | null;
  price_min: number | null;
  price_max: number | null;
  description_ko: string | null;
  video_url: string | null;
  floors_total: number | null;
  floors_used: string | null;
  building_type: string | null;
  nearby_universities: string[];
  stationNames: string[];
  amenitySlugs: Set<string>;
  sourceFile: string;
  /** Filled in by --geocode; the source has no coordinates. */
  lat?: number | null;
  lng?: number | null;
}

// ---------------------------------------------------------------------------
// Cell reading
// ---------------------------------------------------------------------------
const cell = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as {
      text?: string;
      result?: unknown;
      richText?: Array<{ text: string }>;
      hyperlink?: string;
    };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if (o.hyperlink) return o.hyperlink.trim();
    if (o.result != null) return String(o.result).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v).trim();
};

const nullIfEmpty = (s: string): string | null => (s ? s : null);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
const unmappedAmenityTokens = new Map<string, number>();

function parseSheet(
  sheet: ExcelJS.Worksheet,
  sourceFile: string,
  seenIds: Set<string>,
): ParsedListing[] {
  // Locate the header row. One file has a "Table 1" banner above it.
  let headerRow = 0;
  let headers: string[] = [];
  for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
    const values = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
    if (values.includes(COLUMNS.name_ko) && values.includes(COLUMNS.location)) {
      headerRow = r;
      headers = values;
      break;
    }
  }
  if (!headerRow) return [];

  const at = (values: string[], header: string): string => {
    const i = headers.indexOf(header);
    return i >= 0 ? (values[i] ?? "") : "";
  };

  const listings: ParsedListing[] = [];

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const values = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
    if (!values.some((v) => v)) continue;

    const externalId = at(values, COLUMNS.external_id);
    // The same listing appears in both sheets of one workbook.
    if (externalId) {
      if (seenIds.has(externalId)) continue;
      seenIds.add(externalId);
    }

    const name = at(values, COLUMNS.name_ko);
    const location = at(values, COLUMNS.location);
    if (!name || !location) continue;

    const { gender, separatedFloors } = parseGender(at(values, COLUMNS.gender));
    const { total, used } = parseFloors(at(values, COLUMNS.floors));

    // Facility columns -> amenity slugs.
    const amenitySlugs = new Set<string>();
    for (const col of FACILITY_COLUMNS) {
      const raw = at(values, col);
      if (!raw) continue;
      for (const token of raw.split(/\s+/).filter(Boolean)) {
        const normalized = normalizeAmenityToken(token);
        if (!normalized) continue;
        const slug = AMENITY_SLUG_BY_TOKEN[normalized];
        if (slug) amenitySlugs.add(slug);
        else
          unmappedAmenityTokens.set(
            normalized,
            (unmappedAmenityTokens.get(normalized) ?? 0) + 1,
          );
      }
    }

    // Single-value columns that are really amenity flags.
    const heatingSlug = HEATING_SLUG_BY_VALUE[at(values, COLUMNS.heating)];
    if (heatingSlug) amenitySlugs.add(heatingSlug);
    if (at(values, COLUMNS.parking) === "가능") amenitySlugs.add("parking");
    if (at(values, COLUMNS.elevator).startsWith("있음")) amenitySlugs.add("elevator");
    if (separatedFloors) amenitySlugs.add("female-only-floor");

    const video = at(values, COLUMNS.video);
    const description = at(values, COLUMNS.description);

    listings.push({
      external_id: nullIfEmpty(externalId),
      name_ko: name,
      name_en: nullIfEmpty(at(values, COLUMNS.name_en)),
      address_ko: location,
      regionSlug: matchRegionSlug(location),
      property_type: parsePropertyType(at(values, COLUMNS.type)),
      allTypes: parseAllPropertyTypes(at(values, COLUMNS.type)),
      gender,
      separatedFloors,
      deposit: manwonToKrw(at(values, COLUMNS.deposit)),
      price_min: manwonToKrw(at(values, COLUMNS.rent_min)),
      price_max: manwonToKrw(at(values, COLUMNS.rent_max)),
      description_ko: nullIfEmpty(description),
      // One file duplicates 지점소개 into 소개영상; only keep real URLs.
      video_url: /^https?:\/\//.test(video) ? video : null,
      floors_total: total,
      floors_used: used,
      building_type: nullIfEmpty(at(values, COLUMNS.building)),
      nearby_universities: parseUniversities(at(values, COLUMNS.universities)),
      stationNames: parseStations(at(values, COLUMNS.stations)),
      amenitySlugs,
      sourceFile,
    });
  }

  return listings;
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_KEY) return null;
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { documents: Array<{ x: string; y: string }> };
  const hit = data.documents?.[0];
  // Kakao returns x = longitude, y = latitude.
  return hit ? { lat: parseFloat(hit.y), lng: parseFloat(hit.x) } : null;
}

function slugify(listing: ParsedListing): string {
  const base = (listing.name_en || listing.name_ko)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  // external_id keeps the slug stable across re-imports.
  const suffix = listing.external_id ?? Math.random().toString(36).slice(2, 8);
  return `${base || "listing"}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Owner resolution
//
// properties.owner_id is NOT NULL and references profiles(id) — which is itself
// a foreign key to auth.users(id), so the "auth user id" and the "profiles id"
// are the same UUID.
//
// The app reads that id from supabase.auth.getUser() on every write. This script
// can't: it runs on the command line with a service-role key and no browser
// session, so there is no signed-in user to read. Instead of making you paste a
// UUID, it resolves the owner itself — by email, or automatically when your
// project has exactly one host account.
// ---------------------------------------------------------------------------
async function resolveOwnerId(supabase: SupabaseClient): Promise<string | null> {
  // 1. Explicit UUID always wins.
  if (OWNER_ID) return OWNER_ID;

  // 2. By email. Looks up auth.users, whose id IS the profiles id.
  if (OWNER_EMAIL) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) {
      console.error(`✗ Could not list accounts: ${error.message}`);
      return null;
    }
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase(),
    );
    if (!match) {
      console.error(`✗ No account found for ${OWNER_EMAIL}.`);
      console.error(`  Sign up at /signup first, choosing "a host listing a property".`);
      return null;
    }
    console.log(`Owner: ${OWNER_EMAIL} → ${match.id}`);
    return match.id;
  }

  // 3. Exactly one host account in the project — the common pilot case.
  const { data: hosts, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["owner", "admin"]);

  if (error) {
    console.error(`✗ Could not read profiles: ${error.message}`);
    return null;
  }

  if (!hosts || hosts.length === 0) {
    console.error(`✗ No host account exists yet.`);
    console.error(`  Sign up at /signup choosing "a host listing a property", then re-run.`);
    return null;
  }

  if (hosts.length > 1) {
    console.error(`✗ ${hosts.length} host accounts exist — which should own these listings?`);
    console.error(`  Re-run with --owner-email <email>. Hosts found:`);
    hosts.forEach((h) => console.error(`    ${h.id}  ${h.full_name ?? "(no name)"} [${h.role}]`));
    return null;
  }

  console.log(`Owner: ${hosts[0].full_name ?? hosts[0].id} (only host account)`);
  return hosts[0].id;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
async function write(
  listings: ParsedListing[],
  supabase: SupabaseClient,
  ownerId: string,
) {
  const [{ data: regions }, { data: amenities }, { data: stations }] =
    await Promise.all([
      supabase.from("regions").select("id, slug"),
      supabase.from("amenities").select("id, slug"),
      supabase.from("subway_stations").select("id, name_ko"),
    ]);

  const regionIdBySlug = new Map((regions ?? []).map((r) => [r.slug, r.id]));
  const amenityIdBySlug = new Map((amenities ?? []).map((a) => [a.slug, a.id]));
  const stationIdByName = new Map((stations ?? []).map((s) => [s.name_ko, s.id]));

  let created = 0;
  let failed = 0;
  let amenityLinks = 0;
  let stationLinks = 0;

  for (const listing of listings) {
    const { data: row, error } = await supabase
      .from("properties")
      .upsert(
        {
          owner_id: ownerId,
          external_id: listing.external_id,
          slug: slugify(listing),
          name_ko: listing.name_ko,
          name_en: listing.name_en,
          address_ko: listing.address_ko,
          region_id: listing.regionSlug
            ? (regionIdBySlug.get(listing.regionSlug) ?? null)
            : null,
          lat: listing.lat ?? null,
          lng: listing.lng ?? null,
          property_type: listing.property_type,
          gender: listing.gender,
          floors_total: listing.floors_total,
          floors_used: listing.floors_used,
          building_type: listing.building_type,
          nearby_universities: listing.nearby_universities,
          video_url: listing.video_url,
          description_ko: listing.description_ko,
          price_min: listing.price_min,
          price_max: listing.price_max,
          is_published: PUBLISH,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "external_id" },
      )
      .select("id")
      .single();

    if (error || !row) {
      console.error(`  ✗ ${listing.name_ko}: ${error?.message}`);
      failed++;
      continue;
    }

    // Replace the amenity set so re-imports stay clean.
    const amenityIds = [...listing.amenitySlugs]
      .map((s) => amenityIdBySlug.get(s))
      .filter((id): id is string => Boolean(id));

    await supabase.from("property_amenities").delete().eq("property_id", row.id);
    if (amenityIds.length > 0) {
      await supabase
        .from("property_amenities")
        .insert(amenityIds.map((amenity_id) => ({ property_id: row.id, amenity_id })));
      amenityLinks += amenityIds.length;
    }

    // Only stations we actually have a row for (the 10 featured ones today).
    const stationIds = listing.stationNames
      .map((n) => stationIdByName.get(n))
      .filter((id): id is string => Boolean(id));

    if (stationIds.length > 0) {
      await supabase.from("property_subway").delete().eq("property_id", row.id);
      await supabase.from("property_subway").insert(
        [...new Set(stationIds)].map((station_id) => ({
          property_id: row.id,
          station_id,
          walk_minutes: null,
        })),
      );
      stationLinks += stationIds.length;
    }

    created++;
    if (created % 200 === 0) console.log(`  …${created}/${listings.length}`);
  }

  console.log(`\n✓ Imported ${created} listing(s)${failed ? `, ${failed} failed` : ""}`);
  console.log(`  amenity links: ${amenityLinks}`);
  console.log(`  station links: ${stationLinks}`);
  console.log(
    PUBLISH ? `  They are live.` : `  They are drafts — publish from the dashboard.`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const files = (await readdir(DIR))
    .filter((f) => [".xlsx", ".xls", ".csv"].includes(extname(f).toLowerCase()))
    .filter((f) => !f.startsWith("~$"))
    .map((f) => join(DIR, f));

  if (files.length === 0) {
    console.error(`✗ No spreadsheets found in ${DIR}`);
    process.exit(1);
  }

  const seenIds = new Set<string>();
  const all: ParsedListing[] = [];

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    if (extname(file).toLowerCase() === ".csv") await wb.csv.readFile(file);
    else await wb.xlsx.readFile(file);

    let fileCount = 0;
    wb.eachSheet((sheet) => {
      const parsed = parseSheet(sheet, basename(file), seenIds);
      all.push(...parsed);
      fileCount += parsed.length;
    });
    console.log(`▸ ${basename(file).padEnd(26)} ${fileCount} listings`);
  }

  const listings = all.slice(0, LIMIT);

  // ---- Report ----
  const byType = new Map<string, number>();
  listings.forEach((l) => byType.set(l.property_type, (byType.get(l.property_type) ?? 0) + 1));

  const shared = listings.filter((l) =>
    ["share_house", "coliving", "dormitory"].includes(l.property_type),
  ).length;

  console.log(`\n── Summary ──`);
  console.log(`  Listings:        ${listings.length}`);
  console.log(`  Private room:    ${listings.length - shared}`);
  console.log(`  Shared living:   ${shared}`);
  console.log(`\n  By type:`);
  [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`    ${String(n).padStart(5)}  ${t}`));

  console.log(`\n  Mapped to a home-page region: ${listings.filter((l) => l.regionSlug).length}`);
  console.log(`  With rent range:              ${listings.filter((l) => l.price_min != null).length}`);
  console.log(`  With description:             ${listings.filter((l) => l.description_ko).length}`);
  console.log(`  With video:                   ${listings.filter((l) => l.video_url).length}`);
  console.log(`  With universities:            ${listings.filter((l) => l.nearby_universities.length).length}`);
  console.log(`  With subway names:            ${listings.filter((l) => l.stationNames.length).length}`);
  const avgAmenities =
    listings.reduce((s, l) => s + l.amenitySlugs.size, 0) / (listings.length || 1);
  console.log(`  Avg amenities/listing:        ${avgAmenities.toFixed(1)}`);

  if (unmappedAmenityTokens.size > 0) {
    console.log(`\n⚠︎ Unmapped facility tokens (add to scripts/source-map.ts):`);
    [...unmappedAmenityTokens.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([t, n]) => console.log(`    ${String(n).padStart(5)}  ${t}`));
  }

  if (GEOCODE && KAKAO_KEY) {
    console.log(`\nGeocoding ${listings.length} address(es)…`);
    let ok = 0;
    for (const listing of listings) {
      const result = await geocode(listing.address_ko);
      if (result) {
        listing.lat = result.lat;
        listing.lng = result.lng;
        ok++;
      }
      await new Promise((r) => setTimeout(r, 110));
    }
    console.log(`  ${ok}/${listings.length} resolved`);
  } else if (GEOCODE) {
    console.log(`\n⚠︎ --geocode given but KAKAO_REST_API_KEY is unset; skipping.`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry run] Nothing written. First listing:\n`);
    const { amenitySlugs, ...rest } = listings[0];
    console.dir({ ...rest, amenitySlugs: [...amenitySlugs] }, { depth: 3 });
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(`\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write.`);
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const ownerId = await resolveOwnerId(supabase);
  if (!ownerId) process.exit(1);

  await write(listings, supabase, ownerId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
