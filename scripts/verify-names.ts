/**
 * Assert every listing's name is the exact 업체명 from its source spreadsheet.
 *
 *   npx tsx scripts/verify-names.ts
 *
 * Guards against a repeat of the descriptive-name substitution: the business
 * name shown on the site must be byte-for-byte what the operator's own listing
 * says, not something derived.
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
const DIR = flag("dir") ?? "./room files";
const SKIP_FILES = ["원투룸.xlsx"];
// macOS gives NFD filenames; source literals are NFC. Normalise both.
const isSkipped = (f: string) =>
  SKIP_FILES.some((s) => s.normalize("NFC") === f.normalize("NFC"));

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

async function main() {
  // Source of truth: 아이디 -> 업체명, from the spreadsheets.
  const sourceName = new Map<string, { name: string; file: string }>();

  const files = (await readdir(DIR))
    .filter((f) => [".xlsx", ".xls"].includes(extname(f).toLowerCase()))
    .filter((f) => !f.startsWith("~$") && !isSkipped(f));

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(DIR, file));

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
      const nameIdx = headers.indexOf("업체명");

      for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
        const v = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
        const id = v[idIdx];
        const name = v[nameIdx];
        if (id && name && !sourceName.has(id)) {
          sourceName.set(id, { name, file: basename(file) });
        }
      }
    });
  }

  console.log(`${sourceName.size} names read from ${files.length} source file(s)\n`);

  const sb: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const rows: Array<{ id: string; external_id: string | null; name_ko: string }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("properties")
      .select("id, external_id, name_ko")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  let matched = 0;
  let orphaned = 0;
  const mismatched: Array<{ id: string; db: string; source: string }> = [];

  for (const row of rows) {
    if (!row.external_id) {
      orphaned++;
      continue;
    }
    const src = sourceName.get(row.external_id);
    if (!src) {
      orphaned++;
      continue;
    }
    if (src.name === row.name_ko) matched++;
    else mismatched.push({ id: row.external_id, db: row.name_ko, source: src.name });
  }

  console.log(`listings in database   : ${rows.length}`);
  console.log(`name matches source    : ${matched}`);
  console.log(`name DIFFERS from source: ${mismatched.length}`);
  console.log(`no matching source row : ${orphaned}`);

  if (mismatched.length > 0) {
    console.log(`\n✗ names that do not match their source:`);
    mismatched.slice(0, 25).forEach((m) =>
      console.log(`    ${m.id}  db="${m.db}"   source="${m.source}"`),
    );
    if (mismatched.length > 25) console.log(`    …and ${mismatched.length - 25} more`);
    process.exit(1);
  }

  console.log(`\n✓ Every listing shows the exact 업체명 from its source file.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
