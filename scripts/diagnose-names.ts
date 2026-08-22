/** How many imported listings have an address in the business-name column. */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { looksLikeAddress } from "./place-match";

config({ path: ".env.local" });

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const rows: Array<{
    id: string;
    name_ko: string;
    address_ko: string;
    property_type: string;
    address_source: string;
    lat: number | null;
  }> = [];

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("properties")
      .select("id, name_ko, address_ko, property_type, address_source, lat")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  const bad = rows.filter((r) => looksLikeAddress(r.name_ko));

  console.log(`total listings                : ${rows.length}`);
  console.log(`name looks like an address    : ${bad.length}`);
  console.log(`  …of those, geocoded         : ${bad.filter((r) => r.lat != null).length}`);

  const byType = new Map<string, number>();
  bad.forEach((r) => byType.set(r.property_type, (byType.get(r.property_type) ?? 0) + 1));
  console.log(`  by type                     :`, Object.fromEntries(byType));

  console.log(`\nsamples:`);
  bad.slice(0, 8).forEach((r) =>
    console.log(
      `  ${r.name_ko.slice(0, 32).padEnd(32)} | ${r.address_ko.slice(0, 30).padEnd(30)} | ${r.property_type} | geo=${r.lat ? "y" : "n"}`,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
