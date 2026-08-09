/**
 * Safe on both server and client — no "server-only" import, so the proxy,
 * Server Components, and Client Components can all ask the same question.
 *
 * With no credentials the app runs in demo mode: seed fixtures render the full
 * UI and every auth-gated path degrades to signed-out. Add the two env vars to
 * switch the whole app onto the real database.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
