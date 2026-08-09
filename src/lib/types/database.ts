/**
 * Hand-written mirror of supabase/migrations/*.sql.
 *
 * Once your Supabase project exists, regenerate this file from the live schema:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
 */

export type PropertyType = "gosiwon" | "share_house" | "one_room" | "dormitory";
export type GenderPolicy = "any" | "male" | "female";
export type InquiryStatus = "pending" | "accepted" | "declined" | "closed";
export type UserRole = "tenant" | "owner" | "admin";
export type RegionTier = "seoul" | "incheon" | "major_city";
export type AmenityCategory =
  | "living"
  | "safety"
  | "kitchen"
  | "laundry"
  | "provided"
  | "shared";

export type Region = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  tier: RegionTier;
  parent_ko: string | null;
  parent_en: string | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  sort_order: number;
}

export type SubwayStation = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  lines_ko: string[];
  lines_en: string[];
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  is_featured: boolean;
  sort_order: number;
}

export type Amenity = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  category: AmenityCategory;
  icon: string | null;
  sort_order: number;
}

export type Room = {
  id: string;
  property_id: string;
  name: string;
  monthly_rent: number;
  deposit: number;
  size_sqm: number | null;
  min_contract_days: number | null;
  max_contract_days: number | null;
  is_available: boolean;
  sort_order: number;
}

export type PropertyImage = {
  id: string;
  property_id: string;
  room_id: string | null;
  storage_path: string;
  alt_ko: string | null;
  alt_en: string | null;
  is_cover: boolean;
  sort_order: number;
}

export type Property = {
  id: string;
  owner_id: string;
  slug: string;
  name_ko: string;
  name_en: string | null;
  address_ko: string;
  address_en: string | null;
  address_detail: string | null;
  postal_code: string | null;
  region_id: string | null;
  lat: number | null;
  lng: number | null;
  property_type: PropertyType;
  gender: GenderPolicy;
  age_min: number | null;
  age_max: number | null;
  floors_total: number | null;
  floors_used: string | null;
  languages: string[];
  description_ko: string | null;
  description_en: string | null;
  price_min: number | null;
  price_max: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  kakao_id: string | null;
  whatsapp: string | null;
  preferred_locale: "ko" | "en";
  created_at: string;
}

export type Inquiry = {
  id: string;
  property_id: string;
  room_id: string | null;
  tenant_id: string;
  owner_id: string;
  status: InquiryStatus;
  move_in_date: string | null;
  duration_months: number | null;
  intro_message: string | null;
  created_at: string;
  responded_at: string | null;
}

export type Message = {
  id: string;
  inquiry_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** A property joined with everything the list and detail views need. */
export interface PropertyWithRelations extends Property {
  rooms: Room[];
  property_images: PropertyImage[];
  regions: Region | null;
}

/**
 * `Relationships` is required by postgrest-js's GenericTable constraint.
 * Omitting it makes the whole schema fail the constraint, at which point every
 * query silently degrades to `never` instead of erroring where the mistake is.
 * An empty tuple is fine — it only powers relationship-name inference in
 * nested selects, which we spell out manually.
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile>;
      regions: Table<Region>;
      subway_stations: Table<SubwayStation>;
      amenities: Table<Amenity>;
      properties: Table<Property>;
      rooms: Table<Room>;
      property_images: Table<PropertyImage>;
      property_amenities: Table<{ property_id: string; amenity_id: string }>;
      room_amenities: Table<{ room_id: string; amenity_id: string }>;
      property_subway: Table<{
        property_id: string;
        station_id: string;
        walk_minutes: number | null;
      }>;
      inquiries: Table<Inquiry>;
      messages: Table<Message>;
    };
    Views: Record<string, never>;
    Functions: {
      /** See supabase/migrations/0003_counterparty_contact.sql */
      get_inquiry_counterparty: {
        Args: { p_inquiry_id: string };
        Returns: Array<{
          id: string;
          full_name: string | null;
          phone: string | null;
          kakao_id: string | null;
          whatsapp: string | null;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
