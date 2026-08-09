import { getTranslations, setRequestLocale } from "next-intl/server";
import { Star } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import {
  REVIEW_CRITERIA,
  type ReviewCriterion,
  type StayReview,
} from "@/lib/types/database";

const CRITERION_KEY: Record<ReviewCriterion, string> = {
  payment_timeliness: "payment",
  cleanliness: "cleanliness",
  quiet_hours: "quietHours",
  communication: "communication",
  rule_compliance: "ruleCompliance",
};

/**
 * A tenant's own reputation, always visible to them.
 *
 * This is the counterweight to letting hosts see it: you can never be judged
 * on a record you aren't allowed to read.
 */
export default async function MyRecordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tRep] = await Promise.all([
    getTranslations("Stay"),
    getTranslations("Reputation"),
  ]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          {tRep("myRecord")}
        </h1>
        <div className="mt-6">
          <DemoModeNotice />
        </div>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login?next=/my-record", locale });

  const supabase = await createClient();
  const { data } = await supabase
    .from("stay_reviews")
    .select("*")
    .eq("subject_id", user!.id)
    .eq("direction", "owner_on_tenant")
    .eq("is_visible", true)
    .order("created_at", { ascending: false });

  const reviews = (data ?? []) as StayReview[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {tRep("myRecord")}
      </h1>
      <p className="mt-2 text-sm text-ink-500">{tRep("myRecordHint")}</p>

      <div className="mt-8 space-y-4">
        {reviews.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-12 text-center text-sm text-ink-500">
            {t("noStays")}
          </p>
        ) : (
          reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-[var(--radius-card)] border border-ink-200 p-5"
            >
              <p className="text-xs text-ink-400">
                {new Date(review.created_at).toLocaleDateString()}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {REVIEW_CRITERIA.map((criterion) => {
                  const score = review[criterion];
                  if (score == null) return null;
                  return (
                    <div key={criterion} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-xs text-ink-500">
                        {tRep(CRITERION_KEY[criterion])}
                      </span>
                      <span className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-3.5 w-3.5 ${
                              n <= score
                                ? "fill-brand-500 text-brand-500"
                                : "text-ink-300"
                            }`}
                            aria-hidden
                          />
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>

              {review.comment ? (
                <p className="mt-3 text-sm whitespace-pre-line text-ink-600">
                  {review.comment}
                </p>
              ) : null}

              {review.subject_reply ? (
                <div className="mt-3 rounded-lg bg-ink-50 p-3">
                  <p className="text-sm text-ink-600">{review.subject_reply}</p>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
