import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Inquiry, Message, Profile, Property, Room } from "@/lib/types/database";

export interface InquiryListItem extends Inquiry {
  properties: Pick<Property, "id" | "slug" | "name_ko" | "name_en" | "address_ko" | "address_en"> | null;
  rooms: Pick<Room, "id" | "name"> | null;
}

export interface InquiryThread extends InquiryListItem {
  messages: Message[];
  /** The other party's profile. Contact fields are only filled once accepted. */
  counterparty: Pick<Profile, "id" | "full_name" | "phone" | "kakao_id" | "whatsapp"> | null;
  viewerId: string;
  viewerIsOwner: boolean;
}

const LIST_SELECT = `
  *,
  properties (id, slug, name_ko, name_en, address_ko, address_en),
  rooms (id, name)
` as const;

/**
 * Inquiries where the signed-in user is the tenant (`as: "tenant"`)
 * or the host (`as: "owner"`). RLS already scopes rows to the two parties;
 * the explicit filter picks which side of the conversation we want.
 */
export async function getMyInquiries(
  as: "tenant" | "owner",
): Promise<InquiryListItem[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("inquiries")
    .select(LIST_SELECT)
    .eq(as === "tenant" ? "tenant_id" : "owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load inquiries: ${error.message}`);
  return (data ?? []) as unknown as InquiryListItem[];
}

export async function getInquiryThread(
  inquiryId: string,
): Promise<InquiryThread | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: inquiry, error } = await supabase
    .from("inquiries")
    .select(LIST_SELECT)
    .eq("id", inquiryId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load inquiry: ${error.message}`);
  if (!inquiry) return null;

  const typed = inquiry as unknown as InquiryListItem;
  const viewerIsOwner = typed.owner_id === user.id;

  const [{ data: messages }, { data: counterpartyRows }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true }),
    // Not a plain `profiles` select: the table policy only exposes your own
    // row. This definer function returns the counterparty's name always, and
    // their contact details only once the inquiry is accepted.
    supabase.rpc("get_inquiry_counterparty", { p_inquiry_id: inquiryId }),
  ]);

  return {
    ...typed,
    messages: (messages ?? []) as Message[],
    counterparty:
      (counterpartyRows as InquiryThread["counterparty"][] | null)?.[0] ?? null,
    viewerId: user.id,
    viewerIsOwner,
  };
}
