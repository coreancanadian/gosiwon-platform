/**
 * Enumerate every subway/전철 station in Korea and load them into
 * subway_stations.
 *
 *   npx tsx scripts/seed-subway-stations.ts --dry-run
 *   npx tsx scripts/seed-subway-stations.ts
 *
 * Kakao's category search (SW8) accepts a bounding box but returns at most 45
 * results per box, so a single national query would silently truncate. Instead
 * this walks a quadtree: query a box, and if Kakao reports more results than it
 * will hand back, split into four and recurse. That guarantees completeness
 * while making far fewer calls than a fixed fine grid — dense Seoul subdivides
 * deeply, empty sea and mountains stop after one call.
 *
 * Curated home-page stations are matched by Korean name and left alone
 * (is_featured stays true); everything else is inserted with is_featured=false,
 * so the home page is unchanged and the rest simply become matchable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { slugifyKorean, splitStationName } from "./romanize";

config({ path: ".env.local" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (n: string) => process.argv.includes(`--${n}`);

const DRY_RUN = has("dry-run");
const THROTTLE_MS = 120;
const MAX_DEPTH = flag("depth") ? parseInt(flag("depth")!, 10) : 9;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

/**
 * Rail-served regions. Deliberately generous — 수도권 전철 reaches 문산,
 * 춘천, 신창 and 서해금빛 lines, well beyond the metropolitan boundary.
 */
const REGIONS: Array<{ name: string; box: [number, number, number, number] }> = [
  // [minLng, minLat, maxLng, maxLat]
  { name: "수도권·강원 서부", box: [126.2, 36.6, 127.9, 38.35] },
  { name: "부산·울산·경남", box: [128.5, 34.85, 129.6, 35.75] },
  { name: "대구·경북", box: [128.3, 35.6, 129.0, 36.35] },
  { name: "광주·전남", box: [126.5, 34.9, 127.2, 35.35] },
  { name: "대전·충청", box: [126.9, 36.1, 127.7, 36.9] },
];

interface Sw8Doc {
  id: string;
  place_name: string;
  x: string;
  y: string;
  category_name: string;
}

interface Station {
  name: string;
  lines: Set<string>;
  lat: number;
  lng: number;
}

let apiCalls = 0;

async function fetchBox(
  box: [number, number, number, number],
  page: number,
): Promise<{ docs: Sw8Doc[]; total: number; isEnd: boolean } | null> {
  const qs = new URLSearchParams({
    category_group_code: "SW8",
    rect: box.join(","),
    page: String(page),
    size: "15",
  });
  const url = `https://dapi.kakao.com/v2/local/search/category.json?${qs}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      apiCalls++;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      });

      if (res.status === 401 || res.status === 403) {
        console.error(`\n✗ Kakao rejected the request: ${await res.text()}`);
        process.exit(1);
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        continue;
      }
      if (!res.ok) return null;

      const data = (await res.json()) as {
        documents: Sw8Doc[];
        meta: { total_count: number; is_end: boolean; pageable_count: number };
      };
      return {
        docs: data.documents ?? [],
        total: data.meta?.total_count ?? 0,
        isEnd: data.meta?.is_end ?? true,
      };
    } catch {
      if (attempt === 4) return null;
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  return null;
}

async function sweep(
  box: [number, number, number, number],
  found: Map<string, Station>,
  depth = 0,
): Promise<void> {
  const first = await fetchBox(box, 1);
  await new Promise((r) => setTimeout(r, THROTTLE_MS));
  if (!first) return;
  if (first.total === 0) return;

  // Kakao hands back at most 45 (3 pages x 15). More than that means this box
  // is hiding results, so split it rather than accept a truncated answer.
  if (first.total > 45 && depth < MAX_DEPTH) {
    const [minLng, minLat, maxLng, maxLat] = box;
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;
    for (const quad of [
      [minLng, minLat, midLng, midLat],
      [midLng, minLat, maxLng, midLat],
      [minLng, midLat, midLng, maxLat],
      [midLng, midLat, maxLng, maxLat],
    ] as Array<[number, number, number, number]>) {
      await sweep(quad, found, depth + 1);
    }
    return;
  }

  const collect = (docs: Sw8Doc[]) => {
    for (const doc of docs) {
      const { name, line } = splitStationName(doc.place_name);
      if (!name) continue;
      const existing = found.get(name);
      if (existing) {
        if (line) existing.lines.add(line);
      } else {
        found.set(name, {
          name,
          lines: new Set(line ? [line] : []),
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
        });
      }
    }
  };

  collect(first.docs);

  for (let page = 2; page <= 3 && !first.isEnd; page++) {
    const next = await fetchBox(box, page);
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
    if (!next) break;
    collect(next.docs);
    if (next.isEnd) break;
  }
}

async function main() {
  if (!KAKAO_KEY) {
    console.error("✗ KAKAO_REST_API_KEY is not set");
    process.exit(1);
  }

  const found = new Map<string, Station>();

  for (const region of REGIONS) {
    const before = found.size;
    await sweep(region.box, found);
    console.log(
      `  ${region.name.padEnd(18)} +${String(found.size - before).padStart(4)} stations   (${apiCalls} calls so far)`,
    );
  }

  console.log(`\n${found.size} distinct stations found in ${apiCalls} API calls`);

  if (DRY_RUN) {
    const sample = [...found.values()].slice(0, 15);
    console.log(`\nsample:`);
    sample.forEach((s) =>
      console.log(`  ${s.name.padEnd(14)} ${[...s.lines].join(", ")}`),
    );
    console.log(`\n[dry run] Nothing written.`);
    return;
  }

  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: existing } = await sb
    .from("subway_stations")
    .select("id, name_ko, slug");
  const byName = new Map((existing ?? []).map((s) => [s.name_ko, s]));
  const takenSlugs = new Set((existing ?? []).map((s) => s.slug));

  let inserted = 0;
  let updated = 0;
  const toInsert: Array<Record<string, unknown>> = [];

  for (const station of found.values()) {
    const lines = [...station.lines];
    const current = byName.get(station.name);

    if (current) {
      // Curated rows keep their hand-written slug, English name and featured
      // flag; only the line list is refreshed.
      if (lines.length > 0) {
        await sb
          .from("subway_stations")
          .update({ lines_ko: lines, lines_en: lines })
          .eq("id", current.id);
        updated++;
      }
      continue;
    }

    const base = slugifyKorean(station.name.replace(/역$/, "")) || "station";
    let slug = base;
    let n = 2;
    while (takenSlugs.has(slug)) slug = `${base}-${n++}`;
    takenSlugs.add(slug);

    toInsert.push({
      slug,
      name_ko: station.name,
      name_en: base.charAt(0).toUpperCase() + base.slice(1),
      lines_ko: lines,
      lines_en: lines,
      lat: station.lat,
      lng: station.lng,
      is_featured: false,
      source: "kakao_sw8",
      sort_order: 0,
    });
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await sb.from("subway_stations").insert(chunk);
    if (error) {
      console.error(`✗ insert failed: ${error.message}`);
      process.exit(1);
    }
    inserted += chunk.length;
  }

  console.log(`\n── Summary ──`);
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Updated  : ${updated} (existing rows, line list refreshed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
