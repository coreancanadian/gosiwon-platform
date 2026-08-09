"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, DoorOpen, Loader2, Star } from "lucide-react";
import {
  completeStay,
  recordMoveIn,
  submitReview,
} from "@/lib/actions/stays";
import { REVIEW_CRITERIA, type ReviewCriterion } from "@/lib/types/database";
import type { InquiryThread } from "@/lib/data/inquiries";

const CRITERION_KEY: Record<ReviewCriterion, string> = {
  payment_timeliness: "payment",
  cleanliness: "cleanliness",
  quiet_hours: "quietHours",
  communication: "communication",
  rule_compliance: "ruleCompliance",
};

const today = () => new Date().toISOString().slice(0, 10);

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-sm text-ink-600">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label} ${n}`}
            className="rounded p-0.5 transition hover:scale-110"
          >
            <Star
              className={`h-5 w-5 ${
                value != null && n <= value
                  ? "fill-brand-500 text-brand-500"
                  : "text-ink-300"
              }`}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The tenancy lifecycle, shown inside the inquiry thread both parties already
 * use: host confirms move-in, host closes the stay, then each side reviews.
 *
 * Reviews stay hidden until both are in, so neither party can see what the
 * other wrote before writing their own.
 */
export function StayPanel({ thread }: { thread: InquiryThread }) {
  const t = useTranslations("Stay");
  const tRep = useTranslations("Reputation");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [moveInDate, setMoveInDate] = useState(today());
  const [moveOutDate, setMoveOutDate] = useState(today());
  const [scores, setScores] = useState<Record<ReviewCriterion, number | null>>({
    payment_timeliness: null,
    cleanliness: null,
    quiet_hours: null,
    communication: null,
    rule_compliance: null,
  });
  const [comment, setComment] = useState("");

  const { stay, myReview, viewerIsOwner } = thread;

  // Only meaningful once the host has accepted the applicant.
  if (thread.status !== "accepted") return null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const inputClass =
    "rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  // ---- No stay yet: only the host can open one ----
  if (!stay) {
    if (!viewerIsOwner) return null;
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink-900">
          <CalendarCheck className="h-4 w-4 text-brand-500" aria-hidden />
          {t("title")}
        </h3>
        <p className="mt-1 text-sm text-ink-500">{t("recordHint")}</p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-ink-700">
              {t("moveInDate")}
            </span>
            <input
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => recordMoveIn(thread.id, moveInDate))}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("recordMoveIn")}
          </button>
        </div>

        {error ? <p className="mt-2 text-sm text-brand-600">{error}</p> : null}
      </div>
    );
  }

  // ---- Stay active: host can close it ----
  if (stay.status === "active") {
    return (
      <div className="rounded-[var(--radius-card)] border border-emerald-300 bg-emerald-50 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <DoorOpen className="h-4 w-4 text-emerald-700" aria-hidden />
          {t("active")}
        </p>
        <p className="mt-0.5 text-sm text-ink-600">
          {t("since", { date: stay.moved_in_at })}
        </p>

        {viewerIsOwner ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-ink-700">
                {t("moveOutDate")}
              </span>
              <input
                type="date"
                value={moveOutDate}
                min={stay.moved_in_at}
                onChange={(e) => setMoveOutDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => completeStay(stay.id, moveOutDate))}
              className="rounded-xl border border-ink-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-800 transition hover:bg-ink-50 disabled:opacity-60"
            >
              {t("completeStay")}
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-sm text-brand-600">{error}</p> : null}
      </div>
    );
  }

  // ---- Stay complete: review window ----
  if (myReview) {
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-800">
          <Check className="h-4 w-4 text-emerald-600" aria-hidden />
          {t("reviewDone")}
        </p>
        {!myReview.is_visible ? (
          <p className="mt-1 text-sm text-ink-500">{t("reviewPending")}</p>
        ) : null}
      </div>
    );
  }

  const direction = viewerIsOwner ? "owner_on_tenant" : "tenant_on_owner";

  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 p-5">
      <h3 className="text-base font-semibold text-ink-900">{t("reviewPrompt")}</h3>
      <p className="mt-1 text-sm text-ink-500">
        {t("period", { from: stay.moved_in_at, to: stay.moved_out_at ?? "" })}
      </p>
      <p className="mt-2 text-sm text-ink-500">{tRep("reviewSubtitle")}</p>

      <div className="mt-4 space-y-2.5">
        {REVIEW_CRITERIA.map((criterion) => (
          <StarRow
            key={criterion}
            label={tRep(CRITERION_KEY[criterion])}
            value={scores[criterion]}
            onChange={(v) => setScores((s) => ({ ...s, [criterion]: v }))}
          />
        ))}
      </div>

      <textarea
        rows={3}
        maxLength={600}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="mt-4 w-full resize-y rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />

      {error ? <p className="mt-2 text-sm text-brand-600">{error}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() =>
            submitReview({
              stayId: stay.id,
              direction,
              ...scores,
              comment: comment.trim() || null,
            }),
          )
        }
        className="mt-4 flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {tCommon("save")}
      </button>
    </div>
  );
}
