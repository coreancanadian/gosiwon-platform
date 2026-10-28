import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AdminPlatformStats } from "@/lib/types/database";

/**
 * Operator dashboard numbers. Null when the call fails, which in practice
 * means migration 0012 hasn't been run yet (or the caller isn't an admin);
 * the page shows a setup note instead of crashing.
 */
export async function getAdminPlatformStats(): Promise<AdminPlatformStats | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error || !data) return null;
  return data as AdminPlatformStats;
}
