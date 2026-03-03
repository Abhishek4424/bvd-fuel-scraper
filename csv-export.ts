// csv-export.ts
//
// Scrapes BVD fuel prices and outputs CSV data to stdout or file
// Run: npm run csv

import { scrapeBvdPrices, type FuelPrice } from "./scraper.js";
import { writeFileSync } from "fs";

function pricesToCsv(prices: FuelPrice[]): string {
  if (prices.length === 0) return "No data available\n";

  // CSV headers
  const headers = ["province", "station", "city", "country", "price", "unit", "date", "effectiveDate"];
  const headerRow = headers.join(",");

  // CSV rows - escape quotes and wrap fields in quotes
  const dataRows = prices.map(price => {
    return headers.map(header => {
      const value = price[header as keyof FuelPrice] || "";
      // Escape quotes by doubling them and wrap in quotes
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

async function main() {
  console.error("🛢️ BVD Fuel Price Scraper - CSV Export\n");

  try {
    const result = await scrapeBvdPrices();
    
    if (!result.success) {
      console.error(`❌ Scraping failed: ${result.error || "No prices found"}`);
      process.exit(1);
    }

    console.error(`✅ Successfully scraped ${result.priceCount} prices from ${result.provinceCount} provinces`);
    
    // Generate CSV
    const csvData = pricesToCsv(result.prices);
    
    // Check if user wants to save to file or output to stdout
    const outputFile = process.argv[2];
    
    if (outputFile) {
      // Save to file
      writeFileSync(outputFile, csvData, "utf-8");
      console.error(`📄 CSV data saved to: ${outputFile}`);
    } else {
      // Output to stdout (can be piped)
      console.log(csvData);
    }

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();