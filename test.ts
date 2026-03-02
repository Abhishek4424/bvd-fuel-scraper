// test.ts
//
// Test: scrape only, no email. Shows results grouped by province.
// Run: npm run test

import { scrapeBvdPrices } from "./scraper.js";

async function test() {
  console.log("🛢️  BVD Fuel Scraper — Test Run\n");

  const result = await scrapeBvdPrices();

  console.log("\n" + "=".repeat(70));
  console.log("RESULTS");
  console.log("=".repeat(70));
  console.log(`Success:     ${result.success}`);
  console.log(`Date:        ${result.date}`);
  console.log(`Provinces:   ${result.provinceCount}`);
  console.log(`Stations:    ${result.priceCount}`);

  // Group by province
  const byProvince = new Map<string, typeof result.prices>();
  for (const p of result.prices) {
    if (!byProvince.has(p.province)) byProvince.set(p.province, []);
    byProvince.get(p.province)!.push(p);
  }

  for (const [province, items] of byProvince) {
    console.log(`\n📍 ${province} (${items.length} stations)`);
    console.log("-".repeat(65));
    console.log(
      `  ${"Station".padEnd(28)} ${"City".padEnd(18)} ${"Price".padEnd(10)}`
    );
    console.log("  " + "-".repeat(60));
    for (const p of items.slice(0, 20)) {
      console.log(
        `  ${p.station.padEnd(28)} ${p.city.padEnd(18)} $${p.price}`
      );
    }
    if (items.length > 20) {
      console.log(`  ... and ${items.length - 20} more`);
    }
  }

  if (result.error) console.log(`\n❌ Error: ${result.error}`);
  if (result.priceCount === 0) {
    console.log("\n⚠ No prices found. Page text (first 1000 chars):");
    console.log(result.rawText.substring(0, 1000));
  }
}

test().catch(console.error);
