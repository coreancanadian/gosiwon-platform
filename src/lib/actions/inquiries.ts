"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface ActionResult {
  ok: boolean;
  error?: string;
  inquiryId?: string;
}

const createSchema = z.object({
  propertySlug: z.string().min(1),
  roomId: z.string().uuid().nullable(),
  moveInDate: z.string().date().nullable(),
  durationMonths: z.number().int().min(1).max(60).nullable(),
  introMessage: z.string().trim().min(1).max(2000),
  // The tenant's explicit, per-application consent to show this host their
  // stay record. Defaults to false: the record is never shared implicitly.
  shareReputation: z.boolean().default(false),
});

/**
 * A tenant asks about a listing. The owner is resolved server-side from the
 * property rather than trusted from the client, and RLS additionally pins
 * tenant_id to the caller.
 */
export async function createInquiry(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }
  const {
    propertySlug,
    roomId,
    moveInDate,
    durationMonths,
    introMessage,
    shareReputation,
  } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: property } = await supabase
    .from("properties")
    .select("id, owner_id")
    .eq("slug", propertySlug)
    .single();

  if (!property) return { ok: false, error: "Listing not found." };
  if (property.owner_id === user.id) {
    return { ok: false, error: "You can't inquire about your own listing." };
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      property_id: property.id,
      room_id: roomId,
      tenant_id: user.id,
      owner_id: property.owner_id,
      move_in_date: moveInDate,
      duration_months: durationMonths,
      intro_message: introMessage,
      share_reputation: shareReputation,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on (property_id, tenant_id)
    if (error.code === "23505") {
      return { ok: false, error: "You've already inquired about this listing." };
    }
    return { ok: false, error: error.message };
  }

  // Seed the thread with the tenant's opening message.
  await supabase.from("messages").insert({
    inquiry_id: data.id,
    sender_id: user.id,
    body: introMessage,
  });

  revalidatePath("/inquiries");
  revalidatePath("/dashboard/inquiries");
  return { ok: true, inquiryId: data.id };
}

const respondSchema = z.object({
  inquiryId: z.string().uuid(),
  status: z.enum(["accepted", "declined", "closed"]),
});

/** Owner accepts or declines; tenant may close their own thread. */
export async function respondToInquiry(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { inquiryId, status } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("owner_id, tenant_id")
    .eq("id", inquiryId)
    .single();

  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  // Only the owner may accept/decline. Either party may close.
  const isOwner = inquiry.owner_id === user.id;
  const isTenant = inquiry.tenant_id === user.id;
  if (status !== "closed" && !isOwner) {
    return { ok: false, error: "Only the host can respond to this inquiry." };
  }
  if (status === "closed" && !isOwner && !isTenant) {
    return { ok: false, error: "Not allowed." };
  }

  const { error } = await supabase
    .from("inquiries")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", inquiryId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
  return { ok: true };
}

const messageSchema = z.object({
  inquiryId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function sendMessage(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message can't be empty." };
  const { inquiryId, body } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  // RLS enforces that the sender is a party on this thread.
  const { error } = await supabase
    .from("messages")
    .insert({ inquiry_id: inquiryId, sender_id: user.id, body });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/inquiries/${inquiryId}`);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  return { ok: true };
}
