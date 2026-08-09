"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActionResult } from "./inquiries";

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  error: "Database is not configured.",
};

/** Every write below re-checks ownership; RLS is the backstop, not the only gate. */
async function requireOwnership(propertyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "You need to be signed in." as const };

  const { data } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!data) return { supabase, error: "Listing not found." as const };
  return { supabase, userId: user.id };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Slugify a Korean or English listing name into a URL-safe, unique slug. */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  // Korean names slugify to Hangul, which is valid in a URL but ugly once
  // percent-encoded — so always append a short random suffix for uniqueness.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "listing"}-${suffix}`;
}

export async function createProperty(
  nameKo: string,
  addressKo: string,
): Promise<ActionResult & { propertyId?: string }> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = z
    .object({
      nameKo: z.string().trim().min(1).max(200),
      addressKo: z.string().trim().min(1).max(500),
    })
    .safeParse({ nameKo, addressKo });
  if (!parsed.success) {
    return { ok: false, error: "Name and address are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_id: user.id,
      slug: slugify(parsed.data.nameKo),
      name_ko: parsed.data.nameKo,
      address_ko: parsed.data.addressKo,
      is_published: false, // always starts as a draft
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/properties");
  return { ok: true, propertyId: data.id };
}

// ---------------------------------------------------------------------------
// Basic details
// ---------------------------------------------------------------------------

const detailsSchema = z.object({
  propertyId: z.string().uuid(),
  name_ko: z.string().trim().min(1).max(200),
  name_en: z.string().trim().max(200).nullable(),
  address_ko: z.string().trim().min(1).max(500),
  address_en: z.string().trim().max(500).nullable(),
  address_detail: z.string().trim().max(200).nullable(),
  property_type: z.enum(["gosiwon", "share_house", "one_room", "dormitory"]),
  gender: z.enum(["any", "male", "female"]),
  age_min: z.number().int().min(0).max(120).nullable(),
  age_max: z.number().int().min(0).max(120).nullable(),
  floors_total: z.number().int().min(1).max(200).nullable(),
  floors_used: z.string().trim().max(50).nullable(),
  languages: z.array(z.string().trim().min(1)).max(20),
  description_ko: z.string().trim().max(5000).nullable(),
  description_en: z.string().trim().max(5000).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

export async function updatePropertyDetails(
  input: unknown,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { propertyId, ...fields } = parsed.data;

  if (
    fields.age_min != null &&
    fields.age_max != null &&
    fields.age_max < fields.age_min
  ) {
    return { ok: false, error: "Maximum age must be at least the minimum age." };
  }

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  const { error } = await supabase
    .from("properties")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", propertyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Publish state
// ---------------------------------------------------------------------------

export async function setPublished(
  propertyId: string,
  isPublished: boolean,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  const { error } = await supabase
    .from("properties")
    .update({ is_published: isPublished, updated_at: new Date().toISOString() })
    .eq("id", propertyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/properties");
  revalidatePath("/search");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const roomSchema = z.object({
  id: z.string().uuid().nullable(),
  propertyId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  monthly_rent: z.number().int().min(0).max(100_000_000),
  deposit: z.number().int().min(0).max(1_000_000_000),
  size_sqm: z.number().min(0).max(10_000).nullable(),
  min_contract_days: z.number().int().min(1).max(3650).nullable(),
  max_contract_days: z.number().int().min(1).max(3650).nullable(),
  is_available: z.boolean(),
});

export async function upsertRoom(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid room." };
  }
  const { id, propertyId, ...fields } = parsed.data;

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  const { error } = id
    ? await supabase.from("rooms").update(fields).eq("id", id).eq("property_id", propertyId)
    : await supabase.from("rooms").insert({ ...fields, property_id: propertyId });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}

export async function deleteRoom(
  propertyId: string,
  roomId: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", roomId)
    .eq("property_id", propertyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Amenities
// ---------------------------------------------------------------------------

export async function setPropertyAmenities(
  propertyId: string,
  amenityIds: string[],
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = z.array(z.string().uuid()).max(200).safeParse(amenityIds);
  if (!parsed.success) return { ok: false, error: "Invalid amenity selection." };

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  // Replace the whole set — simpler and race-free versus diffing.
  const { error: deleteError } = await supabase
    .from("property_amenities")
    .delete()
    .eq("property_id", propertyId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const { error } = await supabase.from("property_amenities").insert(
      parsed.data.map((amenity_id) => ({ property_id: propertyId, amenity_id })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** Records an already-uploaded storage object against the property. */
export async function addPropertyImage(
  propertyId: string,
  storagePath: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  // Reject paths outside this property's folder — the storage policy enforces
  // the same rule, but a mismatched row would still be confusing.
  if (!storagePath.startsWith(`${propertyId}/`)) {
    return { ok: false, error: "Invalid upload path." };
  }

  const { count } = await supabase
    .from("property_images")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  const { error } = await supabase.from("property_images").insert({
    property_id: propertyId,
    storage_path: storagePath,
    sort_order: count ?? 0,
    is_cover: (count ?? 0) === 0, // first photo becomes the cover
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}

export async function setCoverImage(
  propertyId: string,
  imageId: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  // A partial unique index allows only one cover per property, so clear first.
  const { error: clearError } = await supabase
    .from("property_images")
    .update({ is_cover: false })
    .eq("property_id", propertyId)
    .eq("is_cover", true);
  if (clearError) return { ok: false, error: clearError.message };

  const { error } = await supabase
    .from("property_images")
    .update({ is_cover: true })
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}

export async function deletePropertyImage(
  propertyId: string,
  imageId: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const { supabase, error: ownershipError } = await requireOwnership(propertyId);
  if (ownershipError) return { ok: false, error: ownershipError };

  const { data: image } = await supabase
    .from("property_images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (!image) return { ok: false, error: "Photo not found." };

  const { error } = await supabase
    .from("property_images")
    .delete()
    .eq("id", imageId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, error: error.message };

  // Best-effort: an orphaned object is harmless, a dangling row is not.
  await supabase.storage.from("property-images").remove([image.storage_path]);

  revalidatePath(`/dashboard/properties/${propertyId}`);
  return { ok: true };
}
