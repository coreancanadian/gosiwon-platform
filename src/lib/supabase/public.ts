import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Anonymous, cookie-free Supabase client for public data.
 *
 * Reads exactly what a signed-out visitor could, so its results are the same
 * for everyone and safe to share through Next's data cache — which a
 * cookie-bound client (lib/supabase/server) can't be used inside.
 */
export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
