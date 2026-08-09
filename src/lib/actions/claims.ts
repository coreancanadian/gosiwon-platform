"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActionResult } from "./inquiries";

const claimSchema = z.object({
  propertySlug: z.string().min(1),
  evidence: z.string().trim().min(10).max(2000),
  contactPhone: z.string().trim().max(40).nullable(),
});

/**
 * An operator says "this is my 고시원".
 *
 * Nothing transfers here — this only files the request. An admin approves it,
 * and approve_property_claim() moves owner_id. That gate is the whole point:
 * the listings were imported from public data, so possession of the page is
 * not evidence of running the business.
 */
export async function submitClaim(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Tell us briefly how we can verify you run this place.",
    };
  }
  const { propertySlug, evidence, contactPhone } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: property } = await supabase
    .from("properties")
    .select("id, claim_status")
    .eq("slug", propertySlug)
    .maybeSingle();

  if (!property) return { ok: false, error: "Listing not found." };
  if (property.claim_status === "claimed") {
    return { ok: false, error: "This listing already has a registered operator." };
  }

  const { error } = await supabase.from("property_claims").insert({
    property_id: property.id,
    claimant_id: user.id,
    evidence,
    contact_phone: contactPhone,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "You've already submitted a claim for this listing." };
    }
    return { ok: false, error: error.message };
  }

  // Flag the listing as spoken-for so a second operator sees it is in review.
  await supabase
    .from("properties")
    .update({ claim_status: "pending" })
    .eq("id", property.id)
    .eq("claim_status", "unclaimed");

  revalidatePath(`/property/${propertySlug}`);
  revalidatePath("/dashboard/claims");
  return { ok: true };
}

/** Admin approves; the RPC transfers ownership and promotes the claimant. */
export async function approveClaim(claimId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_property_claim", {
    p_claim_id: claimId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/claims");
  revalidatePath("/search");
  return { ok: true };
}

export async function rejectClaim(
  claimId: string,
  note: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: claim } = await supabase
    .from("property_claims")
    .select("property_id")
    .eq("id", claimId)
    .maybeSingle();

  const { error } = await supabase
    .from("property_claims")
    .update({
      status: "rejected",
      reviewer_id: user.id,
      review_note: note,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (error) return { ok: false, error: error.message };

  // Put the listing back in play if no other claim is outstanding.
  if (claim) {
    const { count } = await supabase
      .from("property_claims")
      .select("id", { count: "exact", head: true })
      .eq("property_id", claim.property_id)
      .eq("status", "pending");

    if ((count ?? 0) === 0) {
      await supabase
        .from("properties")
        .update({ claim_status: "unclaimed" })
        .eq("id", claim.property_id)
        .eq("claim_status", "pending");
    }
  }

  revalidatePath("/dashboard/claims");
  return { ok: true };
}
