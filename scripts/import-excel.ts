/**
 * Import 고시원 / 셰어하우스 listings from Excel into Supabase.
 *
 *   npm run import -- --dir ./data --dry-run
 *   npm run import -- --dir ./data --owner <profile-uuid>
 *
 * Flags:
 *   --dir <path>     Directory of .xlsx/.xls/.csv files (default ./data)
 *   --file <path>    Import a single file instead of a directory
 *   --owner <uuid>   profiles.id to assign every imported listing to (required
 *                    unless --dry-run)
 *   --dry-run        Parse, geocode-check and report; write nothing
 *   --publish        Mark imported listings published (default: draft)
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   server-only; bypasses RLS, never expose to the browser
 *   KAKAO_REST_API_KEY          optional; enables address -> lat/lng geocoding
 *
 * Rows sharing the same (name + address) are treated as one property with
 * multiple rooms, which is how these spreadsheets are usually laid out.
 */
import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  matchHeader,
  parseGender,
  parseInteger,
  parseKrw,
  parseList,
  parsePropertyType,
  parseSqm,
  type TargetField,
} from "./column-map";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const DIR = getFlag("dir") ?? "./data";
const FILE = getFlag("file");
const OWNER_ID = getFlag("owner");
const DRY_RUN = hasFlag("dry-run");
const PUBLISH = hasFlag("publish");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawRow = Partial<Record<TargetField, string | number | null>>;

interface ParsedRoom {
  name: string;
  monthly_rent: number;
  deposit: number;
  size_sqm: number | null;
  min_contract_days: number | null;
}

interface ParsedProperty {
  name_ko: string;
  name_en: string | null;
  address_ko: string;
  address_en: string | null;
  address_detail: string | null;
  postal_code: string | null;
  property_type: ReturnType<typeof parsePropertyType>;
  gender: ReturnType<typeof parseGender>;
  age_min: number | null;
  age_max: number | null;
  floors_total: number | null;
  floors_used: string | null;
  languages: string[];
  description_ko: string | null;
  description_en: string | null;
  lat: number | null;
  lng: number | null;
  amenityNames: string[];
  rooms: ParsedRoom[];
  sourceFile: string;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const str = (v: unknown): string | null => {
  if (v == null) return null;
  // ExcelJS returns rich-text and formula cells as objects.
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof o.text === "string") return o.text.trim() || null;
    if (o.richText) return o.richText.map((r) => r.text).join("").trim() || null;
    if (o.result != null) return String(o.result).trim() || null;
    return null;
  }
  const s = String(v).trim();
  return s || null;
};

async function readWorkbookRows(
  filePath: string,
): Promise<{ rows: RawRow[]; unmapped: Set<string> }> {
  const workbook = new ExcelJS.Workbook();
  const ext = extname(filePath).toLowerCase();

  if (ext === ".csv") await workbook.csv.readFile(filePath);
  else await workbook.xlsx.readFile(filePath);

  const rows: RawRow[] = [];
  const unmapped = new Set<string>();

  workbook.eachSheet((sheet) => {
    // Find the header row: the first row where at least two cells map.
    let headerRowNumber = 0;
    let mapping: Array<TargetField | null> = [];

    for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
      const candidate = sheet.getRow(r);
      const headers = (candidate.values as unknown[]).slice(1).map((v) => str(v) ?? "");
      const matched = headers.map((h) => (h ? matchHeader(h) : null));
      if (matched.filter(Boolean).length >= 2) {
        headerRowNumber = r;
        mapping = matched;
        headers.forEach((h, i) => {
          if (h && !matched[i]) unmapped.add(h);
        });
        break;
      }
    }

    if (!headerRowNumber) {
      console.warn(`  ⚠︎ ${sheet.name}: no recognisable header row, skipped`);
      return;
    }

    for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1);
      if (values.every((v) => str(v) == null)) continue;

      const row: RawRow = {};
      mapping.forEach((field, i) => {
        if (!field) return;
        const raw = values[i];
        // Keep numbers as numbers so parseKrw can apply its 만원 heuristic.
        row[field] = typeof raw === "number" ? raw : str(raw);
      });
      if (row.name_ko || row.address_ko) rows.push(row);
    }
  });

  return { rows, unmapped };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupRows(rows: RawRow[], sourceFile: string): ParsedProperty[] {
  const byKey = new Map<string, ParsedProperty>();

  for (const row of rows) {
    const name = str(row.name_ko);
    const address = str(row.address_ko);
    if (!name || !address) continue;

    const key = `${name}|${address}`;
    let property = byKey.get(key);

    if (!property) {
      property = {
        name_ko: name,
        name_en: str(row.name_en),
        address_ko: address,
        address_en: str(row.address_en),
        address_detail: str(row.address_detail),
        postal_code: str(row.postal_code),
        property_type: parsePropertyType(str(row.property_type)),
        gender: parseGender(str(row.gender)),
        age_min: parseInteger(row.age_min ?? null),
        age_max: parseInteger(row.age_max ?? null),
        floors_total: parseInteger(row.floors_total ?? null),
        floors_used: str(row.floors_used),
        languages: parseList(str(row.languages)),
        description_ko: str(row.description_ko),
        description_en: str(row.description_en),
        lat: row.lat != null ? Number(row.lat) || null : null,
        lng: row.lng != null ? Number(row.lng) || null : null,
        amenityNames: parseList(str(row.amenities)),
        rooms: [],
        sourceFile,
      };
      byKey.set(key, property);
    }

    const rent = parseKrw(row.monthly_rent ?? null);
    if (rent != null) {
      property.rooms.push({
        name: str(row.room_name) ?? `ROOM ${property.rooms.length + 1}`,
        monthly_rent: rent,
        deposit: parseKrw(row.deposit ?? null) ?? 0,
        size_sqm: parseSqm(row.size_sqm ?? null),
        min_contract_days: parseInteger(row.min_contract_days ?? null) ?? 30,
      });
    }
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Geocoding (Kakao Local API)
// ---------------------------------------------------------------------------

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

async function geocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_KEY) return null;

  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });

  if (!response.ok) {
    console.warn(`  ⚠︎ geocode ${response.status} for "${address}"`);
    return null;
  }

  const data = (await response.json()) as {
    documents: Array<{ x: string; y: string }>;
  };
  const hit = data.documents?.[0];
  // Kakao returns x = longitude, y = latitude.
  return hit ? { lat: parseFloat(hit.y), lng: parseFloat(hit.x) } : null;
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "listing"}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let files: string[] = [];

  if (FILE) {
    files = [FILE];
  } else {
    const dirStat = await stat(DIR).catch(() => null);
    if (!dirStat?.isDirectory()) {
      console.error(`✗ Not a directory: ${DIR}`);
      console.error(`  Put your .xlsx files there, or pass --dir <path>.`);
      process.exit(1);
    }
    files = (await readdir(DIR))
      .filter((f) => [".xlsx", ".xls", ".csv"].includes(extname(f).toLowerCase()))
      .filter((f) => !f.startsWith("~$")) // Excel lock files
      .map((f) => join(DIR, f));
  }

  if (files.length === 0) {
    console.error(`✗ No spreadsheets found in ${DIR}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} file(s)\n`);

  const all: ParsedProperty[] = [];
  const allUnmapped = new Set<string>();

  for (const file of files) {
    console.log(`▸ ${basename(file)}`);
    const { rows, unmapped } = await readWorkbookRows(file);
    unmapped.forEach((u) => allUnmapped.add(u));

    const properties = groupRows(rows, basename(file));
    console.log(`  ${rows.length} rows → ${properties.length} listings`);
    all.push(...properties);
  }

  if (allUnmapped.size > 0) {
    console.log(`\n⚠︎ Unmapped columns (add to scripts/column-map.ts to import):`);
    [...allUnmapped].sort().forEach((h) => console.log(`    "${h}"`));
  }

  // Geocode anything missing coordinates.
  const needGeocode = all.filter((p) => p.lat == null || p.lng == null);
  if (needGeocode.length > 0) {
    if (!KAKAO_KEY) {
      console.log(
        `\n⚠︎ ${needGeocode.length} listing(s) lack coordinates and KAKAO_REST_API_KEY is unset.`,
      );
      console.log(`   They will import without map pins.`);
    } else {
      console.log(`\nGeocoding ${needGeocode.length} address(es)…`);
      for (const property of needGeocode) {
        const result = await geocode(property.address_ko);
        if (result) {
          property.lat = result.lat;
          property.lng = result.lng;
        }
        // Kakao's default quota is generous but not unlimited; be polite.
        await new Promise((r) => setTimeout(r, 120));
      }
      const stillMissing = all.filter((p) => p.lat == null).length;
      console.log(`  ${needGeocode.length - stillMissing} resolved, ${stillMissing} failed`);
    }
  }

  const totalRooms = all.reduce((sum, p) => sum + p.rooms.length, 0);
  console.log(`\n── Summary ──`);
  console.log(`  Listings: ${all.length}`);
  console.log(`  Rooms:    ${totalRooms}`);
  console.log(`  Geocoded: ${all.filter((p) => p.lat != null).length}/${all.length}`);

  if (DRY_RUN) {
    console.log(`\n[dry run] Nothing written. Sample of the first listing:\n`);
    console.dir(all[0], { depth: 4 });
    return;
  }

  // ---- Write ----
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      `\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to write.`,
    );
    console.error(`  Re-run with --dry-run to inspect the parse without writing.`);
    process.exit(1);
  }
  if (!OWNER_ID) {
    console.error(`\n✗ --owner <profile-uuid> is required (the host these listings belong to).`);
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve amenity names to ids once.
  const { data: amenityRows } = await supabase
    .from("amenities")
    .select("id, slug, name_ko, name_en");
  const amenityByName = new Map<string, string>();
  (amenityRows ?? []).forEach((a) => {
    [a.slug, a.name_ko, a.name_en].forEach((n) => {
      if (n) amenityByName.set(String(n).toLowerCase().replace(/\s/g, ""), a.id);
    });
  });

  let created = 0;
  let failed = 0;

  for (const property of all) {
    const { amenityNames, rooms, sourceFile, ...fields } = property;
    void sourceFile;

    const { data: inserted, error } = await supabase
      .from("properties")
      .insert({
        ...fields,
        owner_id: OWNER_ID,
        slug: slugify(property.name_en || property.name_ko),
        is_published: PUBLISH,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error(`  ✗ ${property.name_ko}: ${error?.message}`);
      failed++;
      continue;
    }

    if (rooms.length > 0) {
      const { error: roomError } = await supabase.from("rooms").insert(
        rooms.map((room, i) => ({ ...room, property_id: inserted.id, sort_order: i })),
      );
      if (roomError) console.error(`  ⚠︎ ${property.name_ko} rooms: ${roomError.message}`);
    }

    const amenityIds = amenityNames
      .map((n) => amenityByName.get(n.toLowerCase().replace(/\s/g, "")))
      .filter((id): id is string => Boolean(id));

    if (amenityIds.length > 0) {
      await supabase.from("property_amenities").insert(
        [...new Set(amenityIds)].map((amenity_id) => ({
          property_id: inserted.id,
          amenity_id,
        })),
      );
    }

    created++;
  }

  console.log(`\n✓ Imported ${created} listing(s)${failed ? `, ${failed} failed` : ""}`);
  console.log(
    PUBLISH
      ? `  They are live.`
      : `  They are drafts — publish from the host dashboard when ready.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
