/** Distinct-value profile across all sheets, to drive the mapping decisions. */
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import ExcelJS from "exceljs";

const DIR = process.argv[2] ?? "./data";

const cell = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof o.text === "string") return o.text;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v).trim();
};

const counts: Record<string, Map<string, number>> = {
  주거형태: new Map(),
  남녀구분: new Map(),
  구: new Map(),
  "층 정보": new Map(),
  주차: new Map(),
  엘리베이터: new Map(),
  난방시설: new Map(),
};
const amenityTokens = new Map<string, number>();
const AMENITY_COLS = ["세탁시설", "청결시설", "주방시설", "생활시설", "안전시설", "제공 비품"];
const ids = new Set<string>();
let rows = 0;
let withStation = 0;
let withUniv = 0;

const bump = (m: Map<string, number>, k: string) =>
  m.set(k, (m.get(k) ?? 0) + 1);

async function main() {
  const files = (await readdir(DIR)).filter((f) =>
    [".xlsx", ".xls"].includes(extname(f).toLowerCase()),
  );

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(DIR, file));

    wb.eachSheet((sheet) => {
      // Find the header row (the one containing 업체명).
      let headerRow = 0;
      for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
        const vals = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
        if (vals.includes("업체명")) {
          headerRow = r;
          break;
        }
      }
      if (!headerRow) return;

      const headers = (sheet.getRow(headerRow).values as unknown[]).slice(1).map(cell);
      const idx = (name: string) => headers.indexOf(name);

      for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
        const v = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
        if (!v.some((x) => x)) continue;

        const id = v[idx("아이디")];
        if (id) {
          if (ids.has(id)) continue; // same listing across sheets/files
          ids.add(id);
        }
        rows++;

        for (const key of Object.keys(counts)) {
          if (key === "구") continue;
          const i = idx(key);
          if (i >= 0 && v[i]) bump(counts[key], v[i]);
        }

        const loc = v[idx("위치")];
        if (loc) {
          const gu = loc.split(/\s+/).slice(0, 2).join(" ");
          bump(counts["구"], gu);
        }

        if (v[idx("근처 지하철")]) withStation++;
        if (v[idx("근처 대학교")]) withUniv++;

        for (const col of AMENITY_COLS) {
          const i = idx(col);
          if (i >= 0 && v[i]) {
            v[i].split(/\s+/).filter(Boolean).forEach((tok) => bump(amenityTokens, tok));
          }
        }
      }
    });
  }

  console.log(`Unique listings (deduped by 아이디): ${rows}`);
  console.log(`  with 근처 지하철: ${withStation}`);
  console.log(`  with 근처 대학교: ${withUniv}\n`);

  for (const [key, map] of Object.entries(counts)) {
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`── ${key} (${map.size} distinct)`);
    top.slice(0, key === "구" ? 40 : 14).forEach(([k, n]) =>
      console.log(`   ${String(n).padStart(5)}  ${k.slice(0, 60)}`),
    );
    console.log();
  }

  console.log(`── amenity tokens (${amenityTokens.size} distinct)`);
  [...amenityTokens.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`   ${String(n).padStart(5)}  ${k}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
