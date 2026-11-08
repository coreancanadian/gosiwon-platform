import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, sendOperatorEmail, type OperatorEmail } from "@/lib/email";
import type { UserRole } from "@/lib/types/database";

/**
 * Called by the database triggers in migration 0013 when someone signs up or
 * sends a message, and emails the operator about it. The request only names a
 * row; everything shown in the email is looked up here.
 *
 * Lives under /api so the i18n proxy's matcher skips it.
 */

const payloadSchema = z.object({
  type: z.enum(["signup", "message", "support_message"]),
  id: z.string().uuid(),
});

const ROLE_LABEL: Record<UserRole, string> = {
  tenant: "방 찾는 사람",
  owner: "사장님",
  admin: "관리자",
};

type Admin = ReturnType<typeof createAdminClient>;

function secretMatches(given: string | null): boolean {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  // Hashing first gives equal-length inputs, which timingSafeEqual requires.
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(given), hash(expected));
}

function kst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

async function describePerson(admin: Admin, userId: string) {
  const [{ data: profile }, { data: auth }] = await Promise.all([
    admin.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const role = (profile?.role ?? "tenant") as UserRole;
  return {
    role,
    name: profile?.full_name || "이름 없음",
    email: auth?.user?.email ?? "—",
  };
}

async function listingRow(admin: Admin, propertyId: string | null) {
  if (!propertyId) return null;
  const { data } = await admin
    .from("properties")
    .select("slug, name_ko")
    .eq("id", propertyId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name_ko,
    row: {
      label: "문의 매물",
      value: data.name_ko,
      href: `${SITE_URL}/property/${data.slug}`,
    },
  };
}

async function signupEmail(admin: Admin, id: string): Promise<OperatorEmail | null> {
  const person = await describePerson(admin, id);
  if (person.role === "admin") return null;
  return {
    subject: `[캠퍼스플랫] 새 회원가입: ${person.name} (${ROLE_LABEL[person.role]})`,
    rows: [
      { label: "이름", value: person.name },
      { label: "이메일", value: person.email },
      { label: "유형", value: ROLE_LABEL[person.role] },
      { label: "가입 시각", value: kst(new Date().toISOString()) },
    ],
    cta: { label: "대시보드 열기", href: `${SITE_URL}/dashboard` },
  };
}

/** A message inside an inquiry thread: always tied to a listing. */
async function messageEmail(admin: Admin, id: string): Promise<OperatorEmail | null> {
  const { data: message } = await admin
    .from("messages")
    .select("sender_id, body, created_at, inquiry_id")
    .eq("id", id)
    .maybeSingle();
  if (!message) return null;

  const person = await describePerson(admin, message.sender_id);
  if (person.role === "admin") return null;

  const { data: inquiry } = await admin
    .from("inquiries")
    .select("property_id, owner_id, move_in_date, duration_months")
    .eq("id", message.inquiry_id)
    .maybeSingle();
  if (!inquiry) return null;

  const [listing, { data: owner }, { count }] = await Promise.all([
    listingRow(admin, inquiry.property_id),
    admin.from("profiles").select("role").eq("id", inquiry.owner_id).maybeSingle(),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("inquiry_id", message.inquiry_id),
  ]);

  const isFirst = (count ?? 0) <= 1;
  const rows: OperatorEmail["rows"] = [
    { label: "보낸 사람", value: `${person.name} (${ROLE_LABEL[person.role]})` },
    { label: "이메일", value: person.email },
  ];
  if (listing) rows.push(listing.row);
  if (isFirst && inquiry.move_in_date) rows.push({ label: "입주 희망일", value: inquiry.move_in_date });
  if (isFirst && inquiry.duration_months) rows.push({ label: "거주 기간", value: `${inquiry.duration_months}개월` });
  rows.push({ label: "시각", value: kst(message.created_at) });

  return {
    subject: `[캠퍼스플랫] ${isFirst ? "새 문의" : "새 메시지"}: ${person.name} → ${listing?.name ?? "매물"}`,
    rows,
    message: message.body,
    // Only the two parties can open a thread, so the link only works when the
    // operator is the host (true for every listing nobody has claimed yet).
    cta:
      owner?.role === "admin"
        ? { label: "대화 열기", href: `${SITE_URL}/inquiries/${message.inquiry_id}` }
        : undefined,
  };
}

/** A message to the operator through the Contact button. */
async function supportEmail(admin: Admin, id: string): Promise<OperatorEmail | null> {
  const { data: message } = await admin
    .from("support_messages")
    .select("sender_id, body, created_at, thread_id, property_id, attachment_name")
    .eq("id", id)
    .maybeSingle();
  if (!message) return null;

  const person = await describePerson(admin, message.sender_id);
  if (person.role === "admin") return null;

  const [listing, { data: thread }] = await Promise.all([
    listingRow(admin, message.property_id),
    admin.from("support_threads").select("user_id").eq("id", message.thread_id).maybeSingle(),
  ]);

  const rows: OperatorEmail["rows"] = [
    { label: "보낸 사람", value: `${person.name} (${ROLE_LABEL[person.role]})` },
    { label: "이메일", value: person.email },
  ];
  if (listing) rows.push(listing.row);
  // The file itself stays in private storage: a business registration should
  // not end up copied into a mailbox.
  if (message.attachment_name) rows.push({ label: "첨부 파일", value: message.attachment_name });
  rows.push({ label: "시각", value: kst(message.created_at) });

  return {
    subject: `[캠퍼스플랫] 문의하기: ${person.name}${listing ? ` → ${listing.name}` : ""}`,
    rows,
    message: message.body || undefined,
    cta: thread
      ? { label: "답장하기", href: `${SITE_URL}/dashboard/support/${thread.user_id}` }
      : undefined,
  };
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { type, id } = parsed.data;

  try {
    const admin = createAdminClient();
    const email =
      type === "signup"
        ? await signupEmail(admin, id)
        : type === "message"
          ? await messageEmail(admin, id)
          : await supportEmail(admin, id);

    // Null covers the operator's own activity and rows that no longer exist.
    if (!email) return NextResponse.json({ sent: false });

    await sendOperatorEmail(email);
    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Notification failed", type, id, error);
    return NextResponse.json({ error: "Notification failed" }, { status: 500 });
  }
}
