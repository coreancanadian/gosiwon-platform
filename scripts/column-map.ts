/**
 * Header aliases for the Excel importer.
 *
 * Korean listing spreadsheets never agree on column names, so rather than
 * demand one exact format we match each target field against a list of aliases.
 * Matching is case-insensitive and ignores spaces, so "월 세" and "월세" both hit.
 *
 * If the importer reports unmapped columns, add the header text here.
 */
export type TargetField =
  | "name_ko"
  | "name_en"
  | "address_ko"
  | "address_en"
  | "address_detail"
  | "postal_code"
  | "property_type"
  | "gender"
  | "age_min"
  | "age_max"
  | "floors_total"
  | "floors_used"
  | "languages"
  | "description_ko"
  | "description_en"
  | "lat"
  | "lng"
  | "room_name"
  | "monthly_rent"
  | "deposit"
  | "size_sqm"
  | "min_contract_days"
  | "phone"
  | "amenities";

export const COLUMN_ALIASES: Record<TargetField, string[]> = {
  name_ko: ["이름", "상호", "상호명", "고시원명", "업소명", "시설명", "건물명", "name", "매물명"],
  name_en: ["영문명", "영문이름", "nameen", "englishname"],
  address_ko: ["주소", "소재지", "도로명주소", "지번주소", "address", "위치"],
  address_en: ["영문주소", "addressen", "englishaddress"],
  address_detail: ["상세주소", "detail", "동호수"],
  postal_code: ["우편번호", "zip", "postalcode"],
  property_type: ["유형", "종류", "구분", "주거유형", "type", "시설유형"],
  gender: ["성별", "성별구분", "gender", "입실성별"],
  age_min: ["최소나이", "최소연령", "agemin"],
  age_max: ["최대나이", "최대연령", "agemax"],
  floors_total: ["총층수", "층수", "건물층수", "floors"],
  floors_used: ["운영층", "사용층", "해당층"],
  languages: ["가능언어", "언어", "languages"],
  description_ko: ["소개", "설명", "비고", "특징", "description"],
  description_en: ["영문소개", "descriptionen"],
  lat: ["위도", "lat", "latitude"],
  lng: ["경도", "lng", "lon", "longitude"],
  room_name: ["방이름", "호실", "객실명", "룸타입", "방종류", "roomname", "roomtype"],
  monthly_rent: ["월세", "월임대료", "임대료", "가격", "요금", "rent", "price", "월비용"],
  deposit: ["보증금", "예치금", "deposit"],
  size_sqm: ["면적", "전용면적", "크기", "제곱미터", "size", "sqm"],
  min_contract_days: ["최소계약", "최소계약일", "최소기간", "mincontract"],
  phone: ["전화", "전화번호", "연락처", "phone", "tel"],
  amenities: ["편의시설", "옵션", "시설", "서비스", "amenities", "options"],
};

/** Normalise a header cell for comparison: lowercase, strip spaces/punctuation. */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[\s\-_()[\]./]/g, "")
    .trim();
}

/** Resolve a spreadsheet header to a target field, or null if unrecognised. */
export function matchHeader(header: string): TargetField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return field as TargetField;
    }
  }
  // Fall back to a contains check so "월세(원)" still resolves to monthly_rent.
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normalizeHeader(alias)))) {
      return field as TargetField;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

/** "여성전용", "여자", "female" -> "female" */
export function parseGender(raw: string | null): "any" | "male" | "female" {
  if (!raw) return "any";
  const v = normalizeHeader(raw);
  if (/여성|여자|female|women/.test(v)) return "female";
  if (/남성|남자|male|men/.test(v)) return "male";
  return "any";
}

export function parsePropertyType(
  raw: string | null,
): "gosiwon" | "share_house" | "one_room" | "dormitory" {
  if (!raw) return "gosiwon";
  const v = normalizeHeader(raw);
  if (/셰어|쉐어|share/.test(v)) return "share_house";
  if (/원룸|oneroom/.test(v)) return "one_room";
  if (/기숙사|dorm/.test(v)) return "dormitory";
  return "gosiwon";
}

/**
 * Korean spreadsheets write money as "38만원", "380,000", "38만", or "380000".
 * Returns whole won.
 */
export function parseKrw(raw: string | number | null): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    // A bare "38" in a rent column almost certainly means 38만원.
    return raw > 0 && raw < 1000 ? Math.round(raw * 10_000) : Math.round(raw);
  }

  const text = String(raw).replace(/[,\s원]/g, "");
  const manMatch = text.match(/^([\d.]+)만/);
  if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10_000);

  const digits = text.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = parseFloat(digits);
  if (Number.isNaN(n)) return null;
  return n > 0 && n < 1000 ? Math.round(n * 10_000) : Math.round(n);
}

/** "16.5", "16.5㎡", "5평" (1평 ≈ 3.3058㎡) -> square metres */
export function parseSqm(raw: string | number | null): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return raw;

  const text = String(raw).replace(/\s/g, "");
  const pyeong = text.match(/^([\d.]+)평/);
  if (pyeong) return Math.round(parseFloat(pyeong[1]) * 3.3058 * 100) / 100;

  const n = parseFloat(text.replace(/[^\d.]/g, ""));
  return Number.isNaN(n) ? null : n;
}

export function parseInteger(raw: string | number | null): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw);
  const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

/** Splits "와이파이, 에어컨 / 세탁기" into trimmed tokens. */
export function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,、/·|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
