import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { HostSubscription, Plan } from "@/lib/types/database";

export interface HostPlan {
  plan: Plan;
  subscription: HostSubscription;
}

/**
 * The signed-in host's plan.
 *
 * Note what this deliberately does NOT return: any notion of an expiry, a
 * remaining-days count, or a trial flag. There is no such column. A host is on
 * a plan at a price; today that price is zero. When paid plans arrive they are
 * new rows in `plans`, and existing hosts keep `price_krw` — which is why the
 * UI never has to warn anyone that anything is ending.
 */
export async function getHostPlan(): Promise<HostPlan | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: subscription } = await supabase
    .from("host_subscriptions")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!subscription) return null;

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("code", subscription.plan_code)
    .maybeSingle();

  if (!plan) return null;
  return { plan, subscription };
}

/**
 * Whether a host's plan includes a capability.
 *
 * Every gate in the app should route through here rather than checking a plan
 * code, so turning a feature into a paid one later is a change to the `plans`
 * row — no code edit, no migration.
 */
export function planAllows(plan: Plan | null, feature: string): boolean {
  if (!plan) return false;
  const value = plan.features?.[feature];
  // null means "unlimited", not "off" — absent means off.
  if (value === null) return true;
  return Boolean(value);
}

/** Numeric limit for a feature, or null for unlimited. */
export function planLimit(plan: Plan | null, feature: string): number | null {
  if (!plan) return 0;
  const value = plan.features?.[feature];
  if (value === null) return null;
  return typeof value === "number" ? value : null;
}
