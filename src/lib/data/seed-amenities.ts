/** Demo-mode mirror of the `amenities` rows in 0002_seed_reference_data.sql. */
import type { Amenity, AmenityCategory } from "@/lib/types/database";

const a = (
  slug: string,
  name_ko: string,
  name_en: string,
  category: AmenityCategory,
  icon: string,
  sort_order: number,
): Amenity => ({ id: `amenity-${slug}`, slug, name_ko, name_en, category, icon, sort_order });

export const SEED_AMENITIES: Amenity[] = [
  a("bed", "침대", "Bed", "living", "bed", 1),
  a("desk", "책상", "Desk", "living", "desk", 2),
  a("chair", "의자", "Chair", "living", "armchair", 3),
  a("wardrobe", "옷장", "Wardrobe", "living", "shirt", 4),
  a("wifi", "와이파이", "WiFi", "living", "wifi", 5),
  a("aircon-private", "개별 에어컨", "Private AC", "living", "wind", 6),
  a("heating", "난방", "Heating", "living", "flame", 7),
  a("tv", "TV", "TV", "living", "tv", 8),
  a("window", "창문", "Window", "living", "panel-top", 9),
  a("private-bath", "개인 욕실", "Private Bathroom", "living", "shower-head", 10),

  a("cctv", "CCTV", "CCTV", "safety", "cctv", 1),
  a("door-lock", "도어락", "Digital Door Lock", "safety", "lock", 2),
  a("fire-equipment", "소방 설비", "Fire Equipment", "safety", "fire-extinguisher", 3),
  a("security-24h", "24시간 보안", "24h Security", "safety", "shield", 4),
  a("female-only-floor", "여성 전용 층", "Female-only Floor", "safety", "user-check", 5),

  a("shared-kitchen", "공용 주방", "Shared Kitchen", "kitchen", "cooking-pot", 1),
  a("cooktop", "인덕션/가스레인지", "Cooktop", "kitchen", "flame", 2),
  a("microwave", "전자레인지", "Microwave", "kitchen", "microwave", 3),
  a("fridge-shared", "공용 냉장고", "Shared Fridge", "kitchen", "refrigerator", 4),
  a("fridge-private", "개인 냉장고", "Private Fridge", "kitchen", "refrigerator", 5),
  a("water-purifier", "정수기", "Water Purifier", "kitchen", "droplets", 6),
  a("cookware", "조리도구", "Cookware", "kitchen", "utensils", 7),
  a("rice-free", "쌀 무료 제공", "Free Rice", "kitchen", "wheat", 8),
  a("ramen-free", "라면 무료 제공", "Free Ramen", "kitchen", "soup", 9),

  a("washer", "세탁기", "Washing Machine", "laundry", "washing-machine", 1),
  a("dryer", "건조기", "Dryer", "laundry", "air-vent", 2),
  a("drying-rack", "건조대", "Drying Rack", "laundry", "grip", 3),

  a("bedding", "침구 제공", "Bedding Provided", "provided", "bed-double", 1),
  a("towels", "수건 제공", "Towels Provided", "provided", "bath", 2),
  a("toiletries", "세면용품", "Toiletries", "provided", "soap", 3),
  a("cleaning", "청소 서비스", "Cleaning Service", "provided", "sparkles", 4),
  a("utilities-incl", "공과금 포함", "Utilities Included", "provided", "plug", 5),

  a("lounge", "라운지", "Lounge", "shared", "sofa", 1),
  a("study-room", "독서실", "Study Room", "shared", "book-open", 2),
  a("rooftop", "옥상", "Rooftop", "shared", "building", 3),
  a("parking", "주차장", "Parking", "shared", "car", 4),
  a("elevator", "엘리베이터", "Elevator", "shared", "move-vertical", 5),
  a("bike-storage", "자전거 보관소", "Bike Storage", "shared", "bike", 6),
];

export const AMENITY_CATEGORY_ORDER: AmenityCategory[] = [
  "living",
  "safety",
  "kitchen",
  "laundry",
  "provided",
  "shared",
];
