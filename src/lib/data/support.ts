import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Profile, SupportMessage, UserRole } from "@/lib/types/database";

const BUCKET = "support-attachments";
// Documents are private, so links are short-lived signed URLs regenerated on
// each page load rather than anything that could be shared onward for long.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface SupportMessageView {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  attachment: { name: string; url: string | null } | null;
}

export interface SupportThreadView {
  /** Null until the first message opens the thread. */
  threadId: string | null;
  ownerId: string;
  messages: SupportMessageView[];
}

/** One user's conversation with the operator, oldest message first. */
export async function getSupportThread(ownerId: string): Promise<SupportThreadView> {
  const empty: SupportThreadView = { threadId: null, ownerId, messages: [] };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("support_threads")
    .select("id")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!thread) return empty;

  const { data } = await supabase
    .from("support_messages")
    .select("*")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as SupportMessage[];

  const paths = rows
    .map((r) => r.attachment_path)
    .filter((p): p is string => Boolean(p));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    });
  }

  return {
    threadId: thread.id,
    ownerId,
    messages: rows.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      body: r.body,
      createdAt: r.created_at,
      attachment: r.attachment_path
        ? {
            name: r.attachment_name ?? "attachment",
            url: urlByPath.get(r.attachment_path) ?? null,
          }
        : null,
    })),
  };
}

export interface SupportInboxRow {
  userId: string;
  name: string | null;
  role: UserRole;
  lastMessageAt: string;
  unread: boolean;
  preview: string;
  hasAttachment: boolean;
}

/** Admin inbox: every conversation, newest activity first. */
export async function listSupportInbox(): Promise<SupportInboxRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: threads } = await supabase
    .from("support_threads")
    .select("id, user_id, last_message_at, admin_unread")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (!threads || threads.length === 0) return [];

  const userIds = threads.map((t) => t.user_id);
  const threadIds = threads.map((t) => t.id);

  const [{ data: profiles }, { data: messages }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").in("id", userIds),
    supabase
      .from("support_messages")
      .select("thread_id, body, attachment_path, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const profileById = new Map(
    ((profiles ?? []) as Pick<Profile, "id" | "full_name" | "role">[]).map((p) => [p.id, p]),
  );
  // Newest-first, so the first message seen per thread is its latest.
  const latestByThread = new Map<string, { body: string; attachment_path: string | null }>();
  for (const m of messages ?? []) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m);
  }

  return threads.map((t) => {
    const profile = profileById.get(t.user_id);
    const latest = latestByThread.get(t.id);
    return {
      userId: t.user_id,
      name: profile?.full_name ?? null,
      role: profile?.role ?? "tenant",
      lastMessageAt: t.last_message_at,
      unread: t.admin_unread,
      preview: latest?.body ?? "",
      hasAttachment: Boolean(latest?.attachment_path),
    };
  });
}

/** Conversations awaiting the viewer: the admin's inbox, or a user's own reply. */
export async function getSupportUnreadCount(role: UserRole): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("support_threads")
    .select("id", { count: "exact", head: true })
    .eq(role === "admin" ? "admin_unread" : "user_unread", true);
  // A failed count (e.g. before the migration is applied) must never break
  // the page it's shown on — this runs in the site-wide layout.
  return count ?? 0;
}
