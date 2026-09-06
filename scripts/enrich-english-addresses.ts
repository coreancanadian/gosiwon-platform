/**
 * Fill in properties.address_en via Google's reverse-geocoding, so the
 * English site shows an English address instead of falling back to Korean.
 *
 *   npm run enrich:en -- --dry-run --limit 25
 *   npm run enrich:en
 *
 * Flags:
 *   --dry-run     Look up and report; write nothing
 *   --limit <n>   Only process the first n listings
 *   --redo        Re-check listings that already have an English address
 *
 * Needs a listing's lat/lng (set by enrich-addresses.ts) and
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Kakao has no English-language geocoding —
 * Google's does, via `language=en` — which is why this is a separate script
 * from enrich-addresses.ts rather than one more field on that pass.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

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

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Google's default rate limit is generous, but this keeps a large backfill
// polite rather than testing it.
const THROTTLE_MS = 60;

interface Row {
  id: string;
  name_ko: string;
  lat: number | null;
  lng: number | null;
}

interface GeocodeResult {
  formatted_address: string;
  types: string[];
}

/** A REQUEST_DENIED/INVALID_REQUEST is configuration, not a transient miss. */
function abortOnConfigError(status: string, errorMessage?: string): void {
  if (status !== "REQUEST_DENIED" && status !== "INVALID_REQUEST") return;
  console.error(`\n✗ Google rejected the request: ${status}`);
  if (errorMessage) console.error(`  ${errorMessage}`);
  console.error(`  Check that the Geocoding API is enabled on the key's Google Cloud project`);
  console.error(`  (Maps JavaScript API being enabled does not also enable this one).`);
  process.exit(1);
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&key=${GOOGLE_KEY}`;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      const data = (await res.json()) as {
        status: string;
        error_message?: string;
        results: GeocodeResult[];
      };

      abortOnConfigError(data.status, data.error_message);

      if (data.status === "OVER_QUERY_LIMIT" || data.status === "UNKNOWN_ERROR") {
        const wait = 1000 * 2 ** (attempt - 1);
        console.warn(`  ⚠︎ ${data.status}, retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (data.status !== "OK" || data.results.length === 0) return null;

      // Prefer the most specific street-level result; Google sometimes leads
      // with a plus-code or a broader political boundary for a rural point.
      const best =
        data.results.find((r) => r.types.includes("street_address")) ??
        data.results.find((r) => r.types.includes("premise")) ??
        data.results[0];

      // Drop the trailing ", South Korea" — address_ko carries no country
      // name either, so the two stay visually consistent.
      return best.formatted_address.replace(/,\s*South Korea$/, "");
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`  ⚠︎ network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  return null;
}

async function main() {
  if (!GOOGLE_KEY) {
    console.error("✗ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set.");
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

  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; from < LIMIT; from += PAGE) {
    let query = supabase
      .from("properties")
      .select("id, name_ko, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("created_at")
      .range(from, Math.min(from + PAGE, LIMIT) - 1);

    if (!REDO) query = query.is("address_en", null);

    const { data, error } = await query;
    if (error) {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }

  const rows = all;
  console.log(`Reverse-geocoding ${rows.length} listing(s) via Google\n`);

  let resolved = 0;
  let notFound = 0;

  for (const [i, row] of rows.entries()) {
    const address = await reverseGeocode(row.lat!, row.lng!);

    if (!address) {
      notFound++;
    } else {
      resolved++;
      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("properties")
          .update({ address_en: address, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (updateError) console.error(`  ✗ ${row.name_ko}: ${updateError.message}`);
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  …${i + 1}/${rows.length}  (resolved ${resolved})`);
    }
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  console.log(`\n── Summary ──`);
  console.log(`  Resolved:    ${resolved}`);
  console.log(`  No result:   ${notFound}`);
  if (DRY_RUN) console.log(`\n[dry run] Nothing written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
