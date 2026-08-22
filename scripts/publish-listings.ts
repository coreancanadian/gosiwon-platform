/**
 * Publish or unpublish listings in bulk.
 *
 *   npx tsx scripts/publish-listings.ts --dry-run
 *   npx tsx scripts/publish-listings.ts
 *   npx tsx scripts/publish-listings.ts --unpublish     # reverse it
 *
 * Flags:
 *   --dry-run       Report what would change; write nothing
 *   --unpublish     Set is_published = false instead
 *   --geocoded-only Only listings that have coordinates
 *
 * Publishing is the one action here that is visible to the public, so it is a
 * deliberate command with an exact inverse rather than a side effect of import.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const has = (n: string) => process.argv.includes(`--${n}`);
const DRY_RUN = has("dry-run");
const UNPUBLISH = has("unpublish");
const GEOCODED_ONLY = has("geocoded-only");

const TARGET = !UNPUBLISH;

async function main() {
  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const base = () => sb.from("properties").select("id", { count: "exact", head: true });
  const { count: total } = await base();
  const { count: alreadyPublished } = await base().eq("is_published", true);
  const { count: geocoded } = await base().not("lat", "is", null);

  console.log(`total listings      : ${total}`);
  console.log(`currently published : ${alreadyPublished}`);
  console.log(`with coordinates    : ${geocoded}`);
  console.log(`\naction: set is_published = ${TARGET}${GEOCODED_ONLY ? " (geocoded only)" : " (all)"}`);

  // Publishing everything means listings without coordinates go live too; they
  // render fine but their map panel has no pin.
  const noGeo = (total ?? 0) - (geocoded ?? 0);
  if (TARGET && !GEOCODED_ONLY && noGeo > 0) {
    console.log(
      `\n  note: ${noGeo} listing(s) have no coordinates yet — they will be\n` +
        `        visible and searchable, but show no map pin.`,
    );
  }

  if (DRY_RUN) {
    console.log(`\n[dry run] Nothing written.`);
    return;
  }

  // Page through ids rather than issuing one unbounded update.
  const ids: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from("properties")
      .select("id")
      .eq("is_published", !TARGET)
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (GEOCODED_ONLY) q = q.not("lat", "is", null);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    ids.push(...data.map((r) => r.id));
    if (data.length < PAGE) break;
  }

  let changed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error } = await sb
      .from("properties")
      .update({ is_published: TARGET, updated_at: new Date().toISOString() })
      .in("id", chunk);
    if (error) throw new Error(error.message);
    changed += chunk.length;
    console.log(`  …${changed}/${ids.length}`);
  }

  const { count: nowPublished } = await base().eq("is_published", true);

  console.log(`\n✓ ${TARGET ? "Published" : "Unpublished"} ${changed} listing(s)`);
  console.log(`  published now: ${nowPublished} / ${total}`);
  if (TARGET) {
    console.log(`  reverse with: npx tsx scripts/publish-listings.ts --unpublish`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
