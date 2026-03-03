// scraper.ts
//
// BVD Petroleum Fuel Price Scraper
//
// Confirmed page structure:
//   div.rp-toggle-title     → Province name (accordion header, click to expand)
//     span.rp-toggle-icon   → +/- icon
//   div.rp-toggle-content   → Hidden panel (next sibling, expands on click)
//     table
//       tr
//         td[0] → Station name  (e.g. "BRANDON-18TH ST")
//         td[1] → City          (e.g. "BRANDON")
//         td[2] → Country       (e.g. "Canada")
//         td.rp-cad-price → Price in $/litre (e.g. "1.979")

import { chromium, type Browser, type Page } from "playwright";

// ---------- Types ----------
export interface FuelPrice {
  province: string;
  station: string;
  city: string;
  country: string;
  price: string;
  unit: string;
  date: string;
  effectiveDate: string;
}

export interface ScrapeResult {
  success: boolean;
  date: string;
  effectiveDate: string;
  scrapedAt: string;
  priceCount: number;
  provinceCount: number;
  prices: FuelPrice[];
  rawText: string;
  error?: string;
}

// ---------- Config ----------
const TARGET_URL = "https://bvdgroup.com/petroleum/prices/";
const PAGE_TIMEOUT = 60_000;

// ---------- Main ----------
export async function scrapeBvdPrices(
  url: string = TARGET_URL
): Promise<ScrapeResult> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--ignore-certificate-errors",
      ],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
      // Force fresh page loads, disable cache
      extraHTTPHeaders: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    const page = await context.newPage();

    // Add cache-busting parameter to ensure fresh data
    const cacheBustUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
    console.log(`[Scraper] Navigating to ${cacheBustUrl}`);
    await page.goto(cacheBustUrl, {
      waitUntil: "networkidle",
      timeout: PAGE_TIMEOUT,
    });

    // Wait for WordPress + toggle plugin to initialize
    await page.waitForTimeout(4000);

    // Wait for the toggle elements to be present
    await page.waitForSelector(".rp-toggle-title", { timeout: 15000 });

    const rawText = await page.evaluate(() => document.body?.innerText || "");
    console.log(`[Scraper] Page loaded. Text length: ${rawText.length}`);

    // ---------- Extract effective date ----------
    const effectiveDate = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      // Look for pattern: "Prices effective as of YYYY-MM-DD"
      const match = text.match(/Prices effective as of (\d{4}-\d{2}-\d{2})/i);
      return match ? match[1] : "";
    });

    console.log(`[Scraper] Effective date: ${effectiveDate || "Not found"}`);

    // ---------- Get all province toggle headers ----------
    const provinceCount = await page.locator(".rp-toggle-title").count();
    console.log(`[Scraper] Found ${provinceCount} province toggles`);

    const allPrices: FuelPrice[] = [];
    const todayStr = new Date().toISOString().split("T")[0];

    // ---------- Click each province and extract prices ----------
    for (let i = 0; i < provinceCount; i++) {
      const toggle = page.locator(".rp-toggle-title").nth(i);

      // Get province name (strip the +/- icon text)
      const provinceName = await toggle.evaluate((el) => {
        // Get text content excluding the icon span
        const clone = el.cloneNode(true) as HTMLElement;
        const icon = clone.querySelector(".rp-toggle-icon");
        if (icon) icon.remove();
        return clone.textContent?.trim() || "";
      });

      console.log(`\n[Scraper] → ${provinceName} (toggle ${i + 1}/${provinceCount})`);

      // Click to expand
      try {
        await toggle.click({ timeout: 5000 });
      } catch (err) {
        console.log(`  ⚠ Click failed, trying JS click...`);
        await toggle.evaluate((el) => (el as HTMLElement).click());
      }

      // Wait for content to expand
      await page.waitForTimeout(1500);

      // Get the sibling content panel
      // The .rp-toggle-content should be the next sibling of .rp-toggle-title
      const contentPanel = toggle.locator("~ .rp-toggle-content").first;

      // Alternative: if they share a parent, get it by index
      // Try to check if the panel is visible / has content
      let panelVisible = false;
      try {
        panelVisible = await contentPanel.isVisible({ timeout: 3000 });
      } catch {
        // Sibling selector may not work — try alternative approach
      }

      let prices: FuelPrice[] = [];

      if (panelVisible) {
        // Extract from the sibling content panel
        prices = await contentPanel.evaluate((panel, args) => {
          const { prov, date } = args;
          const results: FuelPrice[] = [];
          panel.querySelectorAll("tr").forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 2) return;

            // Find the price cell (has class rp-cad-price)
            const priceCell = tr.querySelector(".rp-cad-price");
            const price = priceCell?.textContent?.trim() || "";

            // Get other cells
            const cells = Array.from(tds).map((td) => td.textContent?.trim() || "");

            // Filter out the price cell from the regular cells
            const nonPriceCells = Array.from(tds)
              .filter((td) => !td.classList.contains("rp-cad-price"))
              .map((td) => td.textContent?.trim() || "");

            if (price) {
              results.push({
                province: prov,
                station: nonPriceCells[0] || "",
                city: nonPriceCells[1] || "",
                country: nonPriceCells[2] || "",
                price,
                unit: "$/litre",
                date,
                effectiveDate: args.effectiveDate,
              } as FuelPrice);
            }
          });
          return results;
        }, { prov: provinceName, date: todayStr, effectiveDate });
      }

      // Fallback: if sibling selector didn't work, try getting all visible
      // rp-toggle-content panels and match by index
      if (prices.length === 0) {
        console.log(`  Trying fallback extraction...`);

        prices = await page.evaluate((args) => {
          const { index, prov, date } = args;
          const results: FuelPrice[] = [];

          // Get all content panels
          const panels = document.querySelectorAll(".rp-toggle-content");
          const panel = panels[index];
          if (!panel) return results;

          // Check if it's visible (expanded)
          const style = window.getComputedStyle(panel);
          if (style.display === "none") return results;

          panel.querySelectorAll("tr").forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 2) return;

            const priceCell = tr.querySelector(".rp-cad-price");
            const price = priceCell?.textContent?.trim() || "";

            const nonPriceCells = Array.from(tds)
              .filter((td) => !td.classList.contains("rp-cad-price"))
              .map((td) => td.textContent?.trim() || "");

            if (price) {
              results.push({
                province: prov,
                station: nonPriceCells[0] || "",
                city: nonPriceCells[1] || "",
                country: nonPriceCells[2] || "",
                price,
                unit: "$/litre",
                date,
                effectiveDate: args.effectiveDate,
              } as FuelPrice);
            }
          });

          return results;
        }, { index: i, prov: provinceName, date: todayStr, effectiveDate });
      }

      // Second fallback: try getting the content from the parent wrapper
      if (prices.length === 0) {
        console.log(`  Trying parent-wrapper extraction...`);

        prices = await page.evaluate((args) => {
          const { index, prov, date } = args;
          const results: FuelPrice[] = [];

          // Some toggle plugins wrap title + content in a parent div
          const titles = document.querySelectorAll(".rp-toggle-title");
          const title = titles[index];
          if (!title) return results;

          // Check parent for content
          const parent = title.parentElement;
          if (!parent) return results;

          const contentDiv =
            parent.querySelector(".rp-toggle-content") ||
            title.nextElementSibling;

          if (!contentDiv) return results;

          contentDiv.querySelectorAll("tr").forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 2) return;

            const priceCell = tr.querySelector(".rp-cad-price");
            const price = priceCell?.textContent?.trim() || "";

            const nonPriceCells = Array.from(tds)
              .filter((td) => !td.classList.contains("rp-cad-price"))
              .map((td) => td.textContent?.trim() || "");

            if (price) {
              results.push({
                province: prov,
                station: nonPriceCells[0] || "",
                city: nonPriceCells[1] || "",
                country: nonPriceCells[2] || "",
                price,
                unit: "$/litre",
                date,
                effectiveDate: args.effectiveDate,
              } as FuelPrice);
            }
          });

          return results;
        }, { index: i, prov: provinceName, date: todayStr, effectiveDate });
      }

      console.log(`  ✓ ${prices.length} stations`);
      allPrices.push(...prices);

      // Close the accordion before opening next (click again to collapse)
      try {
        await toggle.click({ timeout: 3000 });
        await page.waitForTimeout(500);
      } catch {
        // Some accordions auto-close when next one opens — fine to skip
      }
    }

    await browser.close();
    browser = null;

    // Deduplicate
    const seen = new Set<string>();
    const deduped = allPrices.filter((p) => {
      const key = `${p.province}|${p.station}|${p.city}|${p.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const provincesWithData = new Set(deduped.map((p) => p.province)).size;

    console.log(
      `\n[Scraper] DONE: ${deduped.length} prices across ${provincesWithData} provinces`
    );

    return {
      success: deduped.length > 0,
      date: todayStr,
      effectiveDate: effectiveDate || todayStr,
      scrapedAt: new Date().toISOString(),
      priceCount: deduped.length,
      provinceCount: provincesWithData,
      prices: deduped,
      rawText: rawText.substring(0, 5000),
    };
  } catch (err: unknown) {
    if (browser) await browser.close();
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Scraper] FAILED: ${errorMsg}`);

    return {
      success: false,
      date: new Date().toISOString().split("T")[0],
      effectiveDate: "",
      scrapedAt: new Date().toISOString(),
      priceCount: 0,
      provinceCount: 0,
      prices: [],
      rawText: "",
      error: errorMsg,
    };
  }
}
