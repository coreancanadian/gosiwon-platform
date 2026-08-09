"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createInquiry } from "@/lib/actions/inquiries";
import type { Room } from "@/lib/types/database";

export function InquiryForm({
  propertySlug,
  rooms,
}: {
  propertySlug: string;
  rooms: Room[];
}) {
  const t = useTranslations("Inquiry");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [roomId, setRoomId] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [introMessage, setIntroMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createInquiry({
        propertySlug,
        roomId: roomId || null,
        moveInDate: moveInDate || null,
        durationMonths: durationMonths ? Number(durationMonths) : null,
        introMessage,
      });

      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/inquiries/${result.inquiryId}`);
    });
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="room" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("room")}
        </label>
        <select
          id="room"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className={inputClass}
        >
          <option value="">{t("roomAny")}</option>
          {rooms
            .filter((r) => r.is_available)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="moveIn" className="mb-1.5 block text-sm font-medium text-ink-700">
            {t("moveInDate")}
          </label>
          <input
            id="moveIn"
            type="date"
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="duration" className="mb-1.5 block text-sm font-medium text-ink-700">
            {t("duration")}
          </label>
          <input
            id="duration"
            type="number"
            min={1}
            max={60}
            value={durationMonths}
            onChange={(e) => setDurationMonths(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("message")}
        </label>
        <textarea
          id="message"
          required
          rows={5}
          maxLength={2000}
          value={introMessage}
          onChange={(e) => setIntroMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          className={`${inputClass} resize-y`}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4" aria-hidden />
        )}
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
