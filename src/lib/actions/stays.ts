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

/**
 * A stay is what makes a review possible — reviews attach to a real tenancy,
 * never to an inquiry. Only the host can open one, and only from an inquiry
 * they already accepted.
 */
export async function recordMoveIn(
  inquiryId: string,
  movedInAt: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = z
    .object({ inquiryId: z.string().uuid(), movedInAt: z.string().date() })
    .safeParse({ inquiryId, movedInAt });
  if (!parsed.success) return { ok: false, error: "Pick a valid move-in date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("property_id, tenant_id, owner_id, status")
    .eq("id", inquiryId)
    .maybeSingle();

  if (!inquiry) return { ok: false, error: "Inquiry not found." };
  if (inquiry.owner_id !== user.id) {
    return { ok: false, error: "Only the host can record a move-in." };
  }
  if (inquiry.status !== "accepted") {
    return { ok: false, error: "Accept the inquiry before recording a move-in." };
  }

  const { data: existing } = await supabase
    .from("stays")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  if (existing) return { ok: false, error: "A stay is already recorded for this." };

  const { error } = await supabase.from("stays").insert({
    property_id: inquiry.property_id,
    tenant_id: inquiry.tenant_id,
    owner_id: inquiry.owner_id,
    inquiry_id: inquiryId,
    moved_in_at: movedInAt,
    status: "active",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/inquiries/${inquiryId}`);
  return { ok: true };
}

/** Closing the stay is what opens the review window for both sides. */
export async function completeStay(
  stayId: string,
  movedOutAt: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = z
    .object({ stayId: z.string().uuid(), movedOutAt: z.string().date() })
    .safeParse({ stayId, movedOutAt });
  if (!parsed.success) return { ok: false, error: "Pick a valid move-out date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: stay } = await supabase
    .from("stays")
    .select("owner_id, moved_in_at, inquiry_id")
    .eq("id", stayId)
    .maybeSingle();

  if (!stay) return { ok: false, error: "Stay not found." };
  if (stay.owner_id !== user.id) {
    return { ok: false, error: "Only the host can close a stay." };
  }
  if (movedOutAt < stay.moved_in_at) {
    return { ok: false, error: "Move-out can't be before move-in." };
  }

  const { error } = await supabase
    .from("stays")
    .update({ status: "completed", moved_out_at: movedOutAt })
    .eq("id", stayId);

  if (error) return { ok: false, error: error.message };

  if (stay.inquiry_id) revalidatePath(`/inquiries/${stay.inquiry_id}`);
  revalidatePath("/my-record");
  return { ok: true };
}

const scoreSchema = z.number().int().min(1).max(5).nullable();

const reviewSchema = z.object({
  stayId: z.string().uuid(),
  direction: z.enum(["owner_on_tenant", "tenant_on_owner"]),
  payment_timeliness: scoreSchema,
  cleanliness: scoreSchema,
  quiet_hours: scoreSchema,
  communication: scoreSchema,
  rule_compliance: scoreSchema,
  comment: z.string().trim().max(600).nullable(),
});

/**
 * One review per direction per stay. RLS re-checks that the author is really a
 * party to a *completed* stay and that subject_id is the other side, so a
 * forged direction can't write a review about someone uninvolved.
 *
 * Reviews land hidden; a trigger reveals both once the second one arrives.
 */
export async function submitReview(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the ratings and try again." };
  const { stayId, direction, comment, ...scores } = parsed.data;

  if (Object.values(scores).every((v) => v == null)) {
    return { ok: false, error: "Rate at least one thing." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: stay } = await supabase
    .from("stays")
    .select("owner_id, tenant_id, status, inquiry_id")
    .eq("id", stayId)
    .maybeSingle();

  if (!stay) return { ok: false, error: "Stay not found." };
  if (stay.status !== "completed") {
    return { ok: false, error: "You can review once the stay is complete." };
  }

  const subjectId =
    direction === "owner_on_tenant" ? stay.tenant_id : stay.owner_id;
  const expectedAuthor =
    direction === "owner_on_tenant" ? stay.owner_id : stay.tenant_id;

  if (expectedAuthor !== user.id) {
    return { ok: false, error: "You can't write that review." };
  }

  const { error } = await supabase.from("stay_reviews").insert({
    stay_id: stayId,
    author_id: user.id,
    subject_id: subjectId,
    direction,
    ...scores,
    comment,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "You've already reviewed this stay." };
    }
    return { ok: false, error: error.message };
  }

  if (stay.inquiry_id) revalidatePath(`/inquiries/${stay.inquiry_id}`);
  revalidatePath("/my-record");
  return { ok: true };
}

/** The person a review is about may add one reply. Scores are never editable. */
export async function replyToReview(
  reviewId: string,
  reply: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = z
    .object({ reviewId: z.string().uuid(), reply: z.string().trim().min(1).max(600) })
    .safeParse({ reviewId, reply });
  if (!parsed.success) return { ok: false, error: "Write a short reply." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stay_reviews")
    .update({ subject_reply: parsed.data.reply })
    .eq("id", reviewId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/my-record");
  return { ok: true };
}
