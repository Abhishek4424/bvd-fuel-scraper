// index.ts
//
// Entry point: scrape all provinces → email CSV, with retry logic.

import { scrapeBvdPrices, type ScrapeResult } from "./scraper.js";
import { sendEmail } from "./mailer.js";

async function scrapeWithRetry(maxAttempts = 3, baseDelay = 30_000): Promise<ScrapeResult> {
  let lastResult: ScrapeResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n========== Attempt ${attempt}/${maxAttempts} ==========`);

    const result = await scrapeBvdPrices();
    lastResult = result;

    if (result.success) {
      console.log(`✓ Success: ${result.priceCount} prices from ${result.provinceCount} provinces`);
      return result;
    }

    console.log(`✗ Failed: ${result.error || "No prices found"}`);

    if (attempt < maxAttempts) {
      const wait = baseDelay * attempt;
      console.log(`Retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  console.log(`All ${maxAttempts} attempts failed.`);
  return lastResult!;
}

async function run() {
  console.log(`[BVD Scraper] Started at ${new Date().toISOString()}\n`);

  const result = await scrapeWithRetry(3, 30_000);
  await sendEmail(result);

  console.log(`\n[BVD Scraper] Finished at ${new Date().toISOString()}`);

  if (!result.success) process.exit(1);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
