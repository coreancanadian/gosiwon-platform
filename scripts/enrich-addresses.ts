/**
 * Resolve district-level listing addresses to real buildings via Kakao Local.
 *
 *   npm run enrich -- --dry-run --limit 25
 *   npm run enrich
 *
 * Flags:
 *   --dry-run     Look up and report; write nothing
 *   --limit <n>   Only process the first n listings
 *   --redo        Re-check listings already resolved (default: skip them)
 *
 * Needs KAKAO_REST_API_KEY. Searching "<business name> <district>" returns the
 * road address, precise coordinates, the publicly listed phone number, and a
 * canonical Kakao place id.
 *
 * A result is written only when the district agrees AND the name is close
 * enough (see place-match.ts). Everything else is reported for review rather
 * than guessed at — a wrong match puts a real building's address on the wrong
 * business, which is worse than no address at all.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { looksLikeAddress, pickBest, type KakaoPlace } from "./place-match";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (n: string) => process.argv.includes(`--${n}`);

const DRY_RUN = has("dry-run");
const REDO = has("redo");
const LIMIT = flag("limit") ? parseInt(flag("limit")!, 10) : Infinity;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// Kakao's Local API allows 30k–100k calls/day depending on the app tier.
// ~8 requests/second keeps well clear of the per-second ceiling.
const THROTTLE_MS = 130;

interface Row {
  id: string;
  name_ko: string;
  address_ko: string;
  address_original: string | null;
}

async function kakao<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://dapi.kakao.com${path}?${qs}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });

  if (res.status === 429) {
    console.warn("  ⚠︎ rate limited, backing off 2s");
    await new Promise((r) => setTimeout(r, 2000));
    return null;
  }
  if (!res.ok) {
    console.warn(`  ⚠︎ ${res.status} ${res.statusText}`);
    return null;
  }
  return (await res.json()) as T;
}

async function searchKeyword(query: string): Promise<KakaoPlace[]> {
  const data = await kakao<{ documents: KakaoPlace[] }>(
    "/v2/local/search/keyword.json",
    { query, size: "15" },
  );
  return data?.documents ?? [];
}

/** For rows whose "name" is really an address, resolve it directly. */
async function searchAddress(query: string): Promise<KakaoPlace[]> {
  const data = await kakao<{
    documents: Array<{
      address_name: string;
      x: string;
      y: string;
      road_address: { address_name: string } | null;
    }>;
  }>("/v2/local/search/address.json", { query, size: "5" });

  return (data?.documents ?? []).map((d) => ({
    id: "",
    place_name: d.address_name,
    category_name: "",
    category_group_code: "",
    phone: "",
    address_name: d.address_name,
    road_address_name: d.road_address?.address_name ?? "",
    x: d.x,
    y: d.y,
    place_url: "",
  }));
}

async function main() {
  if (!KAKAO_KEY) {
    console.error("✗ KAKAO_REST_API_KEY is not set.");
    console.error("  Get a REST API key at https://developers.kakao.com → My Application.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const supabase: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  let query = supabase
    .from("properties")
    .select("id, name_ko, address_ko, address_original")
    .order("created_at");

  if (!REDO) query = query.eq("address_source", "import");

  const { data, error } = await query;
  if (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }

  const rows = (data as Row[]).slice(0, LIMIT);
  console.log(`Resolving ${rows.length} listing(s) via Kakao Local\n`);

  let resolved = 0;
  let rejected = 0;
  let notFound = 0;
  let withPhone = 0;
  const rejects: string[] = [];

  for (const [i, row] of rows.entries()) {
    const sourceAddress = row.address_original ?? row.address_ko;
    const isAddressName = looksLikeAddress(row.name_ko);

    // Including the district in the query is what keeps a common 고시원 name
    // from matching an identically-named place in another city.
    let places = isAddressName
      ? await searchAddress(row.name_ko)
      : await searchKeyword(`${row.name_ko} ${sourceAddress}`);

    // Fall back to the bare name; the district check still guards the result.
    if (places.length === 0 && !isAddressName) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
      places = await searchKeyword(row.name_ko);
    }

    if (places.length === 0) {
      notFound++;
    } else {
      const best = pickBest(row.name_ko, sourceAddress, places);

      if (!best) {
        rejected++;
        const top = places[0];
        rejects.push(
          `${row.name_ko}  [${sourceAddress}]  →  ${top.place_name} [${top.road_address_name || top.address_name}]`,
        );
      } else {
        resolved++;
        if (best.place.phone) withPhone++;

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from("properties")
            .update({
              address_original: row.address_original ?? row.address_ko,
              address_ko: best.place.road_address_name || best.place.address_name,
              road_address: best.place.road_address_name || null,
              jibun_address: best.place.address_name || null,
              lat: parseFloat(best.place.y),
              lng: parseFloat(best.place.x),
              listing_phone: best.place.phone || null,
              kakao_place_id: best.place.id || null,
              kakao_place_url: best.place.place_url || null,
              address_source: "kakao_place",
              address_verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (updateError) console.error(`  ✗ ${row.name_ko}: ${updateError.message}`);
        }
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  …${i + 1}/${rows.length}  (resolved ${resolved})`);
    }
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  console.log(`\n── Summary ──`);
  console.log(`  Resolved to a building: ${resolved}`);
  console.log(`  Phone number found:     ${withPhone}`);
  console.log(`  Rejected (bad match):   ${rejected}`);
  console.log(`  No Kakao result:        ${notFound}`);

  if (rejects.length > 0) {
    console.log(`\n⚠︎ Rejected candidates — left at district level, not guessed:`);
    rejects.slice(0, 30).forEach((r) => console.log(`    ${r}`));
    if (rejects.length > 30) console.log(`    …and ${rejects.length - 30} more`);
  }

  if (DRY_RUN) console.log(`\n[dry run] Nothing written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
