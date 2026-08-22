/**
 * Find the nearest subway stations to every geocoded listing and record the
 * walking time.
 *
 *   npx tsx scripts/link-subway.ts --dry-run --limit 30
 *   npx tsx scripts/link-subway.ts
 *
 * Flags:
 *   --dry-run     Report only; write nothing
 *   --limit <n>   Process only the first n listings
 *   --radius <m>  Search radius in metres (default 1500)
 *   --top <n>     Stations to link per listing (default 3)
 *   --redo        Re-link listings that already have stations
 *
 * Only listings with coordinates can be processed, so run the address
 * enrichment first.
 *
 * Stations Kakao returns that we don't have yet are inserted with
 * is_featured=false — the curated home-page grid is unaffected, they simply
 * become searchable and linkable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { slugifyKorean, splitStationName, walkMinutesFrom } from "./romanize";

loadEnv({ path: ".env.local" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (n: string) => process.argv.includes(`--${n}`);

const DRY_RUN = has("dry-run");
const REDO = has("redo");
const LIMIT = flag("limit") ? parseInt(flag("limit")!, 10) : Infinity;
const RADIUS = flag("radius") ? parseInt(flag("radius")!, 10) : 1500;
const TOP = flag("top") ? parseInt(flag("top")!, 10) : 3;
const THROTTLE_MS = 130;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

interface Sw8Doc {
  place_name: string;
  distance: string;
  x: string;
  y: string;
  category_name: string;
}

interface NearbyStation {
  name: string;
  lines: string[];
  distanceM: number;
  lat: number;
  lng: number;
}

async function kakaoNearbyStations(
  lat: number,
  lng: number,
): Promise<Sw8Doc[]> {
  const qs = new URLSearchParams({
    category_group_code: "SW8",
    x: String(lng),
    y: String(lat),
    radius: String(RADIUS),
    sort: "distance",
    size: "15",
  });
  const url = `https://dapi.kakao.com/v2/local/search/category.json?${qs}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      });

      if (res.status === 401 || res.status === 403) {
        console.error(`\n✗ Kakao rejected the request (HTTP ${res.status})`);
        console.error(`  ${await res.text()}`);
        process.exit(1);
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        continue;
      }
      if (!res.ok) return [];

      const data = (await res.json()) as { documents: Sw8Doc[] };
      return data.documents ?? [];
    } catch {
      // Kakao drops long-lived HTTP/2 sessions; retry rather than abort.
      if (attempt === 4) return [];
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  return [];
}

/** One row per line at a station collapses into one station with many lines. */
function collapse(docs: Sw8Doc[]): NearbyStation[] {
  const byName = new Map<string, NearbyStation>();

  for (const doc of docs) {
    const { name, line } = splitStationName(doc.place_name);
    const distanceM = parseInt(doc.distance, 10);
    if (!name || Number.isNaN(distanceM)) continue;

    const existing = byName.get(name);
    if (existing) {
      if (line && !existing.lines.includes(line)) existing.lines.push(line);
      // Different entrances give different distances; keep the closest.
      if (distanceM < existing.distanceM) existing.distanceM = distanceM;
    } else {
      byName.set(name, {
        name,
        lines: line ? [line] : [],
        distanceM,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
      });
    }
  }

  return [...byName.values()].sort((a, b) => a.distanceM - b.distanceM);
}

async function main() {
  if (!KAKAO_KEY) {
    console.error("✗ KAKAO_REST_API_KEY is not set");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("✗ Supabase env vars missing");
    process.exit(1);
  }
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  // distance_m / distance_source arrive in migration 0008. Without them the
  // link still records walk_minutes; the raw metres just aren't auditable.
  const { error: probe } = await supabase
    .from("property_subway")
    .select("distance_m")
    .limit(1);
  const hasDistanceColumns = !probe;
  if (!hasDistanceColumns) {
    console.log(
      `  note: property_subway.distance_m missing (migration 0008 not applied)\n` +
        `        walk_minutes will be stored, raw distance will not\n`,
    );
  }

  // Existing stations, keyed by Korean name so seeded rows are reused.
  const stationIdByName = new Map<string, string>();
  const takenSlugs = new Set<string>();
  {
    const { data } = await supabase
      .from("subway_stations")
      .select("id, name_ko, slug");
    (data ?? []).forEach((s) => {
      stationIdByName.set(s.name_ko, s.id);
      takenSlugs.add(s.slug);
    });
  }
  console.log(`${stationIdByName.size} stations already known\n`);

  // Listings with coordinates, paginated past PostgREST's 1,000-row cap.
  const rows: Array<{ id: string; name_ko: string; lat: number; lng: number }> = [];
  const PAGE = 1000;
  for (let from = 0; from < LIMIT; from += PAGE) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, name_ko, lat, lng")
      .not("lat", "is", null)
      .order("created_at")
      .range(from, Math.min(from + PAGE, LIMIT) - 1);
    if (error) {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  // Skip listings already linked, unless --redo.
  const alreadyLinked = new Set<string>();
  if (!REDO) {
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("property_subway")
        .select("property_id")
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((r) => alreadyLinked.add(r.property_id));
      if (data.length < PAGE) break;
    }
  }

  const todo = rows.filter((r) => !alreadyLinked.has(r.id));
  console.log(`${rows.length} listings with coordinates, ${todo.length} to process\n`);

  let linked = 0;
  let stationsCreated = 0;
  let noneNearby = 0;
  const samples: string[] = [];

  for (const [i, row] of todo.entries()) {
    const nearby = collapse(await kakaoNearbyStations(row.lat, row.lng)).slice(0, TOP);

    if (nearby.length === 0) {
      noneNearby++;
    } else {
      const links: Array<{
        property_id: string;
        station_id: string;
        walk_minutes: number;
        distance_m?: number;
        distance_source?: string;
      }> = [];

      for (const station of nearby) {
        let stationId = stationIdByName.get(station.name);

        if (!stationId && !DRY_RUN) {
          // Slug from the name minus the 역 suffix; disambiguate on collision.
          const base = slugifyKorean(station.name.replace(/역$/, "")) || "station";
          let slug = base;
          let n = 2;
          while (takenSlugs.has(slug)) slug = `${base}-${n++}`;

          const { data: created, error } = await supabase
            .from("subway_stations")
            .insert({
              slug,
              name_ko: station.name,
              name_en: base.charAt(0).toUpperCase() + base.slice(1),
              lines_ko: station.lines,
              lines_en: station.lines,
              lat: station.lat,
              lng: station.lng,
              is_featured: false,
              source: "kakao_sw8",
            })
            .select("id")
            .single();

          if (error || !created) {
            console.error(`  ✗ station ${station.name}: ${error?.message}`);
            continue;
          }
          stationId = created.id as string;
          stationIdByName.set(station.name, stationId);
          takenSlugs.add(slug);
          stationsCreated++;
        }

        if (!stationId) continue;

        links.push({
          property_id: row.id,
          station_id: stationId,
          walk_minutes: walkMinutesFrom(station.distanceM),
          ...(hasDistanceColumns
            ? { distance_m: station.distanceM, distance_source: "kakao_sw8" }
            : {}),
        });
      }

      if (samples.length < 10 && nearby[0]) {
        samples.push(
          `${row.name_ko} → ${nearby[0].name} ${nearby[0].distanceM}m (도보 ${walkMinutesFrom(nearby[0].distanceM)}분)`,
        );
      }

      if (!DRY_RUN && links.length > 0) {
        await supabase.from("property_subway").delete().eq("property_id", row.id);
        const { error } = await supabase.from("property_subway").insert(links);
        if (error) console.error(`  ✗ ${row.name_ko}: ${error.message}`);
        else linked++;
      } else if (DRY_RUN) {
        linked++;
      }
    }

    if ((i + 1) % 200 === 0) console.log(`  …${i + 1}/${todo.length} (linked ${linked})`);
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  console.log(`\n── Summary ──`);
  console.log(`  Listings linked      : ${linked}`);
  console.log(`  New stations created : ${stationsCreated}`);
  console.log(`  No station within ${RADIUS}m : ${noneNearby}`);
  console.log(`\n  Samples:`);
  samples.forEach((s) => console.log(`    ${s}`));
  if (DRY_RUN) console.log(`\n[dry run] Nothing written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
