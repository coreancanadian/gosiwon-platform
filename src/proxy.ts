import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { isSupabaseConfigured } from "./lib/supabase/config";

const handleI18n = createIntlMiddleware(routing);

/**
 * Next.js 16 renamed the `middleware` convention to `proxy` (Node.js runtime).
 *
 * Two jobs here, in order:
 *   1. next-intl resolves the locale and may rewrite/redirect.
 *   2. Supabase refreshes the auth session, writing cookies onto whatever
 *      response step 1 produced.
 */
export async function proxy(request: NextRequest) {
  const response = handleI18n(request) ?? NextResponse.next();

  // Demo mode: no credentials, nothing to refresh. Locale routing still runs.
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Touching getUser() is what actually refreshes an expired token.
  // Without this the session silently dies on Server Components.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip Next internals, API routes, and anything with a file extension.
  matcher: ["/((?!api|_next|_vercel|images|.*\\..*).*)"],
};
