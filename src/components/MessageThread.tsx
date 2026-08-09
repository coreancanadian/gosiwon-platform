"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Loader2, Phone, Send, X } from "lucide-react";
import { respondToInquiry, sendMessage } from "@/lib/actions/inquiries";
import type { InquiryThread } from "@/lib/data/inquiries";

export function MessageThread({ thread }: { thread: InquiryThread }) {
  const t = useTranslations("Messages");
  const tDash = useTranslations("Dashboard");
  const tEnum = useTranslations("Enums");
  const router = useRouter();

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await sendMessage({ inquiryId: thread.id, body });
      if (!result.ok) {
        setError(result.error ?? "Failed to send.");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  function onRespond(status: "accepted" | "declined") {
    const confirmText =
      status === "accepted" ? tDash("acceptConfirm") : tDash("declineConfirm");
    if (!window.confirm(confirmText)) return;
    setError(null);

    startTransition(async () => {
      const result = await respondToInquiry({ inquiryId: thread.id, status });
      if (!result.ok) {
        setError(result.error ?? "Failed to respond.");
        return;
      }
      router.refresh();
    });
  }

  const contact = thread.counterparty;
  const hasContactDetails =
    thread.status === "accepted" &&
    (contact?.phone || contact?.kakao_id || contact?.whatsapp);

  return (
    <div className="flex flex-col gap-4">
      {/* Status banner */}
      <div
        className={`rounded-[var(--radius-card)] border p-4 ${
          thread.status === "accepted"
            ? "border-emerald-300 bg-emerald-50"
            : thread.status === "declined"
              ? "border-ink-300 bg-ink-50"
              : "border-amber-300 bg-amber-50"
        }`}
      >
        <p className="text-sm font-medium text-ink-800">
          {thread.status === "accepted"
            ? t("acceptedNotice")
            : thread.status === "declined"
              ? t("declinedNotice")
              : t("pendingNotice")}
        </p>

        {hasContactDetails ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-700">
            <Phone className="h-4 w-4 text-ink-500" aria-hidden />
            {contact?.phone ? <span>{contact.phone}</span> : null}
            {contact?.kakao_id ? <span>KakaoTalk: {contact.kakao_id}</span> : null}
            {contact?.whatsapp ? <span>WhatsApp: {contact.whatsapp}</span> : null}
          </div>
        ) : null}

        {/* Only the host sees accept/decline, and only while pending. */}
        {thread.viewerIsOwner && thread.status === "pending" ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onRespond("accepted")}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <Check className="h-4 w-4" aria-hidden />
              {tDash("accept")}
            </button>
            <button
              type="button"
              onClick={() => onRespond("declined")}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg border border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100 disabled:opacity-60"
            >
              <X className="h-4 w-4" aria-hidden />
              {tDash("decline")}
            </button>
          </div>
        ) : null}
      </div>

      {/* Messages */}
      <div className="min-h-[240px] space-y-3 rounded-[var(--radius-card)] border border-ink-200 p-4">
        {thread.messages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-ink-700">{t("empty")}</p>
            <p className="mt-1 text-sm text-ink-400">{t("emptyHint")}</p>
          </div>
        ) : (
          thread.messages.map((message) => {
            const isMine = message.sender_id === thread.viewerId;
            return (
              <div
                key={message.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line ${
                    isMine
                      ? "bg-brand-500 text-white"
                      : "bg-ink-100 text-ink-800"
                  }`}
                >
                  {message.body}
                  <span
                    className={`mt-1 block text-[11px] ${isMine ? "text-white/70" : "text-ink-400"}`}
                  >
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-600">
          {error}
        </p>
      ) : null}

      {/* Composer — closed threads are read-only. */}
      {thread.status !== "closed" && thread.status !== "declined" ? (
        <form onSubmit={onSend} className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={4000}
            className="flex-1 rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            {t("send")}
          </button>
        </form>
      ) : (
        <p className="text-center text-sm text-ink-400">
          {tEnum(`inquiryStatus.${thread.status}`)}
        </p>
      )}
    </div>
  );
}
