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

/** 서울특별시 -> 서울, 경기도 -> 경기, 충청남도 -> 충남 … */
const PROVINCE_SHORT: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};

/** The "시·도 + 시·군·구" prefix of an address, in short form. */
export function districtOf(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.trim().split(/\s+/);
  if (parts.length === 0) return "";
  const province = PROVINCE_SHORT[parts[0]] ?? parts[0];
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

/** Names in one source file are addresses, not business names. */
export function looksLikeAddress(name: string): boolean {
  return /(시|군|구)\s/.test(name) && /\d/.test(name);
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
