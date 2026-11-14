import type { NextRequest } from "next/server";
import { searchProperties, type SearchFilters } from "@/lib/data/queries";
import { TYPES_BY_CATEGORY } from "@/lib/search-bands";
import type {
  GenderPolicy,
  HousingCategory,
  PropertyType,
} from "@/lib/types/database";

const GENDERS: GenderPolicy[] = ["male", "female", "any"];
const CATEGORIES = Object.keys(TYPES_BY_CATEGORY) as HousingCategory[];
const TYPES = Object.values(TYPES_BY_CATEGORY).flat() as PropertyType[];
const SORTS: NonNullable<SearchFilters["sort"]>[] = [
  "recommended",
  "price_asc",
  "price_desc",
  "newest",
];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function wholeNumber(value: string | null): number | undefined {
  if (value == null || !/^\d{1,9}$/.test(value)) return undefined;
  return Number(value);
}

/**
 * Every listing matching the attribute filters, nationwide.
 *
 * The search page loads this once the visitor starts moving the map away from
 * the place they searched, then filters it to the visible area in the
 * browser — so panning and zooming cost no further requests. Served from the
 * same shared cache as the search page itself.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters: SearchFilters = {
    gender: pick(sp.get("gender"), GENDERS),
    propertyType: pick(sp.get("type"), TYPES),
    housingCategory: pick(sp.get("category"), CATEGORIES),
    minPrice: wholeNumber(sp.get("minPrice")),
    maxPrice: wholeNumber(sp.get("maxPrice")),
    sort: pick(sp.get("sort"), SORTS),
  };

  const listings = await searchProperties(filters);
  return Response.json(listings, {
    headers: {
      // Let the CDN answer repeat requests for a minute, too.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
