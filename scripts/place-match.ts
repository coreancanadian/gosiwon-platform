/**
 * Deciding whether a Kakao place result is really the listing we searched for.
 *
 * This is the risky part of enrichment: a wrong match writes a real building's
 * address onto the wrong business. So a candidate is accepted only when the
 * district agrees AND the name is close enough — never on name alone, and never
 * just because it was the top result.
 */

export interface KakaoPlace {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string; // 지번
  road_address_name: string; // 도로명
  x: string; // longitude
  y: string; // latitude
  place_url: string;
}

/**
 * Canonical 시·도 token, mapping every spelling to one value.
 *
 * Both the long and short form of each province are listed, because the source
 * spreadsheets use short forms ("서울 관악구") while Kakao returns a mix —
 * short for most, but the full legal name for the special self-governing
 * provinces (강원특별자치도, 전북특별자치도, 제주특별자치도, 세종특별자치시).
 *
 * 광주 and 전남 are the awkward case: Kakao returns 전남광주통합특별시 for BOTH,
 * so both source provinces normalise to one token. That's safe because the
 * second token disambiguates — the old 광주 districts are all 구
 * (동/서/남/북/광산구) and the old 전남 ones are all 시/군, so they never collide.
 */
const PROVINCE_CANON: Record<string, string> = {
  서울특별시: "서울", 서울: "서울",
  부산광역시: "부산", 부산: "부산",
  대구광역시: "대구", 대구: "대구",
  인천광역시: "인천", 인천: "인천",
  대전광역시: "대전", 대전: "대전",
  울산광역시: "울산", 울산: "울산",
  세종특별자치시: "세종", 세종: "세종",
  경기도: "경기", 경기: "경기",
  강원특별자치도: "강원", 강원도: "강원", 강원: "강원",
  충청북도: "충북", 충북: "충북",
  충청남도: "충남", 충남: "충남",
  전북특별자치도: "전북", 전라북도: "전북", 전북: "전북",
  경상북도: "경북", 경북: "경북",
  경상남도: "경남", 경남: "경남",
  제주특별자치도: "제주", 제주도: "제주", 제주: "제주",

  전남광주통합특별시: "전남광주",
  광주광역시: "전남광주", 광주: "전남광주",
  전라남도: "전남광주", 전남: "전남광주",
};

/** The "시·도 + 시·군·구" prefix of an address, in canonical form. */
export function districtOf(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.trim().split(/\s+/);
  if (parts.length === 0) return "";
  const province = PROVINCE_CANON[parts[0]] ?? parts[0];
  return parts.length > 1 ? `${province} ${parts[1]}` : province;
}

/** Strip spaces, punctuation, and branch suffixes that vary between sources. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s()[\]{}<>·・.,'"“”‘’\-_/\\|]/g, "")
    .trim();
}

/** Character-bigram Dice coefficient. Works well on Hangul, unlike word tokens. */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;

  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };

  const ax = bigrams(x);
  const by = bigrams(y);
  let shared = 0;
  for (const [g, n] of ax) shared += Math.min(n, by.get(g) ?? 0);

  return (2 * shared) / (x.length - 1 + (y.length - 1));
}

export interface MatchVerdict {
  accepted: boolean;
  score: number;
  districtOk: boolean;
  reason: string;
}

const PROVINCE_PREFIX =
  /^(서울|경기|부산|인천|대구|대전|광주|울산|충남|충북|전남|전북|경남|경북|강원|제주|세종)\s/;

/**
 * Names in one source file are addresses, not business names —
 * "서울 관악구 신림동 251-349".
 *
 * Requires BOTH a province prefix and a trailing lot number. An earlier version
 * only looked for "시|군|구 " plus any digit, which misread real business names
 * like "나의도시 건대 1호점" (도시 contains 시) as addresses.
 */
export function looksLikeAddress(name: string): boolean {
  const trimmed = name.trim();
  return PROVINCE_PREFIX.test(trimmed) && /\d+(-\d+)?$/.test(trimmed);
}

const NAME_THRESHOLD = 0.6;

export function judgeMatch(
  ourName: string,
  ourAddress: string,
  place: KakaoPlace,
): MatchVerdict {
  const ourDistrict = districtOf(ourAddress);
  const theirDistrict = districtOf(place.road_address_name || place.address_name);
  const districtOk = ourDistrict !== "" && ourDistrict === theirDistrict;

  const score = similarity(ourName, place.place_name);

  if (!districtOk) {
    return {
      accepted: false,
      score,
      districtOk,
      reason: `district mismatch (${ourDistrict || "?"} vs ${theirDistrict || "?"})`,
    };
  }

  // A listing whose "name" is really an address can't be name-matched; the
  // district check plus Kakao's own address resolution is what we rely on.
  if (looksLikeAddress(ourName)) {
    return { accepted: true, score, districtOk, reason: "address-style name, district agrees" };
  }

  if (score < NAME_THRESHOLD) {
    return {
      accepted: false,
      score,
      districtOk,
      reason: `name too different (${score.toFixed(2)} < ${NAME_THRESHOLD})`,
    };
  }

  return { accepted: true, score, districtOk, reason: "district and name agree" };
}

/** Best acceptable candidate from a result set, or null. */
export function pickBest(
  ourName: string,
  ourAddress: string,
  places: KakaoPlace[],
): { place: KakaoPlace; verdict: MatchVerdict } | null {
  let best: { place: KakaoPlace; verdict: MatchVerdict } | null = null;

  for (const place of places) {
    const verdict = judgeMatch(ourName, ourAddress, place);
    if (!verdict.accepted) continue;
    if (!best || verdict.score > best.verdict.score) best = { place, verdict };
  }

  return best;
}
