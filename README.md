# 🛢️ BVD Fuel Price Scraper

Daily scraper for [BVD Petroleum](https://bvdgroup.com/bvddev/petroleum/prices/) retail diesel prices across all Canadian provinces. Runs free on GitHub Actions.

## How It Works

```
BVD Prices Page
├── Alberta          (rp-toggle accordion)
│   ├── CALGARY-HWY2    | Calgary   | $1.849/L
│   └── ...
├── British Columbia
├── Manitoba
│   ├── BRANDON-18TH ST | Brandon   | $1.979/L
│   └── WINNIPEG-HWY1   | Winnipeg  | $1.959/L
├── Ontario
│   ├── BRAMPTON         | Brampton  | $1.899/L
│   └── ...
└── ... (11 provinces/territories)

Scraper clicks each province accordion → extracts table rows → CSV + email
```

---

## Quick Start — Run Locally

### Step 1: Install

```bash
git clone https://github.com/YOUR_USER/bvd-fuel-scraper.git
cd bvd-fuel-scraper

# Install Node dependencies
npm install

# Install Playwright's Chromium browser
npx playwright install chromium --with-deps
```

### Step 2: Test the scraper (no email)

```bash
npm run test
```

This will:
- Launch headless Chromium
- Open the BVD prices page
- Click each province accordion
- Extract station, city, price data
- Print results grouped by province

**Expected output:**
```
📍 Ontario (15 stations)
-----------------------------------------------------------------
  Station                      City               Price
  BRAMPTON-HWY10               Brampton           $1.899
  MISSISSAUGA-DIXIE             Mississauga        $1.919
  ...

📍 Alberta (8 stations)
  ...
```

### Step 3: Run with email (full pipeline)

```bash
# Create your .env file
cp .env.example .env
```

Edit `.env` with your SMTP credentials:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop    # Gmail App Password
EMAIL_FROM=your-email@gmail.com
EMAIL_TO=narayan@roado.com
```

Then run:

```bash
npm run scrape
```

This will scrape + send email with CSV attachment.

### Gmail App Password Setup

If using Gmail as SMTP:
1. Go to https://myaccount.google.com → Security → 2-Step Verification (enable it)
2. Go to https://myaccount.google.com/apppasswords
3. Create an App Password for "Mail"
4. Use the 16-character password as `SMTP_PASS`

---

## Deploy on GitHub Actions (Free, Daily CRON at 9 AM EST)

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "BVD fuel price scraper with email automation"
git remote add origin https://github.com/YOUR_USERNAME/bvd-fuel-scraper.git
git push -u origin main
```

### Step 2: Set up Gmail App Password (if using Gmail)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate an App Password for "Mail"
5. Copy the 16-character password (use this as `SMTP_PASS`)

### Step 3: Add GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 6 secrets:

| Secret Name  | Example Value            | Description |
|-------------|-------------------------|-------------|
| `SMTP_HOST` | `smtp.gmail.com`        | SMTP server |
| `SMTP_PORT` | `587`                   | SMTP port |
| `SMTP_USER` | `your-email@gmail.com`  | Email username |
| `SMTP_PASS` | `abcd efgh ijkl mnop`   | Gmail App Password (16 chars) |
| `EMAIL_FROM`| `your-email@gmail.com`  | Sender email |
| `EMAIL_TO`  | `recipient@example.com` | Recipient(s) - comma separated |

### Step 4: Test the automation

1. Go to **Actions** tab
2. Click **BVD Fuel Price Scraper**
3. Click **Run workflow** → **Run workflow**
4. Wait for completion (2-3 minutes)
5. Check your email for the fuel prices report

### Step 5: Automatic daily schedule

✅ **Already configured** — runs automatically every day at **9:00 AM Eastern Time**

**Schedule details:**
- **Standard Time (EST):** 9 AM EST = 2 PM UTC
- **Daylight Time (EDT):** Uncomment the EDT line in workflow file

To change the schedule, edit `.github/workflows/scrape-fuel-prices.yml`:

```yaml
schedule:
  - cron: "0 14 * * *"    # 9 AM EST (2 PM UTC)
  # - cron: "0 13 * * *"  # 9 AM EDT (1 PM UTC) - uncomment for daylight time
  # - cron: "0 14 * * 1-5"  # Weekdays only
  # - cron: "0 */6 * * *"   # Every 6 hours
```

---

## NPM Commands

| Command                | What it does                              |
|-----------------------|-------------------------------------------|
| `npm run test`        | Scrape only, print results (no email)     |
| `npm run scrape`      | Scrape + send email with CSV attachment   |
| `npm run csv`         | Scrape and output CSV to stdout           |
| `npm run csv file.csv`| Scrape and save CSV to specified file     |
| `npm install`         | Install dependencies                      |

---

## Project Structure

```
bvd-fuel-scraper/
├── .github/workflows/
│   └── scrape-fuel-prices.yml   ← GitHub Actions daily cron
├── src/
│   ├── scraper.ts               ← Playwright scraper (clicks rp-toggle accordions)
│   ├── mailer.ts                ← Nodemailer: HTML email + CSV attachment
│   ├── index.ts                 ← Entry point (3x retry + orchestration)
│   └── test.ts                  ← Quick test (no email)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm run test` shows 0 prices | Page structure changed — inspect `.rp-toggle-title` and `.rp-cad-price` classes |
| All prices from 1 province only | Accordion not collapsing between clicks — toggle logic needs adjustment |
| Gmail "auth failed" | Use App Password, not regular password. Enable 2FA first. |
| GitHub Action not running | Push a commit — GitHub disables crons after 60 days of inactivity |
| Playwright install fails | Run `npx playwright install chromium --with-deps` |
| Prices show `$0` or empty | Some stations may have `== $0` — these are likely placeholder entries, filter as needed |
# Fuel-rate-Scraper-BVD
