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
  // Group by province
  const byProvince = new Map<string, FuelPrice[]>();
  for (const p of result.prices) {
    const prov = p.province || "Other";
    if (!byProvince.has(prov)) byProvince.set(prov, []);
    byProvince.get(prov)!.push(p);
  }

  let tables = "";
  for (const [province, items] of byProvince) {
    tables += `
      <h3 style="color:#1a5276; margin:20px 0 6px; border-bottom:2px solid #2980b9; padding-bottom:4px;">
        📍 ${province} (${items.length} stations)
      </h3>
      <table style="border-collapse:collapse; width:100%; font-size:13px; margin-bottom:12px;">
        <tr style="background:#2c3e50; color:#fff;">
          <th style="padding:6px 10px; text-align:left;">Station</th>
          <th style="padding:6px 10px; text-align:left;">City</th>
          <th style="padding:6px 10px; text-align:right;">Price ($/L)</th>
        </tr>
        ${items
          .map(
            (p, i) => `
        <tr style="background:${i % 2 === 0 ? "#f8f9fa" : "#fff"};">
          <td style="padding:5px 10px; border-bottom:1px solid #eee;">${p.station}</td>
          <td style="padding:5px 10px; border-bottom:1px solid #eee;">${p.city}</td>
          <td style="padding:5px 10px; border-bottom:1px solid #eee; text-align:right; font-weight:bold;">$${p.price}</td>
        </tr>`
          )
          .join("")}
      </table>
    `;
  }

  return `
    <div style="font-family:Arial,sans-serif; max-width:900px; margin:0 auto;">
      <h2 style="color:#2c3e50;">🛢️ BVD Retail Diesel Prices — ${result.date}</h2>
      <p style="color:#555;">
        <strong>${result.priceCount}</strong> stations across
        <strong>${result.provinceCount}</strong> provinces
        &nbsp;|&nbsp; Scraped: ${result.scrapedAt}
        &nbsp;|&nbsp; Prices include GST/HST &nbsp;|&nbsp; $/litre
      </p>
      ${tables}
      <hr style="margin:24px 0; border:none; border-top:1px solid #ddd;">
      <p style="color:#999; font-size:11px;">
        CSV attached &bull; Source: bvdgroup.com &bull; RoaDo Fuel Price Monitor
      </p>
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
    subject: `🛢️ BVD Fuel Prices — ${result.date} (${result.priceCount} stations, ${result.provinceCount} provinces)`,
    text: result.prices
      .map((p) => `[${p.province}] ${p.station}, ${p.city}: $${p.price}/L`)
      .join("\n"),
    html: buildHtml(result),
    attachments: [{ filename, content: csv, contentType: "text/csv" }],
  });

  console.log(`[Mailer] ✓ Email sent to ${cfg.to.join(", ")}`);
}
