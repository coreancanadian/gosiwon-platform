/**
 * Remove every listing that came from one source spreadsheet.
 *
 *   npx tsx scripts/remove-source-file.ts --file "원투룸.xlsx" --dry-run
 *   npx tsx scripts/remove-source-file.ts --file "원투룸.xlsx"
 *
 * 원투룸.xlsx carries no business name (its 업체명 column holds an address) and
 * no contact details, so a visitor has no way to actually reach anyone about
 * those rooms. They are removed rather than shown.
 *
 * Matching is by the source's 아이디, which is stored as properties.external_id,
 * so this removes exactly the rows that file produced and nothing else.
 * Child rows (amenities, subway links, images) go with them via ON DELETE
 * CASCADE.
 */
import { readdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (n: string) => process.argv.includes(`--${n}`);

const DIR = flag("dir") ?? "./room files";
const FILE = flag("file");
const DRY_RUN = has("dry-run");

const cell = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; richText?: Array<{ text: string }>; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if (o.result != null) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
};

async function idsInFile(path: string): Promise<Set<string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ids = new Set<string>();

  wb.eachSheet((sheet) => {
    let headerRow = 0;
    let headers: string[] = [];
    for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
      const v = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
      if (v.includes("업체명") && v.includes("위치")) {
        headerRow = r;
        headers = v;
        break;
      }
    }
    if (!headerRow) return;

    const idIdx = headers.indexOf("아이디");
    if (idIdx < 0) return;

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const v = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
      if (v[idIdx]) ids.add(v[idIdx]);
    }
  });

  return ids;
}

async function main() {
  if (!FILE) {
    console.error(`✗ --file <name> is required`);
    const files = (await readdir(DIR)).filter((f) =>
      [".xlsx", ".xls"].includes(extname(f).toLowerCase()),
    );
    console.error(`  available: ${files.join(", ")}`);
    process.exit(1);
  }

  const path = join(DIR, FILE);
  const ids = await idsInFile(path);
  console.log(`${basename(path)} contains ${ids.size} listing ids\n`);

  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Only ids that actually exist here — other files may share none of them.
  const idList = [...ids];
  const present: Array<{ id: string; external_id: string; name_ko: string }> = [];

  for (let i = 0; i < idList.length; i += 200) {
    const chunk = idList.slice(i, i + 200);
    const { data, error } = await sb
      .from("properties")
      .select("id, external_id, name_ko")
      .in("external_id", chunk);
    if (error) throw new Error(error.message);
    present.push(...((data ?? []) as typeof present));
  }

  console.log(`${present.length} of them are in the database`);
  console.log(`\nsamples to be removed:`);
  present.slice(0, 6).forEach((p) => console.log(`  ${p.external_id}  ${p.name_ko}`));

  const { count: before } = await sb
    .from("properties")
    .select("id", { count: "exact", head: true });
  console.log(`\nproperties before : ${before}`);
  console.log(`properties after  : ${(before ?? 0) - present.length}`);

  if (DRY_RUN) {
    console.log(`\n[dry run] Nothing deleted.`);
    return;
  }

  let deleted = 0;
  const ourIds = present.map((p) => p.id);
  for (let i = 0; i < ourIds.length; i += 200) {
    const chunk = ourIds.slice(i, i + 200);
    const { error } = await sb.from("properties").delete().in("id", chunk);
    if (error) throw new Error(error.message);
    deleted += chunk.length;
  }

  const { count: after } = await sb
    .from("properties")
    .select("id", { count: "exact", head: true });

  console.log(`\n✓ Removed ${deleted} listing(s)`);
  console.log(`  properties now: ${after}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
