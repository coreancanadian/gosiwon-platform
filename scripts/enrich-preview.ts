/**
 * Dry-run the Kakao enrichment straight off the spreadsheets — no database needed.
 *
 *   npm run enrich:preview -- --sample 40
 *
 * Answers the only question that matters before a full run: on this data, how
 * often does "<district> <업체명>" find the right building, and how often does
 * it find something we correctly refuse?
 */
import { readdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import ExcelJS from "exceljs";
import { config as loadEnv } from "dotenv";
import {
  districtOf,
  looksLikeAddress,
  pickBest,
  type KakaoPlace,
} from "./place-match";

loadEnv({ path: ".env.local" });

const flag = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const DIR = flag("dir") ?? "./room files";
const SAMPLE = flag("sample") ? parseInt(flag("sample")!, 10) : 30;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

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

interface Row {
  name: string;
  location: string;
  file: string;
}

async function readRows(): Promise<Row[]> {
  const files = (await readdir(DIR)).filter((f) =>
    [".xlsx", ".xls"].includes(extname(f).toLowerCase()),
  );

  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(DIR, file));

    wb.eachSheet((sheet) => {
      let headerRow = 0;
      let headers: string[] = [];
      for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
        const vals = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
        if (vals.includes("업체명") && vals.includes("위치")) {
          headerRow = r;
          headers = vals;
          break;
        }
      }
      if (!headerRow) return;

      const idIdx = headers.indexOf("아이디");
      const nameIdx = headers.indexOf("업체명");
      const locIdx = headers.indexOf("위치");

      for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
        const v = (sheet.getRow(r).values as unknown[]).slice(1).map(cell);
        const id = v[idIdx];
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        if (v[nameIdx] && v[locIdx]) {
          rows.push({ name: v[nameIdx], location: v[locIdx], file: basename(file) });
        }
      }
    });
  }

  return rows;
}

/**
 * A 401/403 is a configuration problem, not a per-listing miss — retrying it
 * 2,000 times just wastes quota and buries the actual cause. Stop on the first.
 */
function abortOnAuthError(status: number, body: string): never | void {
  if (status !== 401 && status !== 403) return;

  console.error(`\n✗ Kakao rejected the request (HTTP ${status})`);
  console.error(`  ${body}\n`);

  if (body.includes("OPEN_MAP_AND_LOCAL")) {
    console.error(`  The key is valid, but this app has the Map/Local service turned off.`);
    console.error(`  Fix it at https://developers.kakao.com:`);
    console.error(`    내 애플리케이션 → (your app) → 제품 설정 → 카카오맵 → 활성화 설정 → ON`);
    console.error(`  Then re-run. No code change needed.`);
  } else {
    console.error(`  Check KAKAO_REST_API_KEY in .env.local is the REST API key`);
    console.error(`  (not the JavaScript or Admin key).`);
  }
  process.exit(1);
}

async function searchKeyword(query: string): Promise<KakaoPlace[]> {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query, size: "15" })}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    abortOnAuthError(res.status, body);
    console.error(`  ✗ HTTP ${res.status} ${res.statusText} — ${body}`);
    return [];
  }
  const data = (await res.json()) as { documents: KakaoPlace[] };
  return data.documents ?? [];
}

async function searchAddress(query: string): Promise<KakaoPlace[]> {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?${new URLSearchParams({ query, size: "5" })}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
  );
  if (!res.ok) {
    abortOnAuthError(res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as {
    documents: Array<{
      address_name: string;
      x: string;
      y: string;
      road_address: { address_name: string } | null;
    }>;
  };
  return (data.documents ?? []).map((d) => ({
    id: "",
    place_name: d.address_name,
    category_name: "",
    category_group_code: "",
    phone: "",
    address_name: d.address_name,
    road_address_name: d.road_address?.address_name ?? "",
    x: d.x,
    y: d.y,
    place_url: "",
  }));
}

async function main() {
  if (!KAKAO_KEY) {
    console.error("✗ KAKAO_REST_API_KEY is not set in .env.local");
    process.exit(1);
  }

  const all = await readRows();
  console.log(`${all.length} unique listings in ${DIR}`);

  // Even stride across the whole set rather than the first N, so the sample
  // spans all four files and every region.
  const stride = Math.max(1, Math.floor(all.length / SAMPLE));
  const sample = all.filter((_, i) => i % stride === 0).slice(0, SAMPLE);
  console.log(`Testing ${sample.length} (every ${stride}th)\n`);

  let resolved = 0;
  let withPhone = 0;
  let rejected = 0;
  let notFound = 0;

  for (const row of sample) {
    const district = districtOf(row.location);
    const isAddr = looksLikeAddress(row.name);
    const query = isAddr ? row.name : `${district} ${row.name}`.trim();

    let places = isAddr ? await searchAddress(row.name) : await searchKeyword(query);
    if (places.length === 0 && !isAddr) {
      await new Promise((r) => setTimeout(r, 130));
      places = await searchKeyword(row.name);
    }

    if (places.length === 0) {
      notFound++;
      console.log(`✗ NOT FOUND   ${row.name}  [${row.location}]`);
    } else {
      const best = pickBest(row.name, row.location, places);
      if (best) {
        resolved++;
        if (best.place.phone) withPhone++;
        const addr = best.place.road_address_name || best.place.address_name;
        console.log(
          `✓ ${best.verdict.score.toFixed(2)}  ${row.name}\n` +
            `           → ${addr}${best.place.phone ? `  ☎ ${best.place.phone}` : ""}`,
        );
      } else {
        rejected++;
        const top = places[0];
        console.log(
          `~ REJECTED    ${row.name}  [${district}]\n` +
            `           top hit: ${top.place_name} [${top.road_address_name || top.address_name}]`,
        );
      }
    }

    await new Promise((r) => setTimeout(r, 130));
  }

  const n = sample.length;
  const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
  console.log(`\n── Results on ${n} listings ──`);
  console.log(`  Resolved to a building : ${resolved}  (${pct(resolved)})`);
  console.log(`  …of which had a phone  : ${withPhone}  (${pct(withPhone)})`);
  console.log(`  Rejected (guard held)  : ${rejected}  (${pct(rejected)})`);
  console.log(`  No Kakao result        : ${notFound}  (${pct(notFound)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
