// mailer.ts
//
// Sends scraped fuel prices via SMTP with CSV attachment.
// Groups data by province. Uses nodemailer for robust MIME support.

import nodemailer from "nodemailer";
import type { ScrapeResult, FuelPrice } from "./scraper.js";

// ---------- Config ----------
function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user;
  const to = process.env.EMAIL_TO;

  if (!host || !user || !pass || !to) {
    throw new Error(
      "Missing SMTP env vars. Set: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_TO"
    );
  }
  return { host, port, user, pass, from: from!, to: to.split(",").map((e) => e.trim()) };
}

// ---------- CSV ----------
function pricesToCsv(prices: FuelPrice[]): string {
  if (prices.length === 0) return "No data\n";

  const keys: (keyof FuelPrice)[] = ["province", "station", "city", "country", "price", "unit", "date"];
  const header = keys.map((k) => `"${k}"`).join(",");
  const rows = prices.map((p) =>
    keys.map((k) => `"${(p[k] || "").replace(/"/g, '""')}"`).join(",")
  );
  return [header, ...rows].join("\n");
}

// ---------- HTML email body ----------
function buildHtml(result: ScrapeResult): string {
  // Group by province and calculate average prices
  const byProvince = new Map<string, FuelPrice[]>();
  for (const p of result.prices) {
    const prov = p.province || "Other";
    if (!byProvince.has(prov)) byProvince.set(prov, []);
    byProvince.get(prov)!.push(p);
  }

  // Build summary table
  let summaryRows = "";
  for (const [province, items] of byProvince) {
    const prices = items.map(p => parseFloat(p.price)).filter(p => !isNaN(p));
    const avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(3) : "0.000";
    const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(3) : "0.000";
    const maxPrice = prices.length > 0 ? Math.max(...prices).toFixed(3) : "0.000";
    
    summaryRows += `
      <tr style="border-bottom: 1px solid #e0e0e0;">
        <td style="padding: 8px 12px; font-weight: 500;">${province}</td>
        <td style="padding: 8px 12px; text-align: center;">${items.length}</td>
        <td style="padding: 8px 12px; text-align: center; font-weight: 600;">$${avgPrice}</td>
        <td style="padding: 8px 12px; text-align: center;">$${minPrice}</td>
        <td style="padding: 8px 12px; text-align: center;">$${maxPrice}</td>
      </tr>`;
  }

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Daily Fuel Price Report</h1>
        <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">BVD Petroleum Retail Diesel Prices</p>
      </div>

      <!-- Content -->
      <div style="padding: 24px;">
        <p style="font-size: 16px; color: #2c3e50; margin: 0 0 20px 0; line-height: 1.5;">
          Good morning,<br><br>
          Please find today's fuel price summary for <strong>${result.date}</strong>. 
          We've collected data from <strong>${result.priceCount}</strong> stations across 
          <strong>${result.provinceCount}</strong> Canadian provinces.
        </p>

        <!-- Summary Table -->
        <div style="margin: 24px 0;">
          <h3 style="color: #2c3e50; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">Province Summary</h3>
          <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 6px; overflow: hidden; border: 1px solid #e0e0e0;">
            <thead>
              <tr style="background: #34495e; color: white;">
                <th style="padding: 12px; text-align: left; font-weight: 600;">Province</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Stations</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Avg Price</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Min Price</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Max Price</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRows}
            </tbody>
          </table>
        </div>

        <!-- Data Notes -->
        <div style="background: #f8f9fa; padding: 16px; border-radius: 6px; border-left: 4px solid #3498db; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #555;">
            <strong>Data Notes:</strong> All prices are in Canadian dollars per litre and include applicable taxes (GST/HST). 
            Detailed station-by-station data is available in the attached CSV file.
          </p>
        </div>

        <!-- Footer -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 13px; color: #666;">
            <strong>Source:</strong> BVD Group (bvdgroup.com)<br>
            <strong>Generated:</strong> ${new Date(result.scrapedAt).toLocaleString()}<br>
            <strong>System:</strong> RoaDo Fuel Price Monitor
          </p>
        </div>
      </div>
    </div>
  `;
}

// ---------- Send ----------
export async function sendEmail(result: ScrapeResult) {
  const cfg = getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  if (!result.success) {
    await transporter.sendMail({
      from: cfg.from,
      to: cfg.to,
      subject: `⚠️ BVD Fuel Scrape FAILED — ${result.date}`,
      text: [
        `BVD Fuel Price scraping FAILED`,
        `Time: ${result.scrapedAt}`,
        `Error: ${result.error || "No prices extracted"}`,
        `Provinces found: ${result.provinceCount}`,
        ``,
        `Page text preview:`,
        (result.rawText || "").substring(0, 800),
        ``,
        `— RoaDo Fuel Price Monitor`,
      ].join("\n"),
    });
    console.log(`[Mailer] ⚠ Alert sent to ${cfg.to.join(", ")}`);
    return;
  }

  const csv = pricesToCsv(result.prices);
  const filename = `bvd_fuel_prices_${result.date}.csv`;

  await transporter.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: `Daily Fuel Price Report - ${result.date}`,
    text: [
      `Daily Fuel Price Report - ${result.date}`,
      ``,
      `Good morning,`,
      ``,
      `Please find today's fuel price summary for ${result.date}.`,
      `We've collected data from ${result.priceCount} stations across ${result.provinceCount} Canadian provinces.`,
      ``,
      `Detailed station-by-station data is available in the attached CSV file.`,
      ``,
      `Best regards,`,
      `RoaDo Fuel Price Monitor`,
      ``,
      `Data Source: BVD Group (bvdgroup.com)`,
      `Generated: ${new Date(result.scrapedAt).toLocaleString()}`,
    ].join("\n"),
    html: buildHtml(result),
    attachments: [{ filename, content: csv, contentType: "text/csv" }],
  });

  console.log(`[Mailer] ✓ Email sent to ${cfg.to.join(", ")}`);
}
