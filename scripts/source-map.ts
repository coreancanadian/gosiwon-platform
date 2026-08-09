/**
 * Mapping from the source spreadsheets' Korean vocabulary to our schema.
 * Derived by profiling all four files (2,196 unique listings).
 */

export type PropertyType =
  | "gosiwon"
  | "oneroomtel"
  | "share_house"
  | "coliving"
  | "one_room"
  | "officetel"
  | "dormitory";

/**
 * 주거형태. Values are sometimes pipe-combined ("고시원|원룸텔"), in which case
 * the FIRST token wins — the source lists the primary product first.
 *
 * 원룸텔 and 코리빙하우스 stay distinct from 고시원 on purpose: they are
 * different products at different price points, and collapsing them would make
 * the 고시원 filter lie.
 */
const TYPE_BY_KO: Record<string, PropertyType> = {
  고시원: "gosiwon",
  원룸텔: "oneroomtel",
  쉐어하우스: "share_house",
  셰어하우스: "share_house",
  코리빙하우스: "coliving",
  "원･투룸": "one_room",
  "원·투룸": "one_room",
  원투룸: "one_room",
  원룸: "one_room",
  오피스텔: "officetel",
  기숙사: "dormitory",
  // Present only in combos; never primary in the source data.
  게스트하우스: "share_house",
  모텔: "oneroomtel",
};

export function parsePropertyType(raw: string | null): PropertyType {
  if (!raw) return "gosiwon";
  for (const token of raw.split("|").map((t) => t.trim())) {
    const hit = TYPE_BY_KO[token];
    if (hit) return hit;
  }
  return "gosiwon";
}

/** All types named in a pipe-combined value, primary first, deduped. */
export function parseAllPropertyTypes(raw: string | null): PropertyType[] {
  if (!raw) return [];
  const out: PropertyType[] = [];
  for (const token of raw.split("|").map((t) => t.trim())) {
    const hit = TYPE_BY_KO[token];
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** 남녀구분. 남녀분리 means both sexes accepted but housed on separate floors. */
export function parseGender(raw: string | null): {
  gender: "any" | "male" | "female";
  separatedFloors: boolean;
} {
  const v = (raw ?? "").replace(/\s/g, "");
  if (v === "여성전용") return { gender: "female", separatedFloors: false };
  if (v === "남성전용") return { gender: "male", separatedFloors: false };
  if (v === "남녀분리") return { gender: "any", separatedFloors: true };
  return { gender: "any", separatedFloors: false };
}

/**
 * 보증금(만원) / 월세(최소) / 월세(최대) are all quoted in 만원.
 * "70.0" means ₩700,000.
 */
export function manwonToKrw(raw: string | number | null): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10_000);
}

/**
 * 층 정보 comes as "<total>|<comma list of floors in use>":
 *   "4|1,2,3,4" -> 4 floors, in use 1~4F
 *   "2|-1,2"    -> 2 floors, in use B1, 2F
 *   "3"         -> 3 floors, usage unknown
 *   "|" or ""   -> nothing known
 * A stray "-0.5" appears in the source and is treated as unknown.
 */
export function parseFloors(raw: string | null): {
  total: number | null;
  used: string | null;
} {
  const text = (raw ?? "").trim();
  if (!text || text === "|") return { total: null, used: null };

  const [totalPart, usedPart] = text.split("|");
  const totalNum = parseFloat(totalPart);
  const total =
    Number.isFinite(totalNum) && totalNum >= 1 && totalNum <= 200
      ? Math.round(totalNum)
      : null;

  if (!usedPart) return { total, used: null };

  const floors = usedPart
    .split(",")
    .map((f) => parseInt(f.trim(), 10))
    .filter((f) => Number.isFinite(f));

  if (floors.length === 0) return { total, used: null };

  const label = (f: number) => (f < 0 ? `B${Math.abs(f)}` : `${f}`);
  const contiguous = floors.every((f, i) => i === 0 || f === floors[i - 1] + 1);

  const used =
    floors.length > 1 && contiguous
      ? `${label(floors[0])}~${label(floors[floors.length - 1])}F`
      : `${floors.map(label).join(", ")}F`;

  return { total, used };
}

/**
 * The six facility columns hold space-separated Korean tokens. Some carry a
 * count suffix — "공용화장실(2)", "샤워기(4)" — which we strip, since the schema
 * models amenities as present/absent.
 */
export function normalizeAmenityToken(token: string): string {
  return token.replace(/\(.*?\)/g, "").trim();
}

/** Source token -> amenities.slug. Tokens absent here are reported, not dropped silently. */
export const AMENITY_SLUG_BY_TOKEN: Record<string, string> = {
  // 세탁시설
  세탁기: "washer",
  건조기: "dryer",
  건조대: "drying-rack",
  다리미: "iron",

  // 청결시설
  공용화장실: "shared-toilet",
  샤워기: "shared-shower",
  좌변기: "shared-toilet",

  // 주방시설
  인덕션: "cooktop",
  가스레인지: "gas-range",
  전자레인지: "microwave",
  전기밥솥: "rice-cooker",
  정수기: "water-purifier",
  조리도구: "cookware",
  공용냉장고: "fridge-shared",
  식탁: "dining-table",
  토스트기: "toaster",
  전기포트: "electric-kettle",
  커피머신: "coffee-machine",
  자판기: "vending-machine",

  // 생활시설
  WIFI: "wifi",
  wifi: "wifi",
  TV: "tv",
  IPTV: "iptv",
  공용에어컨: "aircon-shared",
  공기청정기: "air-purifier",
  소파: "sofa",
  공용PC: "shared-pc",
  운동기구: "gym-equipment",
  프로젝터: "projector",

  // 안전시설
  CCTV: "cctv",
  디지털도어락: "door-lock",
  소화기: "fire-equipment",
  스프링쿨러: "sprinkler",
  공동현관: "secure-entrance",
  인터폰: "intercom",
  화재경보기: "fire-alarm",
  방범창: "window-bars",

  // 제공 비품
  밥: "rice-free",
  라면: "ramen-free",
  김치: "kimchi-free",
  조미료: "seasoning-free",
  "차·커피": "tea-coffee-free",
  반찬: "side-dish-free",
  국: "soup-free",
  계란: "egg-free",
  세탁세제: "detergent-free",
  휴지: "tissue-free",
  실내화: "slippers",
};

/** 난방시설 is a single value per listing rather than a token list. */
export const HEATING_SLUG_BY_VALUE: Record<string, string> = {
  중앙난방: "heating-central",
  개별난방: "heating-individual",
  지역난방: "heating-district",
};

/**
 * Maps "서울 관악구" / "경기 성남시" to a regions.slug.
 * Only the curated home-page regions are matched; listings elsewhere import
 * fine with region_id null and stay reachable via text search.
 */
export const REGION_SLUG_BY_GU: Record<string, string> = {
  "서울 강남구": "gangnam-gu",
  "서울 서초구": "seocho-gu",
  "서울 송파구": "songpa-gu",
  "서울 마포구": "mapo-gu",
  "서울 서대문구": "seodaemun-gu",
  "서울 관악구": "gwanak-gu",
  "서울 종로구": "jongno-gu",
  "서울 중구": "jung-gu-seoul",
  "서울 영등포구": "yeongdeungpo-gu",
  "서울 동작구": "dongjak-gu",
  "인천 연수구": "yeonsu-gu",
  "인천 남동구": "namdong-gu",
  "인천 부평구": "bupyeong-gu",
  "인천 미추홀구": "michuhol-gu",
  "인천 서구": "seo-gu-incheon",
  "경기 수원시": "suwon",
  "경기 성남시": "seongnam",
  "경기 고양시": "goyang",
  "충남 천안시": "cheonan",
  "충북 청주시": "cheongju",
};

/** City-level fallback for the 광역시, whose rows read "부산 부산진구" etc. */
export const REGION_SLUG_BY_CITY: Record<string, string> = {
  부산: "busan",
  대구: "daegu",
  대전: "daejeon",
  광주: "gwangju",
  울산: "ulsan",
};

export function matchRegionSlug(location: string | null): string | null {
  if (!location) return null;
  const parts = location.trim().split(/\s+/);
  if (parts.length === 0) return null;

  const twoToken = parts.slice(0, 2).join(" ");
  if (REGION_SLUG_BY_GU[twoToken]) return REGION_SLUG_BY_GU[twoToken];

  return REGION_SLUG_BY_CITY[parts[0]] ?? null;
}

/**
 * 근처 지하철 is space-separated station names ("안암역 고려대역"). One source
 * file sometimes puts an address here instead, so require the 역 suffix.
 */
export function parseStations(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("역") && s.length >= 2);
}

/**
 * 근처 대학교 is space-separated, but a campus qualifier is its own token:
 * "중앙대학교 서울캠퍼스" is ONE university, not two. Fold any 캠퍼스 token back
 * into the name before it.
 */
export function parseUniversities(raw: string | null): string[] {
  if (!raw) return [];

  const out: string[] = [];
  for (const token of raw.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
    if (/캠퍼스$/.test(token) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${token}`;
      continue;
    }
    if (token.length >= 2 && /(대학교|대학)$/.test(token)) out.push(token);
  }
  return out;
}
