/**
 * Diagnostic: dump every sheet's headers and a couple of sample rows.
 * Used to build the alias map in column-map.ts against real files.
 *
 *   npx tsx scripts/inspect-excel.ts "<dir>"
 */
import { readdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import ExcelJS from "exceljs";

const DIR = process.argv[2] ?? "./data";

const cell = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof o.text === "string") return o.text;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result != null) return String(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return JSON.stringify(v).slice(0, 40);
  }
  return String(v);
};

async function main() {
  const files = (await readdir(DIR))
    .filter((f) => [".xlsx", ".xls", ".csv"].includes(extname(f).toLowerCase()))
    .filter((f) => !f.startsWith("~$"));

  for (const file of files) {
    const path = join(DIR, file);
    const wb = new ExcelJS.Workbook();
    if (extname(path).toLowerCase() === ".csv") await wb.csv.readFile(path);
    else await wb.xlsx.readFile(path);

    console.log(`\n${"=".repeat(78)}\n${basename(path)}`);

    wb.eachSheet((sheet) => {
      console.log(
        `\n  ── sheet "${sheet.name}"  (${sheet.rowCount} rows, ${sheet.columnCount} cols)`,
      );

      for (let r = 1; r <= Math.min(sheet.rowCount, 3); r++) {
        const values = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
        const nonEmpty = values.filter((v) => v.trim()).length;
        console.log(`  ROW ${r} (${nonEmpty} filled):`);
        values.forEach((v, i) => {
          if (v.trim()) console.log(`      [${i}] ${v.slice(0, 90)}`);
        });
      }
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
