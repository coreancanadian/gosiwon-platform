/**
 * Hand-written mirror of supabase/migrations/*.sql.
 *
 * Once your Supabase project exists, regenerate this file from the live schema:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
 */

export type PropertyType =
  | "gosiwon" // 고시원
  | "oneroomtel" // 원룸텔
  | "share_house" // 쉐어하우스
  | "coliving" // 코리빙하우스
  | "one_room" // 원･투룸
  | "officetel" // 오피스텔
  | "dormitory"; // 기숙사

/**
 * The distinction renters shop on: your own lockable room vs a house shared
 * with housemates. Generated in Postgres from property_type, so it can't drift.
 */
export type HousingCategory = "private" | "shared";

export const SHARED_TYPES: PropertyType[] = ["share_house", "coliving", "dormitory"];

export function housingCategoryOf(type: PropertyType): HousingCategory {
  return SHARED_TYPES.includes(type) ? "shared" : "private";
}
export type GenderPolicy = "any" | "male" | "female";
export type InquiryStatus = "pending" | "accepted" | "declined" | "closed";
export type ClaimStatus = "unclaimed" | "pending" | "claimed";
export type ClaimRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type StayStatus = "active" | "completed" | "cancelled";

export type Plan = {
  code: string;
  name_ko: string;
  name_en: string;
  description_ko: string | null;
  description_en: string | null;
  monthly_price_krw: number;
  features: Record<string, unknown>;
  is_assignable: boolean;
  sort_order: number;
  created_at: string;
};

export type HostSubscription = {
  id: string;
  profile_id: string;
  plan_code: string;
  status: "active" | "paused" | "cancelled";
  price_krw: number;
  price_locked: boolean;
  started_at: string;
  note: string | null;
  created_at: string;
};

export type PropertyClaim = {
  id: string;
  property_id: string;
  claimant_id: string;
  status: ClaimRequestStatus;
  evidence: string | null;
  contact_phone: string | null;
  reviewer_id: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type Stay = {
  id: string;
  property_id: string;
  tenant_id: string;
  owner_id: string;
  inquiry_id: string | null;
  moved_in_at: string;
  moved_out_at: string | null;
  status: StayStatus;
  created_at: string;
};

export type ReviewDirection = "owner_on_tenant" | "tenant_on_owner";

/** The five criteria. Deliberately all observable facts about a tenancy. */
export const REVIEW_CRITERIA = [
  "payment_timeliness",
  "cleanliness",
  "quiet_hours",
  "communication",
  "rule_compliance",
] as const;

export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];

export type StayReview = {
  id: string;
  stay_id: string;
  author_id: string;
  subject_id: string;
  direction: ReviewDirection;
  payment_timeliness: number | null;
  cleanliness: number | null;
  quiet_hours: number | null;
  communication: number | null;
  rule_compliance: number | null;
  comment: string | null;
  subject_reply: string | null;
  is_visible: boolean;
  created_at: string;
  expires_at: string;
};

/** Aggregate returned by get_applicant_reputation(). Never per-property. */
export type ApplicantReputation = {
  stays_completed: number;
  reviews_count: number;
  avg_payment: number | null;
  avg_cleanliness: number | null;
  avg_quiet_hours: number | null;
  avg_communication: number | null;
  avg_rule_compliance: number | null;
  avg_overall: number | null;
};
export type UserRole = "tenant" | "owner" | "admin";
export type RegionTier = "seoul" | "incheon" | "major_city";
export type AmenityCategory =
  | "living"
  | "safety"
  | "kitchen"
  | "laundry"
  | "provided"
  | "shared";

export type University = {
  id: string;
  slug: string;
  /** Must equal the value inside properties.nearby_universities. */
  name_ko: string;
  name_en: string;
  short_name_ko: string | null;
  city_ko: string | null;
  city_en: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  listing_count: number;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
};

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
  /** Generated column — never write to this. */
  housing_category: HousingCategory;
  gender: GenderPolicy;
  age_min: number | null;
  age_max: number | null;
  floors_total: number | null;
  floors_used: string | null;
  building_type: string | null;
  nearby_universities: string[];
  video_url: string | null;
  external_id: string | null;
  claim_status: ClaimStatus;
  /** District-level address as imported, kept so enrichment is reversible. */
  address_original: string | null;
  road_address: string | null;
  jibun_address: string | null;
  address_source: "import" | "kakao_place" | "manual";
  address_verified_at: string | null;
  kakao_place_id: string | null;
  kakao_place_url: string | null;
  /** Publicly listed business phone, distinct from a user's own phone. */
  listing_phone: string | null;
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
  /** Tenant's per-application consent to reveal their stay record. */
  share_reputation: boolean;
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
      plans: Table<Plan>;
      host_subscriptions: Table<HostSubscription>;
      property_claims: Table<PropertyClaim>;
      stays: Table<Stay>;
      universities: Table<University>;
      stay_reviews: Table<StayReview>;
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
      /** See supabase/migrations/0006. Empty unless the tenant consented. */
      get_applicant_reputation: {
        Args: { p_inquiry_id: string };
        Returns: ApplicantReputation[];
      };
      approve_property_claim: {
        Args: { p_claim_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
