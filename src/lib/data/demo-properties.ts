/**
 * Demo listings used only when Supabase env vars are absent.
 * They exist so the UI is reviewable end-to-end before any real data lands.
 * The Excel importer writes real rows to Supabase and these stop being used.
 */
import type { PropertyWithRelations, Room } from "@/lib/types/database";
import { SEED_REGIONS } from "./seed-reference";

export interface DemoProperty extends PropertyWithRelations {
  amenitySlugs: string[];
  /** station slug -> walking minutes */
  nearbyStations: Record<string, number>;
}

const regionBySlug = (slug: string) =>
  SEED_REGIONS.find((r) => r.slug === slug) ?? null;

let roomSeq = 0;
const room = (
  propertyId: string,
  name: string,
  monthly_rent: number,
  deposit: number,
  size_sqm: number | null,
  opts: Partial<Room> = {},
): Room => ({
  id: `room-${++roomSeq}`,
  property_id: propertyId,
  name,
  monthly_rent,
  deposit,
  size_sqm,
  min_contract_days: 30,
  max_contract_days: null,
  is_available: true,
  sort_order: roomSeq,
  ...opts,
});

interface Spec {
  slug: string;
  name_ko: string;
  name_en: string;
  address_ko: string;
  address_en: string;
  regionSlug: string;
  lat: number;
  lng: number;
  property_type: PropertyWithRelations["property_type"];
  gender: PropertyWithRelations["gender"];
  age_min: number | null;
  age_max: number | null;
  floors_total: number;
  floors_used: string;
  languages: string[];
  description_ko: string;
  description_en: string;
  rooms: Array<[string, number, number, number | null]>;
  amenitySlugs: string[];
  nearbyStations: Record<string, number>;
}

const SPECS: Spec[] = [
  {
    slug: "sillim-square-gosiwon",
    name_ko: "신림 스퀘어 고시원",
    name_en: "Sillim Square Gosiwon",
    address_ko: "서울특별시 관악구 신림로 340",
    address_en: "340 Sillim-ro, Gwanak-gu, Seoul",
    regionSlug: "gwanak-gu",
    lat: 37.4841,
    lng: 126.9298,
    property_type: "gosiwon",
    gender: "any",
    age_min: 19,
    age_max: 39,
    floors_total: 6,
    floors_used: "2~5F",
    languages: ["Korean", "English", "Chinese"],
    description_ko:
      "신림역 2호선 도보 3분 거리의 고시원입니다. 전 객실 개별 에어컨과 창문이 있으며, 공용 주방에서 쌀과 라면을 무료로 제공합니다. 공무원 시험 준비생과 사회초년생이 주로 거주하고 있어 조용한 편입니다.",
    description_en:
      "A three-minute walk from Sillim Station on Line 2. Every room has its own air conditioner and a window, and the shared kitchen stocks free rice and ramen. Mostly civil-service exam candidates and early-career workers, so it stays quiet.",
    rooms: [
      ["내창 A", 380000, 100000, 6.6],
      ["외창 B", 450000, 100000, 8.2],
      ["프리미엄 C", 520000, 200000, 11.5],
    ],
    amenitySlugs: [
      "bed", "desk", "chair", "wardrobe", "wifi", "aircon-private", "heating", "window",
      "cctv", "door-lock", "fire-equipment",
      "shared-kitchen", "cooktop", "microwave", "fridge-shared", "water-purifier", "rice-free", "ramen-free",
      "washer", "drying-rack", "bedding", "cleaning", "utilities-incl", "lounge", "elevator",
    ],
    nearbyStations: { sillim: 3 },
  },
  {
    slug: "hongdae-live-share-house",
    name_ko: "홍대 라이브 셰어하우스",
    name_en: "Hongdae Live Share House",
    address_ko: "서울특별시 마포구 와우산로 94",
    address_en: "94 Wausan-ro, Mapo-gu, Seoul",
    regionSlug: "mapo-gu",
    lat: 37.5563,
    lng: 126.9259,
    property_type: "share_house",
    gender: "female",
    age_min: 20,
    age_max: 35,
    floors_total: 4,
    floors_used: "1~4F",
    languages: ["Korean", "English", "Japanese"],
    description_ko:
      "홍대입구역 도보 6분, 여성 전용 셰어하우스입니다. 넓은 공용 라운지와 옥상 테라스가 있어 입주자 간 교류가 활발합니다. 외국인 입주자 비율이 약 40%로, 영어와 일본어 소통이 가능합니다.",
    description_en:
      "A female-only share house six minutes from Hongik Univ. Station. The large shared lounge and rooftop terrace make it a social place to live — roughly 40% of residents are international, and staff speak English and Japanese.",
    rooms: [
      ["2인실", 420000, 300000, 13.2],
      ["1인실 스탠다드", 650000, 500000, 9.9],
      ["1인실 디럭스", 780000, 500000, 14.8],
    ],
    amenitySlugs: [
      "bed", "desk", "wardrobe", "wifi", "aircon-private", "heating", "tv", "window", "private-bath",
      "cctv", "door-lock", "female-only-floor", "fire-equipment",
      "shared-kitchen", "cooktop", "microwave", "fridge-shared", "water-purifier", "cookware",
      "washer", "dryer", "bedding", "towels", "cleaning", "utilities-incl",
      "lounge", "rooftop", "elevator", "bike-storage",
    ],
    nearbyStations: { "hongik-univ": 6, sinchon: 14 },
  },
  {
    slug: "sinchon-yonsei-residence",
    name_ko: "신촌 연세 레지던스",
    name_en: "Sinchon Yonsei Residence",
    address_ko: "서울특별시 서대문구 연세로 12",
    address_en: "12 Yonsei-ro, Seodaemun-gu, Seoul",
    regionSlug: "seodaemun-gu",
    lat: 37.5578,
    lng: 126.9386,
    property_type: "one_room",
    gender: "any",
    age_min: 18,
    age_max: 40,
    floors_total: 7,
    floors_used: "3~7F",
    languages: ["Korean", "English", "Chinese", "Vietnamese"],
    description_ko:
      "연세대학교 정문에서 도보 5분 거리의 원룸형 주거시설입니다. 전 객실 개인 욕실과 미니 주방이 포함되어 있으며, 교환학생을 위한 단기 계약(1개월)도 가능합니다.",
    description_en:
      "One-room units a five-minute walk from the Yonsei University main gate. Every unit has a private bathroom and kitchenette, and one-month contracts are available for exchange students.",
    rooms: [
      ["스탠다드", 690000, 500000, 16.5],
      ["코너룸", 820000, 500000, 19.8],
    ],
    amenitySlugs: [
      "bed", "desk", "chair", "wardrobe", "wifi", "aircon-private", "heating", "tv", "window", "private-bath",
      "cctv", "door-lock", "security-24h", "fire-equipment",
      "cooktop", "microwave", "fridge-private", "water-purifier", "cookware",
      "washer", "dryer", "bedding", "toiletries", "cleaning", "utilities-incl",
      "study-room", "elevator", "parking",
    ],
    nearbyStations: { sinchon: 5, "hongik-univ": 15 },
  },
  {
    slug: "gangnam-station-stay",
    name_ko: "강남역 스테이",
    name_en: "Gangnam Station Stay",
    address_ko: "서울특별시 강남구 테헤란로 108",
    address_en: "108 Teheran-ro, Gangnam-gu, Seoul",
    regionSlug: "gangnam-gu",
    lat: 37.4995,
    lng: 127.0312,
    property_type: "gosiwon",
    gender: "male",
    age_min: 22,
    age_max: 45,
    floors_total: 9,
    floors_used: "6~9F",
    languages: ["Korean", "English"],
    description_ko:
      "강남역 도보 4분, 직장인 전용 남성 고시원입니다. 24시간 보안과 무인 출입 시스템을 운영하며, 전 객실 개인 욕실이 있습니다. 야간 근무자를 위한 방음 시공이 되어 있습니다.",
    description_en:
      "A four-minute walk from Gangnam Station, aimed at working professionals. 24-hour security with keyless entry, private bathrooms in every room, and soundproofing for residents on night shifts.",
    rooms: [
      ["싱글", 590000, 300000, 8.5],
      ["더블", 720000, 300000, 12.4],
      ["스위트", 950000, 500000, 17.2],
    ],
    amenitySlugs: [
      "bed", "desk", "chair", "wardrobe", "wifi", "aircon-private", "heating", "tv", "window", "private-bath",
      "cctv", "door-lock", "security-24h", "fire-equipment",
      "shared-kitchen", "microwave", "fridge-shared", "water-purifier", "rice-free",
      "washer", "dryer", "bedding", "towels", "toiletries", "cleaning", "utilities-incl",
      "lounge", "study-room", "elevator", "parking",
    ],
    nearbyStations: { gangnam: 4 },
  },
  {
    slug: "konkuk-univ-share",
    name_ko: "건대 유니버스 셰어하우스",
    name_en: "Konkuk Universe Share House",
    address_ko: "서울특별시 광진구 능동로 120",
    address_en: "120 Neungdong-ro, Gwangjin-gu, Seoul",
    regionSlug: "jongno-gu",
    lat: 37.5412,
    lng: 127.0715,
    property_type: "share_house",
    gender: "any",
    age_min: 19,
    age_max: 34,
    floors_total: 5,
    floors_used: "2~5F",
    languages: ["Korean", "English", "Chinese"],
    description_ko:
      "건대입구역 도보 7분 거리의 셰어하우스입니다. 남녀 층 분리 운영이며, 넓은 공용 주방과 스터디룸을 갖추고 있습니다. 유학생과 인턴 거주자가 많습니다.",
    description_en:
      "Seven minutes from Konkuk Univ. Station, with separate floors for men and women. A large shared kitchen and study room, popular with international students and interns.",
    rooms: [
      ["4인 도미토리", 330000, 200000, 18.0],
      ["2인실", 460000, 300000, 13.5],
      ["1인실", 640000, 400000, 10.8],
    ],
    amenitySlugs: [
      "bed", "desk", "wardrobe", "wifi", "aircon-private", "heating", "window",
      "cctv", "door-lock", "female-only-floor", "fire-equipment",
      "shared-kitchen", "cooktop", "microwave", "fridge-shared", "water-purifier", "cookware", "rice-free",
      "washer", "dryer", "drying-rack", "bedding", "cleaning", "utilities-incl",
      "lounge", "study-room", "rooftop", "bike-storage",
    ],
    nearbyStations: { "konkuk-univ": 7 },
  },
  {
    slug: "jongno-heritage-gosiwon",
    name_ko: "종로 헤리티지 고시원",
    name_en: "Jongno Heritage Gosiwon",
    address_ko: "서울특별시 종로구 종로 145",
    address_en: "145 Jong-ro, Jongno-gu, Seoul",
    regionSlug: "jongno-gu",
    lat: 37.5709,
    lng: 126.9925,
    property_type: "gosiwon",
    gender: "any",
    age_min: 20,
    age_max: null,
    floors_total: 5,
    floors_used: "3~5F",
    languages: ["Korean", "English"],
    description_ko:
      "종로3가역 도보 2분, 도심 한복판의 합리적인 가격대 고시원입니다. 1호선·3호선·5호선 환승이 가능해 서울 어디로든 이동이 편리합니다.",
    description_en:
      "Two minutes from Jongno 3-ga Station in the heart of the old city, at a sensible price. Lines 1, 3, and 5 all interchange here, so anywhere in Seoul is an easy trip.",
    rooms: [
      ["내창", 330000, 50000, 5.8],
      ["외창", 400000, 100000, 7.9],
    ],
    amenitySlugs: [
      "bed", "desk", "chair", "wardrobe", "wifi", "aircon-private", "heating", "window",
      "cctv", "door-lock", "fire-equipment",
      "shared-kitchen", "cooktop", "microwave", "fridge-shared", "water-purifier", "rice-free", "ramen-free",
      "washer", "drying-rack", "bedding", "cleaning", "utilities-incl", "lounge",
    ],
    nearbyStations: { "jongno-3ga": 2, "seoul-station": 16 },
  },
  {
    slug: "yeouido-finance-residence",
    name_ko: "여의도 파이낸스 레지던스",
    name_en: "Yeouido Finance Residence",
    address_ko: "서울특별시 영등포구 의사당대로 83",
    address_en: "83 Uisadang-daero, Yeongdeungpo-gu, Seoul",
    regionSlug: "yeongdeungpo-gu",
    lat: 37.5251,
    lng: 126.9271,
    property_type: "one_room",
    gender: "any",
    age_min: 23,
    age_max: null,
    floors_total: 12,
    floors_used: "5~12F",
    languages: ["Korean", "English"],
    description_ko:
      "여의도역 도보 5분, 금융가 직장인을 위한 원룸형 레지던스입니다. 전 객실 풀옵션이며 최소 계약 기간은 3개월입니다.",
    description_en:
      "A five-minute walk from Yeouido Station, built for people working in the financial district. Fully furnished units with a three-month minimum contract.",
    rooms: [
      ["스탠다드", 850000, 1000000, 19.8],
      ["프리미엄", 1150000, 1000000, 26.4],
    ],
    amenitySlugs: [
      "bed", "desk", "chair", "wardrobe", "wifi", "aircon-private", "heating", "tv", "window", "private-bath",
      "cctv", "door-lock", "security-24h", "fire-equipment",
      "cooktop", "microwave", "fridge-private", "water-purifier", "cookware",
      "washer", "dryer", "bedding", "towels", "toiletries", "cleaning",
      "lounge", "study-room", "elevator", "parking",
    ],
    nearbyStations: { yeouido: 5 },
  },
  {
    slug: "busan-seomyeon-share",
    name_ko: "부산 서면 셰어하우스",
    name_en: "Busan Seomyeon Share House",
    address_ko: "부산광역시 부산진구 중앙대로 668",
    address_en: "668 Jungang-daero, Busanjin-gu, Busan",
    regionSlug: "busan",
    lat: 35.1577,
    lng: 129.0594,
    property_type: "share_house",
    gender: "female",
    age_min: 19,
    age_max: 35,
    floors_total: 4,
    floors_used: "2~4F",
    languages: ["Korean", "English"],
    description_ko:
      "서면역 도보 8분 거리의 여성 전용 셰어하우스입니다. 부산 최대 상권 한가운데에 있어 생활이 편리하며, 옥상에서 시내 전경을 볼 수 있습니다.",
    description_en:
      "A female-only share house eight minutes from Seomyeon Station, in the middle of Busan's busiest commercial district. The rooftop looks out over the city.",
    rooms: [
      ["2인실", 300000, 200000, 14.0],
      ["1인실", 450000, 300000, 10.5],
    ],
    amenitySlugs: [
      "bed", "desk", "wardrobe", "wifi", "aircon-private", "heating", "window",
      "cctv", "door-lock", "female-only-floor", "fire-equipment",
      "shared-kitchen", "cooktop", "microwave", "fridge-shared", "water-purifier", "cookware",
      "washer", "dryer", "bedding", "cleaning", "utilities-incl",
      "lounge", "rooftop",
    ],
    nearbyStations: {},
  },
];

export const DEMO_PROPERTIES: DemoProperty[] = SPECS.map((spec, i) => {
  const id = `property-${i + 1}`;
  const rooms = spec.rooms.map(([name, rent, deposit, size]) =>
    room(id, name, rent, deposit, size),
  );
  const rents = rooms.map((r) => r.monthly_rent);

  return {
    id,
    owner_id: "demo-owner",
    slug: spec.slug,
    name_ko: spec.name_ko,
    name_en: spec.name_en,
    address_ko: spec.address_ko,
    address_en: spec.address_en,
    address_detail: null,
    postal_code: null,
    region_id: regionBySlug(spec.regionSlug)?.id ?? null,
    lat: spec.lat,
    lng: spec.lng,
    property_type: spec.property_type,
    gender: spec.gender,
    age_min: spec.age_min,
    age_max: spec.age_max,
    floors_total: spec.floors_total,
    floors_used: spec.floors_used,
    languages: spec.languages,
    description_ko: spec.description_ko,
    description_en: spec.description_en,
    price_min: Math.min(...rents),
    price_max: Math.max(...rents),
    is_published: true,
    created_at: new Date(2026, 0, 1 + i).toISOString(),
    updated_at: new Date(2026, 0, 1 + i).toISOString(),
    rooms,
    property_images: [],
    regions: regionBySlug(spec.regionSlug),
    amenitySlugs: spec.amenitySlugs,
    nearbyStations: spec.nearbyStations,
  };
});
