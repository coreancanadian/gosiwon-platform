/**
 * Two clean-ups after the first full load.
 *
 *   npx tsx scripts/fix-data-defects.ts --dry-run
 *   npx tsx scripts/fix-data-defects.ts
 *
 * 1. property_subway rows written by the importer carry walk_minutes = null,
 *    because the source only names a station and gives no distance. The site
 *    then renders "도보 null분". link-subway skips properties that already have
 *    links, so those rows were never replaced — deleting them lets the linker
 *    pick those properties up on its next run.
 *
 * 2. Slugs fall back to the Korean name when a listing has no English name,
 *    producing percent-encoded URLs like /property/%EA%BC%AC%EB%AA%A8... .
 *    Romanising them keeps the URL shareable. Safe to change now; it would not
 *    be once the pages have inbound links.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { slugifyKorean } from "./romanize";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // ---- 1. drop station links that have no walking time ----
  const { count: nullLinks } = await sb
    .from("property_subway")
    .select("*", { count: "exact", head: true })
    .is("walk_minutes", null);

  console.log(`station links with no walking time : ${nullLinks}`);

  if (!DRY_RUN && (nullLinks ?? 0) > 0) {
    const { error } = await sb
      .from("property_subway")
      .delete()
      .is("walk_minutes", null);
    if (error) throw new Error(error.message);
    console.log(`  deleted — re-run link-subway to regenerate them with 도보 N분`);
  }

  // ---- 2. romanise Hangul slugs ----
  const rows: Array<{ id: string; slug: string; name_ko: string; name_en: string | null; external_id: string | null }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("properties")
      .select("id, slug, name_ko, name_en, external_id")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  const taken = new Set(rows.map((r) => r.slug));
  const needsRoman = rows.filter((r) => /[가-힣]/.test(r.slug));
  console.log(`\nslugs containing Hangul            : ${needsRoman.length}`);

  let reslugged = 0;
  for (const row of needsRoman) {
    const base =
      slugifyKorean(row.name_en || row.name_ko) || "listing";
    // external_id keeps it stable and unique across re-imports.
    let slug = row.external_id ? `${base}-${row.external_id}` : base;
    let n = 2;
    while (taken.has(slug) && slug !== row.slug) slug = `${base}-${n++}`;

    if (slug === row.slug) continue;

    if (reslugged < 6) console.log(`  ${row.slug}\n    -> ${slug}`);

    if (!DRY_RUN) {
      const { error } = await sb
        .from("properties")
        .update({ slug })
        .eq("id", row.id);
      if (error) {
        console.error(`  ✗ ${row.id}: ${error.message}`);
        continue;
      }
    }
    taken.delete(row.slug);
    taken.add(slug);
    reslugged++;
  }

  console.log(`\n── Summary ──`);
  console.log(`  station links removed : ${DRY_RUN ? 0 : (nullLinks ?? 0)}`);
  console.log(`  slugs romanised       : ${reslugged}`);
  if (DRY_RUN) console.log(`\n[dry run] Nothing written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
