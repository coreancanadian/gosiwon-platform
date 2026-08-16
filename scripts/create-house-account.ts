/**
 * Create the account that imported listings belong to until their real
 * operators claim them.
 *
 *   npx tsx scripts/create-house-account.ts --email you@example.com
 *
 * Uses the service-role key to create a confirmed user directly, skipping the
 * email round-trip, then promotes the profile to admin — which is what lets it
 * approve operator claims later.
 *
 * Idempotent: re-running finds the existing account instead of failing.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const EMAIL = flag("email");
const NAME = flag("name") ?? "Gosiwon Space";

async function main() {
  if (!EMAIL) {
    console.error("✗ --email <address> is required");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("✗ Supabase env vars missing");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Already there?
  const { data: existing } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const found = existing?.users.find(
    (u) => u.email?.toLowerCase() === EMAIL.toLowerCase(),
  );

  let userId: string;
  let password: string | null = null;

  if (found) {
    userId = found.id;
    console.log(`Account already exists: ${EMAIL}`);
  } else {
    password = randomBytes(18).toString("base64url");
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true, // no confirmation email needed
      user_metadata: { full_name: NAME, role: "owner" },
    });
    if (error || !data.user) {
      console.error(`✗ ${error?.message}`);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`Created account: ${EMAIL}`);
  }

  // The handle_new_user trigger seeds public.profiles; promote it to admin so
  // this account can approve operator claims.
  const { error: roleError } = await supabase
    .from("profiles")
    .update({ role: "admin", full_name: NAME })
    .eq("id", userId);

  if (roleError) {
    console.error(`✗ Could not set role: ${roleError.message}`);
    process.exit(1);
  }

  const { data: sub } = await supabase
    .from("host_subscriptions")
    .select("plan_code, price_krw")
    .eq("profile_id", userId)
    .maybeSingle();

  console.log(`  profile id : ${userId}`);
  console.log(`  role       : admin`);
  console.log(`  plan       : ${sub ? `${sub.plan_code} (${sub.price_krw} KRW)` : "none"}`);
  if (password) {
    console.log(`\n  Temporary password: ${password}`);
    console.log(`  Change it after your first login.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
