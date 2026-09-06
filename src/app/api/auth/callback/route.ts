import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-confirmation landing. Supabase redirects here with a one-time `code`
 * which we exchange for a session cookie.
 *
 * Lives under /api so the i18n proxy's matcher skips it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const dest = new URL(next, origin);
  dest.searchParams.set("verified", "1");
  return NextResponse.redirect(dest);
}
