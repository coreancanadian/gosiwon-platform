/**
 * Replace address-shaped names with a readable descriptive name.
 *
 *   npx tsx scripts/fix-listing-names.ts --dry-run
 *   npx tsx scripts/fix-listing-names.ts
 *
 * One source file (원투룸.xlsx) has an address in its 업체명 column, so ~308
 * listings display as "서울 관악구 신림동 251-349" where a business name should
 * be. These are individual 원룸/오피스텔 units let through agencies, not named
 * businesses — a Kakao lookup at those addresses returns nothing, or an
 * unrelated neighbouring shop. There is no business name to recover.
 *
 * So instead of leaving a lot number as the title, they get the same kind of
 * descriptive name Korean listing sites use for unnamed units:
 *
 *   서울 관악구 신림동 251-349  ->  관악구 신림동 원룸
 *                                  One-room in Sillim-dong, Gwanak-gu
 *
 * Nothing is lost: the lot number already lives in jibun_address /
 * address_original.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { looksLikeAddress } from "./place-match";
import { slugifyKorean } from "./romanize";

config({ path: ".env.local" });

const has = (n: string) => process.argv.includes(`--${n}`);
const DRY_RUN = has("dry-run");

const TYPE_KO: Record<string, string> = {
  one_room: "원룸",
  officetel: "오피스텔",
  gosiwon: "고시원",
  oneroomtel: "원룸텔",
  share_house: "셰어하우스",
  coliving: "코리빙하우스",
  dormitory: "기숙사",
};

const TYPE_EN: Record<string, string> = {
  one_room: "One-room",
  officetel: "Officetel",
  gosiwon: "Gosiwon",
  oneroomtel: "Oneroomtel",
  share_house: "Share house",
  coliving: "Co-living",
  dormitory: "Dormitory",
};

/** Capitalised romanisation with the Korean suffix kept: 신림동 -> Sillim-dong. */
function romanizeArea(korean: string): string {
  const suffixMatch = korean.match(/(동|가|읍|면|리|구|시|군)$/);
  const suffix = suffixMatch ? suffixMatch[1] : "";
  const stem = suffix ? korean.slice(0, -1) : korean;
  const roman = slugifyKorean(stem);
  const capitalised = roman.charAt(0).toUpperCase() + roman.slice(1);
  const SUFFIX_EN: Record<string, string> = {
    동: "-dong", 가: "-ga", 읍: "-eup", 면: "-myeon",
    리: "-ri", 구: "-gu", 시: "-si", 군: "-gun",
  };
  return capitalised + (SUFFIX_EN[suffix] ?? "");
}

interface Row {
  id: string;
  name_ko: string;
  name_en: string | null;
  address_original: string | null;
  address_ko: string;
  property_type: string;
}

/**
 * Build the name from the district and neighbourhood in the ORIGINAL imported
 * address, not the enriched road address — a road name ("시흥대로162길") is a
 * worse label for a home than a neighbourhood ("신림동").
 */
function buildNames(row: Row): { ko: string; en: string } | null {
  const source = row.address_original ?? row.address_ko;
  const parts = source.trim().split(/\s+/);
  // Expect at least "<시도> <시군구> <동>".
  if (parts.length < 3) return null;

  const gu = parts[1];
  const dong = parts[2];
  const typeKo = TYPE_KO[row.property_type] ?? "원룸";
  const typeEn = TYPE_EN[row.property_type] ?? "One-room";

  return {
    ko: `${gu} ${dong} ${typeKo}`,
    en: `${typeEn} in ${romanizeArea(dong)}, ${romanizeArea(gu)}`,
  };
}

async function main() {
  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("properties")
      .select("id, name_ko, name_en, address_original, address_ko, property_type")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }

  const targets = rows.filter((r) => looksLikeAddress(r.name_ko));
  console.log(`${rows.length} listings, ${targets.length} with an address as the name\n`);

  let updated = 0;
  let skipped = 0;

  for (const [i, row] of targets.entries()) {
    const names = buildNames(row);
    if (!names) {
      skipped++;
      continue;
    }

    if (i < 10) {
      console.log(`  ${row.name_ko}`);
      console.log(`    -> ${names.ko}   /   ${names.en}`);
    }

    if (!DRY_RUN) {
      const { error } = await sb
        .from("properties")
        .update({
          name_ko: names.ko,
          name_en: names.en,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) {
        console.error(`  ✗ ${row.id}: ${error.message}`);
        continue;
      }
    }
    updated++;
  }

  console.log(`\n── Summary ──`);
  console.log(`  Renamed : ${updated}`);
  console.log(`  Skipped : ${skipped} (address too short to derive a name)`);
  if (DRY_RUN) console.log(`\n[dry run] Nothing written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
