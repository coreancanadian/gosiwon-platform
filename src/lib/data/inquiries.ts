import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type {
  ApplicantReputation,
  Inquiry,
  Message,
  Profile,
  Property,
  Room,
  Stay,
  StayReview,
} from "@/lib/types/database";

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
  /**
   * The applicant's aggregate stay record. Non-null only when the viewer is
   * the host AND the tenant consented on this application — the RPC returns
   * nothing otherwise, so this can't leak by forgetting a UI check.
   */
  applicantReputation: ApplicantReputation | null;
  /** The tenancy opened from this inquiry, once the host confirms move-in. */
  stay: Stay | null;
  /** The viewer's own review of that stay, if they've written it. */
  myReview: StayReview | null;
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

  const [{ data: messages }, { data: counterpartyRows }, { data: reputationRows }] =
    await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true }),
    // Not a plain `profiles` select: the table policy only exposes your own
    // row. This definer function returns the counterparty's name always, and
    // their contact details only once the inquiry is accepted.
    supabase.rpc("get_inquiry_counterparty", { p_inquiry_id: inquiryId }),
    // Returns zero rows unless the caller is the host and the tenant consented.
    supabase.rpc("get_applicant_reputation", { p_inquiry_id: inquiryId }),
  ]);

  // The tenancy this inquiry turned into, plus whatever review the viewer has
  // already written for it. RLS scopes both to the two parties.
  const { data: stay } = await supabase
    .from("stays")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();

  let myReview: StayReview | null = null;
  if (stay) {
    const { data } = await supabase
      .from("stay_reviews")
      .select("*")
      .eq("stay_id", stay.id)
      .eq("author_id", user.id)
      .maybeSingle();
    myReview = data ?? null;
  }

  return {
    ...typed,
    messages: (messages ?? []) as Message[],
    counterparty:
      (counterpartyRows as InquiryThread["counterparty"][] | null)?.[0] ?? null,
    viewerId: user.id,
    viewerIsOwner,
    applicantReputation:
      (reputationRows as ApplicantReputation[] | null)?.[0] ?? null,
    stay,
    myReview,
  };
}
