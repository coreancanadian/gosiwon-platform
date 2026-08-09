import type {
  GenderPolicy,
  HousingCategory,
  PropertyType,
} from "@/lib/types/database";

/**
 * Shared by the client filter UI and the server-side search page.
 *
 * This deliberately does NOT live in SearchFilters.tsx: exports from a
 * "use client" module cross the RSC boundary as client-reference stubs, so a
 * Server Component importing the array would get an unusable proxy object
 * rather than the data.
 */
export interface PriceBand {
  key: string;
  min?: number;
  max?: number;
}

/** Monthly-rent brackets in KRW, matching how Korean listings are browsed. */
export const PRICE_BANDS: PriceBand[] = [
  { key: "any" },
  { key: "under400k", max: 400_000 },
  { key: "400to600k", min: 400_000, max: 600_000 },
  { key: "600to800k", min: 600_000, max: 800_000 },
  { key: "over800k", min: 800_000 },
];

export const GENDERS: GenderPolicy[] = ["any", "male", "female"];

/** Ordered by how common each type is in the catalogue. */
export const PROPERTY_TYPES: PropertyType[] = [
  "gosiwon",
  "oneroomtel",
  "share_house",
  "one_room",
  "coliving",
  "officetel",
  "dormitory",
];

export const HOUSING_CATEGORIES: HousingCategory[] = ["private", "shared"];

/** Which concrete types each category covers, for the SQL `in` filter. */
export const TYPES_BY_CATEGORY: Record<HousingCategory, PropertyType[]> = {
  private: ["gosiwon", "oneroomtel", "one_room", "officetel"],
  shared: ["share_house", "coliving", "dormitory"],
};

export const SORTS = ["recommended", "price_asc", "price_desc", "newest"] as const;
