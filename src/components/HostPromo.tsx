import { getCurrentProfile } from "@/lib/auth";
import { HostPromoInterstitial } from "./HostPromoInterstitial";

/**
 * The host-signup promo is aimed at people who aren't hosts yet, so it's
 * decided server-side and never rendered for someone already signed in as
 * an owner (or admin) — no flash of the popup before a client check hides it.
 * Signed-out visitors and tenants still see it.
 */
export async function HostPromo() {
  const profile = await getCurrentProfile();
  if (profile?.role === "owner" || profile?.role === "admin") return null;
  return <HostPromoInterstitial />;
}
