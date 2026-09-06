/**
 * Build the universities table from what listings actually reference.
 *
 *   npx tsx scripts/seed-universities.ts --dry-run
 *   npx tsx scripts/seed-universities.ts
 *
 * Names come from properties.nearby_universities, so they match the array
 * values exactly — a canonical list from elsewhere would spell things
 * differently and the lookups would silently return nothing.
 *
 * "Top 100" is by number of published listings nearby, not by prestige. For a
 * housing site that is the useful ranking: a university with no rooms around it
 * is not worth a tile.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { slugifyKorean } from "./romanize";

config({ path: ".env.local" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const DRY_RUN = process.argv.includes("--dry-run");
const TOP_N = flag("top") ? parseInt(flag("top")!, 10) : 100;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

/**
 * The ten shown on the home page — two full rows of the five-column grid, the
 * same shape as the district and subway sections.
 *
 * Chosen for name recognition among international students, weighted by actual
 * nearby inventory. 홍익대 and 숭실대 round it out: 홍대 is one of the areas
 * foreigners already know by name, and 숭실대 is third overall by listing count.
 * Everything else stays searchable but untiled — including, deliberately, the
 * non-Seoul universities briefly featured here: kept in the table and fully
 * searchable, just not tiled on the home page.
 */
const FEATURED = [
  "서울대학교",
  "연세대학교",
  "고려대학교",
  "한양대학교",
  "중앙대학교 서울캠퍼스",
  "경희대학교",
  "성균관대학교",
  "이화여자대학교",
  "홍익대학교",
  "숭실대학교",
];


/**
 * Official English names.
 *
 * Transliteration is not good enough here: 연세대학교 romanises to "Yeonse",
 * but every foreign student searches "Yonsei". Likewise 고려대학교 is "Korea
 * University", not "Goryeo". Since the English site exists for exactly those
 * users, the well-known schools get their real names and the long tail falls
 * back to romanisation.
 */
const ENGLISH_NAMES: Record<string, string> = {
  "서울대학교": "Seoul National University",
  "연세대학교": "Yonsei University",
  "고려대학교": "Korea University",
  "한양대학교": "Hanyang University",
  "중앙대학교 서울캠퍼스": "Chung-Ang University",
  "중앙대학교": "Chung-Ang University",
  "경희대학교": "Kyung Hee University",
  "성균관대학교": "Sungkyunkwan University",
  "이화여자대학교": "Ewha Womans University",
  "서강대학교": "Sogang University",
  "홍익대학교": "Hongik University",
  "숭실대학교": "Soongsil University",
  "가톨릭대학교": "Catholic University of Korea",
  "서울교육대학교": "Seoul National University of Education",
  "한국방송통신대학교": "Korea National Open University",
  "동국대학교": "Dongguk University",
  "건국대학교": "Konkuk University",
  "세종대학교": "Sejong University",
  "서울시립대학교": "University of Seoul",
  "성신여자대학교": "Sungshin Women's University",
  "한성대학교": "Hansung University",
  "총신대학교": "Chongshin University",
  "추계예술대학교": "Chugye University for the Arts",
  "국민대학교": "Kookmin University",
  "서울여자대학교": "Seoul Women's University",
  "덕성여자대학교": "Duksung Women's University",
  "상명대학교": "Sangmyung University",
  "광운대학교": "Kwangwoon University",
  "인하대학교": "Inha University",
  "아주대학교": "Ajou University",
  "단국대학교": "Dankook University",
  "경기대학교": "Kyonggi University",
  "한국외국어대학교": "Hankuk University of Foreign Studies",
  "서울과학기술대학교": "Seoul National University of Science and Technology",
  "삼육대학교": "Sahmyook University",
  "성공회대학교": "Sungkonghoe University",
  "명지대학교": "Myongji University",
  "전남대학교": "Chonnam National University",
  "부산대학교": "Pusan National University",
  "경북대학교": "Kyungpook National University",
  "충남대학교": "Chungnam National University",
  "충북대학교": "Chungbuk National University",
  "전북대학교": "Jeonbuk National University",
  "강원대학교": "Kangwon National University",
  "제주대학교": "Jeju National University",
  "동아대학교": "Dong-A University",
  "동의대학교": "Dong-eui University",
  "부경대학교": "Pukyong National University",
  "계명대학교": "Keimyung University",
  "영남대학교": "Yeungnam University",
  "울산대학교": "University of Ulsan",
  "가천대학교": "Gachon University",
  "순천향대학교": "Soonchunhyang University",
  "단국대학교 천안캠퍼스": "Dankook University Cheonan Campus",
  "한국항공대학교": "Korea Aerospace University",
  "서울신학대학교": "Seoul Theological University",
  "가톨릭관동대학교": "Catholic Kwandong University",
};

function englishName(nameKo: string, romanBase: string): string {
  return (
    ENGLISH_NAMES[nameKo] ??
    `${romanBase.charAt(0).toUpperCase()}${romanBase.slice(1)} University`
  );
}

/** Drop the campus qualifier for a tile label: 중앙대학교 서울캠퍼스 -> 중앙대학교. */
function shortName(name: string): string {
  return name.replace(/\s*(서울|안성|글로벌|제2|제1|국제)?캠퍼스$/, "").trim();
}

async function geocode(
  name: string,
): Promise<{ lat: number; lng: number; city: string } | null> {
  if (!KAKAO_KEY) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({
          query: name,
          // SC4 = 학교. Without it "고려대학교" matches shops named after it.
          category_group_code: "SC4",
          size: "5",
        })}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
      );
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      if (!res.ok) return null;

      const data = (await res.json()) as {
        documents: Array<{
          place_name: string;
          address_name: string;
          road_address_name: string;
          x: string;
          y: string;
        }>;
      };
      const hit = data.documents?.[0];
      if (!hit) return null;

      const addr = hit.road_address_name || hit.address_name || "";
      return {
        lat: parseFloat(hit.y),
        lng: parseFloat(hit.x),
        city: addr.split(/\s+/).slice(0, 2).join(" "),
      };
    } catch {
      if (attempt === 3) return null;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return null;
}

async function main() {
  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error: probe } = await sb.from("universities").select("id").limit(1);
  if (probe) {
    console.error(`✗ universities table missing — run migration 0009 first.`);
    console.error(`  ${probe.message}`);
    process.exit(1);
  }

  // Count listings per university name.
  const rows: Array<{ nearby_universities: string[] }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("properties")
      .select("nearby_universities")
      .eq("is_published", true)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < 1000) break;
  }

  const counts = new Map<string, number>();
  rows.forEach((r) =>
    (r.nearby_universities ?? []).forEach((u) =>
      counts.set(u, (counts.get(u) ?? 0) + 1),
    ),
  );

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_N);

  console.log(`${counts.size} universities referenced; taking top ${ranked.length}\n`);

  const { data: existing } = await sb
    .from("universities")
    .select("id, name_ko, slug, lat");
  const byName = new Map((existing ?? []).map((u) => [u.name_ko, u]));
  const takenSlugs = new Set((existing ?? []).map((u) => u.slug));

  let inserted = 0;
  let updated = 0;
  let geocoded = 0;

  for (const [index, [name, count]] of ranked.entries()) {
    const current = byName.get(name);
    const featuredIndex = FEATURED.indexOf(name);
    const isFeatured = featuredIndex >= 0;

    // Only geocode rows that need it; re-runs shouldn't re-query Kakao.
    let coords: Awaited<ReturnType<typeof geocode>> = null;
    if (!current || current.lat == null) {
      coords = await geocode(name);
      if (coords) geocoded++;
      await new Promise((r) => setTimeout(r, 120));
    }

    if (index < 8 || isFeatured) {
      console.log(
        `  ${String(count).padStart(4)}  ${name.padEnd(24)}` +
          `${isFeatured ? " ★featured" : ""}${coords ? `  ${coords.city}` : ""}`,
      );
    }

    if (DRY_RUN) continue;

    if (current) {
      const patch: Record<string, unknown> = {
        listing_count: count,
        is_featured: isFeatured,
        sort_order: isFeatured ? featuredIndex : index,
        // Refresh so previously romanised names pick up the official spelling.
        name_en: englishName(
          name,
          slugifyKorean(shortName(name).replace(/대학교$/, "")) || "univ",
        ),
      };
      if (coords) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
        patch.city_ko = coords.city;
      }
      const { error } = await sb.from("universities").update(patch).eq("id", current.id);
      if (error) console.error(`  ✗ ${name}: ${error.message}`);
      else updated++;
      continue;
    }

    const base = slugifyKorean(shortName(name).replace(/대학교$/, "")) || "univ";
    let slug = base;
    let n = 2;
    while (takenSlugs.has(slug)) slug = `${base}-${n++}`;
    takenSlugs.add(slug);

    const { error } = await sb.from("universities").insert({
      slug,
      name_ko: name,
      name_en: englishName(name, base),
      short_name_ko: shortName(name),
      city_ko: coords?.city ?? null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      listing_count: count,
      is_featured: isFeatured,
      sort_order: isFeatured ? featuredIndex : index,
    });
    if (error) console.error(`  ✗ ${name}: ${error.message}`);
    else inserted++;
  }

  const missingFeatured = FEATURED.filter((f) => !counts.has(f));
  if (missingFeatured.length > 0) {
    console.warn(`\n⚠︎ featured universities with no listings (no tile will show):`);
    missingFeatured.forEach((f) => console.warn(`    ${f}`));
  }

  console.log(`\n── Summary ──`);
  console.log(`  Inserted  : ${inserted}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Geocoded  : ${geocoded}`);
  if (DRY_RUN) console.log(`\n[dry run] Nothing written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
