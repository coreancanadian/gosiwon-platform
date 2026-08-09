import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type {
  Amenity,
  GenderPolicy,
  PropertyType,
  PropertyWithRelations,
  Region,
  SubwayStation,
} from "@/lib/types/database";
import { SEED_REGIONS, SEED_STATIONS } from "./seed-reference";
import { SEED_AMENITIES } from "./seed-amenities";
import { DEMO_PROPERTIES, type DemoProperty } from "./demo-properties";

export { isSupabaseConfigured };

const PROPERTY_SELECT = `
  *,
  rooms (*),
  property_images (*),
  regions (*)
` as const;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export async function getRegions(): Promise<Region[]> {
  if (!isSupabaseConfigured()) return SEED_REGIONS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("regions")
    .select("*")
    .order("sort_order");

  if (error) throw new Error(`Failed to load regions: ${error.message}`);
  return data ?? [];
}

export async function getRegionsByTier() {
  const regions = await getRegions();
  return {
    seoul: regions.filter((r) => r.tier === "seoul"),
    incheon: regions.filter((r) => r.tier === "incheon"),
    majorCity: regions.filter((r) => r.tier === "major_city"),
  };
}

export async function getFeaturedStations(): Promise<SubwayStation[]> {
  if (!isSupabaseConfigured()) return SEED_STATIONS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subway_stations")
    .select("*")
    .eq("is_featured", true)
    .order("sort_order");

  if (error) throw new Error(`Failed to load stations: ${error.message}`);
  return data ?? [];
}

export async function getAmenities(): Promise<Amenity[]> {
  if (!isSupabaseConfigured()) return SEED_AMENITIES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("amenities")
    .select("*")
    .order("sort_order");

  if (error) throw new Error(`Failed to load amenities: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export interface SearchFilters {
  regionSlug?: string;
  stationSlug?: string;
  q?: string;
  gender?: GenderPolicy;
  propertyType?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  sort?: "recommended" | "price_asc" | "price_desc" | "newest";
}

function applyDemoFilters(filters: SearchFilters): DemoProperty[] {
  let results = [...DEMO_PROPERTIES];

  if (filters.regionSlug) {
    results = results.filter(
      (p) => p.regions?.slug === filters.regionSlug,
    );
  }

  if (filters.stationSlug) {
    results = results.filter(
      (p) => filters.stationSlug! in p.nearbyStations,
    );
  }

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    results = results.filter((p) =>
      [p.name_ko, p.name_en, p.address_ko, p.address_en]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }

  if (filters.gender && filters.gender !== "any") {
    // "Any gender" listings are open to everyone, so they stay in the results
    // for a male- or female-specific search.
    results = results.filter(
      (p) => p.gender === filters.gender || p.gender === "any",
    );
  }

  if (filters.propertyType) {
    results = results.filter((p) => p.property_type === filters.propertyType);
  }

  if (filters.minPrice != null) {
    results = results.filter((p) => (p.price_max ?? 0) >= filters.minPrice!);
  }

  if (filters.maxPrice != null) {
    results = results.filter(
      (p) => (p.price_min ?? Infinity) <= filters.maxPrice!,
    );
  }

  switch (filters.sort) {
    case "price_asc":
      results.sort((a, b) => (a.price_min ?? 0) - (b.price_min ?? 0));
      break;
    case "price_desc":
      results.sort((a, b) => (b.price_min ?? 0) - (a.price_min ?? 0));
      break;
    case "newest":
      results.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    default:
      break;
  }

  return results;
}

export async function searchProperties(
  filters: SearchFilters = {},
): Promise<PropertyWithRelations[]> {
  if (!isSupabaseConfigured()) return applyDemoFilters(filters);

  const supabase = await createClient();
  let query = supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("is_published", true);

  if (filters.regionSlug) {
    const { data: region } = await supabase
      .from("regions")
      .select("id")
      .eq("slug", filters.regionSlug)
      .single();
    if (!region) return [];
    query = query.eq("region_id", region.id);
  }

  if (filters.stationSlug) {
    const { data: station } = await supabase
      .from("subway_stations")
      .select("id")
      .eq("slug", filters.stationSlug)
      .single();
    if (!station) return [];

    const { data: links } = await supabase
      .from("property_subway")
      .select("property_id")
      .eq("station_id", station.id);

    const ids = (links ?? []).map((l) => l.property_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    query = query.or(
      `name_ko.ilike.${pattern},name_en.ilike.${pattern},address_ko.ilike.${pattern},address_en.ilike.${pattern}`,
    );
  }

  if (filters.gender && filters.gender !== "any") {
    query = query.in("gender", [filters.gender, "any"]);
  }

  if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
  if (filters.minPrice != null) query = query.gte("price_max", filters.minPrice);
  if (filters.maxPrice != null) query = query.lte("price_min", filters.maxPrice);

  switch (filters.sort) {
    case "price_asc":
      query = query.order("price_min", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("price_min", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("updated_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(`Search failed: ${error.message}`);
  // Cast: the hand-written Database type carries empty Relationships, so
  // postgrest can't infer the shape of the nested rooms/images/regions selects.
  // Regenerating types from the live schema removes the need for this.
  return (data ?? []) as unknown as PropertyWithRelations[];
}

export async function getPropertyBySlug(
  slug: string,
): Promise<PropertyWithRelations | null> {
  if (!isSupabaseConfigured()) {
    return DEMO_PROPERTIES.find((p) => p.slug === slug) ?? null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Failed to load listing: ${error.message}`);
  return data as unknown as PropertyWithRelations | null;
}

/** Amenity slugs attached to a property, for the detail page's grouped list. */
export async function getPropertyAmenitySlugs(
  propertyId: string,
): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_PROPERTIES.find((p) => p.id === propertyId)?.amenitySlugs ?? [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_amenities")
    .select("amenities (slug)")
    .eq("property_id", propertyId);

  if (error) throw new Error(`Failed to load amenities: ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    amenities: { slug: string } | null;
  }>).flatMap((row) => (row.amenities ? [row.amenities.slug] : []));
}

/** Nearby stations with walking time, for the detail page. */
export async function getPropertyStations(
  propertyId: string,
): Promise<Array<{ station: SubwayStation; walkMinutes: number | null }>> {
  if (!isSupabaseConfigured()) {
    const property = DEMO_PROPERTIES.find((p) => p.id === propertyId);
    if (!property) return [];
    return Object.entries(property.nearbyStations).flatMap(([slug, mins]) => {
      const station = SEED_STATIONS.find((s) => s.slug === slug);
      return station ? [{ station, walkMinutes: mins }] : [];
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_subway")
    .select("walk_minutes, subway_stations (*)")
    .eq("property_id", propertyId)
    .order("walk_minutes", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Failed to load nearby stations: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const typed = row as unknown as {
      walk_minutes: number | null;
      subway_stations: SubwayStation | null;
    };
    return typed.subway_stations
      ? [{ station: typed.subway_stations, walkMinutes: typed.walk_minutes }]
      : [];
  });
}
