import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, sendEmail, sendOperatorEmail, type NotificationEmail } from "@/lib/email";
import { displayName } from "@/lib/localize";
import type { UserRole } from "@/lib/types/database";

/**
 * Called by the database triggers in migration 0013 when someone signs up or
 * sends a message. Emails the operator about it, and tells the member on the
 * other end of a message that something is waiting for them. The request only
 * names a row; everything shown in an email is looked up here.
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
    confirmed: Boolean(auth?.user?.email_confirmed_at),
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

async function signupEmail(admin: Admin, id: string): Promise<NotificationEmail | null> {
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
async function messageEmail(admin: Admin, id: string): Promise<NotificationEmail | null> {
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
  const rows: NonNullable<NotificationEmail["rows"]> = [
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
async function supportEmail(admin: Admin, id: string): Promise<NotificationEmail | null> {
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

  const rows: NonNullable<NotificationEmail["rows"]> = [
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

/** Replies sent this close together become one email, not one per message. */
const BURST_WINDOW_MS = 10 * 60 * 1000;

const NOTICE_FOOTER =
  "이 메일은 발신 전용입니다. 답장은 사이트에서 보내 주세요. / This address doesn't accept replies, so please respond on the site.";

type MemberNotice = { to: string; email: NotificationEmail };

/** Who a notice can go to: never the operator, who gets their own email. */
async function noticeRecipient(admin: Admin, userId: string) {
  const person = await describePerson(admin, userId);
  // An unconfirmed address may not belong to the person who typed it.
  if (person.role === "admin" || !person.confirmed) return null;
  return person;
}

function isBurst(
  previous: { sender_id: string; created_at: string } | null,
  current: { sender_id: string; created_at: string },
): boolean {
  if (!previous || previous.sender_id !== current.sender_id) return false;
  const gap = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
  return gap < BURST_WINDOW_MS;
}

/**
 * Inquiry thread: tells the other party a message is waiting. Message text is
 * left out on purpose, so a private conversation isn't copied into a mailbox.
 */
async function messageNotice(admin: Admin, id: string): Promise<MemberNotice | null> {
  const { data: message } = await admin
    .from("messages")
    .select("sender_id, created_at, inquiry_id")
    .eq("id", id)
    .maybeSingle();
  if (!message) return null;

  const { data: inquiry } = await admin
    .from("inquiries")
    .select("tenant_id, owner_id, properties (name_ko, name_en)")
    .eq("id", message.inquiry_id)
    .maybeSingle();
  if (!inquiry) return null;

  const recipientId =
    message.sender_id === inquiry.tenant_id ? inquiry.owner_id : inquiry.tenant_id;
  const [recipient, { data: previous }] = await Promise.all([
    noticeRecipient(admin, recipientId),
    admin
      .from("messages")
      .select("sender_id, created_at")
      .eq("inquiry_id", message.inquiry_id)
      .lt("created_at", message.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!recipient || isBurst(previous, message)) return null;

  const listing = inquiry.properties as unknown as { name_ko: string; name_en: string | null } | null;
  const nameKo = listing?.name_ko ?? "매물";
  const nameEn = listing ? displayName(listing, "en") : "your listing inquiry";

  return {
    to: recipient.email,
    email: {
      subject: `[캠퍼스플랫] ${nameKo} 관련 새 메시지 / New message about ${nameEn}`,
      intro: [
        `'${nameKo}' 관련 새 메시지가 도착했습니다. 아래 버튼을 눌러 확인해 주세요.`,
        `You have a new message about ${nameEn}. Use the button below to read it.`,
      ],
      cta: {
        label: "메시지 확인하기 / View message",
        href: `${SITE_URL}/inquiries/${message.inquiry_id}`,
      },
      footer: NOTICE_FOOTER,
    },
  };
}

/** Contact channel: tells a member the team has replied. */
async function supportNotice(admin: Admin, id: string): Promise<MemberNotice | null> {
  const { data: message } = await admin
    .from("support_messages")
    .select("sender_id, created_at, thread_id")
    .eq("id", id)
    .maybeSingle();
  if (!message) return null;

  const { data: thread } = await admin
    .from("support_threads")
    .select("user_id")
    .eq("id", message.thread_id)
    .maybeSingle();
  // A member writing in is the operator's email, not a notice to themselves.
  if (!thread || thread.user_id === message.sender_id) return null;

  const [recipient, { data: previous }] = await Promise.all([
    noticeRecipient(admin, thread.user_id),
    admin
      .from("support_messages")
      .select("sender_id, created_at")
      .eq("thread_id", message.thread_id)
      .lt("created_at", message.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!recipient || isBurst(previous, message)) return null;

  return {
    to: recipient.email,
    email: {
      subject: "[캠퍼스플랫] 운영팀 답장이 도착했습니다 / New reply from the Campusflat team",
      intro: [
        "캠퍼스플랫 운영팀이 답장을 보냈습니다. 아래 버튼을 눌러 확인해 주세요.",
        "The Campusflat team has replied to you. Use the button below to read it.",
      ],
      cta: { label: "답장 확인하기 / View reply", href: `${SITE_URL}/support` },
      footer: NOTICE_FOOTER,
    },
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
    const [operatorEmail, notice] = await Promise.all([
      type === "signup"
        ? signupEmail(admin, id)
        : type === "message"
          ? messageEmail(admin, id)
          : supportEmail(admin, id),
      type === "message"
        ? messageNotice(admin, id)
        : type === "support_message"
          ? supportNotice(admin, id)
          : null,
    ]);

    // Null covers the operator's own activity and rows that no longer exist.
    // Settled separately so one failed send doesn't lose the other email.
    const results = await Promise.allSettled([
      operatorEmail ? sendOperatorEmail(operatorEmail) : null,
      notice ? sendEmail(notice.to, notice.email) : null,
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;

    return NextResponse.json({ sent: Boolean(operatorEmail || notice) });
  } catch (error) {
    console.error("Notification failed", type, id, error);
    return NextResponse.json({ error: "Notification failed" }, { status: 500 });
  }
}
