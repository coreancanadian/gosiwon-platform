/**
 * Demo-mode mirror of supabase/migrations/0002_seed_reference_data.sql.
 *
 * Used only when Supabase env vars are absent, so `npm run dev` renders a
 * complete site with zero setup. Once Supabase is connected these are ignored
 * and everything comes from the database. Keep in sync with the SQL if you
 * edit the tile list.
 */
import type { Region, SubwayStation } from "@/lib/types/database";

const region = (
  slug: string,
  name_ko: string,
  name_en: string,
  tier: Region["tier"],
  lat: number,
  lng: number,
  sort_order: number,
  parent_ko: string | null = null,
  parent_en: string | null = null,
): Region => ({
  id: `region-${slug}`,
  slug,
  name_ko,
  name_en,
  tier,
  parent_ko,
  parent_en,
  // Drop a photo at public/images/regions/<slug>.jpg and set this to that path
  // to replace the generated gradient tile.
  image_url: null,
  lat,
  lng,
  sort_order,
});

export const SEED_REGIONS: Region[] = [
  // Seoul — university belts, the CBD, and the Gangnam job centres.
  region("gangnam-gu", "강남구", "Gangnam-gu", "seoul", 37.5172, 127.0473, 1, "서울특별시", "Seoul"),
  region("seocho-gu", "서초구", "Seocho-gu", "seoul", 37.4837, 127.0324, 2, "서울특별시", "Seoul"),
  region("songpa-gu", "송파구", "Songpa-gu", "seoul", 37.5145, 127.1059, 3, "서울특별시", "Seoul"),
  region("mapo-gu", "마포구", "Mapo-gu", "seoul", 37.5638, 126.9084, 4, "서울특별시", "Seoul"),
  region("seodaemun-gu", "서대문구", "Seodaemun-gu", "seoul", 37.5791, 126.9368, 5, "서울특별시", "Seoul"),
  region("gwanak-gu", "관악구", "Gwanak-gu", "seoul", 37.4784, 126.9516, 6, "서울특별시", "Seoul"),
  region("jongno-gu", "종로구", "Jongno-gu", "seoul", 37.5735, 126.979, 7, "서울특별시", "Seoul"),
  region("jung-gu-seoul", "중구", "Jung-gu", "seoul", 37.5636, 126.9976, 8, "서울특별시", "Seoul"),
  region("yeongdeungpo-gu", "영등포구", "Yeongdeungpo-gu", "seoul", 37.5264, 126.8962, 9, "서울특별시", "Seoul"),
  region("dongjak-gu", "동작구", "Dongjak-gu", "seoul", 37.5124, 126.9393, 10, "서울특별시", "Seoul"),

  // Incheon
  region("yeonsu-gu", "연수구", "Yeonsu-gu", "incheon", 37.4101, 126.6784, 1, "인천광역시", "Incheon"),
  region("namdong-gu", "남동구", "Namdong-gu", "incheon", 37.4471, 126.7314, 2, "인천광역시", "Incheon"),
  region("bupyeong-gu", "부평구", "Bupyeong-gu", "incheon", 37.507, 126.7219, 3, "인천광역시", "Incheon"),
  region("michuhol-gu", "미추홀구", "Michuhol-gu", "incheon", 37.4636, 126.6503, 4, "인천광역시", "Incheon"),
  region("seo-gu-incheon", "서구", "Seo-gu", "incheon", 37.5455, 126.6759, 5, "인천광역시", "Incheon"),

  // Major cities nationwide
  region("busan", "부산광역시", "Busan", "major_city", 35.1796, 129.0756, 1),
  region("daegu", "대구광역시", "Daegu", "major_city", 35.8714, 128.6014, 2),
  region("daejeon", "대전광역시", "Daejeon", "major_city", 36.3504, 127.3845, 3),
  region("gwangju", "광주광역시", "Gwangju", "major_city", 35.1595, 126.8526, 4),
  region("ulsan", "울산광역시", "Ulsan", "major_city", 35.5384, 129.3114, 5),
  region("suwon", "수원시", "Suwon", "major_city", 37.2636, 127.0286, 6, "경기도", "Gyeonggi-do"),
  region("seongnam", "성남시", "Seongnam", "major_city", 37.42, 127.1267, 7, "경기도", "Gyeonggi-do"),
  region("goyang", "고양시", "Goyang", "major_city", 37.6584, 126.832, 8, "경기도", "Gyeonggi-do"),
  region("cheonan", "천안시", "Cheonan", "major_city", 36.8151, 127.1139, 9, "충청남도", "Chungcheongnam-do"),
  region("cheongju", "청주시", "Cheongju", "major_city", 36.6424, 127.489, 10, "충청북도", "Chungcheongbuk-do"),
];

const station = (
  slug: string,
  name_ko: string,
  name_en: string,
  lines_ko: string[],
  lines_en: string[],
  lat: number,
  lng: number,
  sort_order: number,
): SubwayStation => ({
  id: `station-${slug}`,
  slug,
  name_ko,
  name_en,
  lines_ko,
  lines_en,
  image_url: null,
  lat,
  lng,
  is_featured: true,
  sort_order,
});

export const SEED_STATIONS: SubwayStation[] = [
  station("gangnam", "강남역", "Gangnam", ["2호선", "신분당선"], ["Line 2", "Sinbundang"], 37.4979, 127.0276, 1),
  station("hongik-univ", "홍대입구역", "Hongik Univ.", ["2호선", "공항철도", "경의중앙선"], ["Line 2", "AREX", "Gyeongui-Jungang"], 37.5572, 126.9245, 2),
  station("sinchon", "신촌역", "Sinchon", ["2호선"], ["Line 2"], 37.5551, 126.9368, 3),
  station("seoul-station", "서울역", "Seoul Station", ["1호선", "4호선", "공항철도", "경의중앙선"], ["Line 1", "Line 4", "AREX", "Gyeongui-Jungang"], 37.5546, 126.9707, 4),
  station("jamsil", "잠실역", "Jamsil", ["2호선", "8호선"], ["Line 2", "Line 8"], 37.5133, 127.1, 5),
  station("konkuk-univ", "건대입구역", "Konkuk Univ.", ["2호선", "7호선"], ["Line 2", "Line 7"], 37.5405, 127.07, 6),
  station("sillim", "신림역", "Sillim", ["2호선"], ["Line 2"], 37.4842, 126.9296, 7),
  station("sadang", "사당역", "Sadang", ["2호선", "4호선"], ["Line 2", "Line 4"], 37.4766, 126.9816, 8),
  station("yeouido", "여의도역", "Yeouido", ["5호선", "9호선"], ["Line 5", "Line 9"], 37.5215, 126.9243, 9),
  station("jongno-3ga", "종로3가역", "Jongno 3-ga", ["1호선", "3호선", "5호선"], ["Line 1", "Line 3", "Line 5"], 37.5704, 126.9917, 10),
];
