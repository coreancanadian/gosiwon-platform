"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActionResult } from "./inquiries";

const sendSchema = z
  .object({
    body: z.string().trim().max(4000),
    // Set only when an admin is replying inside someone else's thread.
    threadUserId: z.string().uuid().optional(),
    // Uploaded straight from the browser to Storage (under RLS) — Server
    // Actions cap request bodies far below a scanned document's size.
    attachmentPath: z.string().max(300).optional(),
    attachmentName: z.string().max(200).optional(),
  })
  .refine((v) => v.body.length > 0 || Boolean(v.attachmentPath), {
    message: "empty",
  });

/**
 * A user writes to the operator, or the admin replies inside a user's thread.
 * The thread owner is resolved here rather than trusted from the client, and
 * RLS independently pins sender_id to the caller.
 */
export async function sendSupportMessage(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database is not configured." };
  }

  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message can't be empty." };
  const { body, threadUserId, attachmentPath, attachmentName } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = me?.role === "admin";

  // Only an admin may write into someone else's thread.
  const ownerId = isAdmin && threadUserId ? threadUserId : user.id;

  // An attachment must live in the thread owner's own folder — otherwise a
  // message could point at (and expose) a file from a different user.
  if (attachmentPath && !attachmentPath.startsWith(`${ownerId}/`)) {
    return { ok: false, error: "Invalid attachment." };
  }

  const findThread = () =>
    supabase.from("support_threads").select("id").eq("user_id", ownerId).maybeSingle();

  let { data: thread } = await findThread();

  if (!thread) {
    // Admins reply into existing threads; only the user opens their own.
    if (isAdmin && ownerId !== user.id) {
      return { ok: false, error: "Conversation not found." };
    }
    const { data: created, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id })
      .select("id")
      .single();

    if (error) {
      // 23505: a parallel first message opened it — use that one.
      if (error.code !== "23505") return { ok: false, error: error.message };
      ({ data: thread } = await findThread());
    } else {
      thread = created;
    }
  }
  if (!thread) return { ok: false, error: "Couldn't open the conversation." };

  const { error } = await supabase.from("support_messages").insert({
    thread_id: thread.id,
    sender_id: user.id,
    body,
    attachment_path: attachmentPath ?? null,
    attachment_name: attachmentName ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/support");
  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/support/${ownerId}`);
  return { ok: true };
}

/** Clears the caller's own unread flag on a thread they're viewing. */
export async function markSupportRead(threadId: string): Promise<void> {
  if (!isSupabaseConfigured() || !z.string().uuid().safeParse(threadId).success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_support_read", { p_thread_id: threadId });
}
