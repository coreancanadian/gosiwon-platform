import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { PropertyWithRelations } from "@/lib/types/database";

export interface OwnerStats {
  publishedProperties: number;
  totalProperties: number;
  totalRooms: number;
  pendingInquiries: number;
}

/** Listings belonging to the signed-in host, drafts included. */
export async function getOwnerProperties(): Promise<PropertyWithRelations[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("properties")
    .select("*, rooms (*), property_images (*), regions (*)")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load your listings: ${error.message}`);
  return (data ?? []) as unknown as PropertyWithRelations[];
}

export async function getOwnerProperty(
  propertyId: string,
): Promise<PropertyWithRelations | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("properties")
    .select("*, rooms (*), property_images (*), regions (*)")
    .eq("id", propertyId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load listing: ${error.message}`);
  return data as unknown as PropertyWithRelations | null;
}

export async function getOwnerStats(): Promise<OwnerStats> {
  const empty: OwnerStats = {
    publishedProperties: 0,
    totalProperties: 0,
    totalRooms: 0,
    pendingInquiries: 0,
  };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const [properties, pending] = await Promise.all([
    supabase
      .from("properties")
      .select("id, is_published, rooms (id)")
      .eq("owner_id", user.id),
    supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("status", "pending"),
  ]);

  const rows = (properties.data ?? []) as unknown as Array<{
    id: string;
    is_published: boolean;
    rooms: Array<{ id: string }>;
  }>;

  return {
    totalProperties: rows.length,
    publishedProperties: rows.filter((r) => r.is_published).length,
    totalRooms: rows.reduce((sum, r) => sum + (r.rooms?.length ?? 0), 0),
    pendingInquiries: pending.count ?? 0,
  };
}

/** Public URL for a stored photo path. */
export async function getImagePublicUrl(storagePath: string): Promise<string> {
  if (!isSupabaseConfigured()) return storagePath;
  // Already an absolute URL (e.g. seeded from an external source).
  if (/^https?:\/\//.test(storagePath)) return storagePath;

  const supabase = await createClient();
  const { data } = supabase.storage
    .from("property-images")
    .getPublicUrl(storagePath);
  return data.publicUrl;
}
