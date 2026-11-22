# IDEORA

**Evidence before investment.** Enter a business idea, an area and (optionally) a budget. IDEORA studies the local market using live Google Maps, Google Search and customer-review data, then returns a viability score, competitor weaknesses, opportunities and a 24-month financial forecast.

---

## Features

- **Viability score (0–100)** with a breakdown: market room, demand, gap to exploit, data confidence
- **Competitor analysis**: nearby businesses with rating, review count and address
- **Review insights**: what customers praise and complain about, found in real Google Maps reviews
- **Opportunities**: repeated competitor weaknesses, with suggestions on how to build them into your idea
- **Financial forecast**: start-up cost, monthly fixed cost, break-even month, ROI, 12-month loss risk and funding needed, in pessimistic / expected / optimistic scenarios
- **Budget check**: tells you if your budget is short, tight or comfortable
- **Sources and next steps**: every claim links back to the data used

---

## Stable, repeatable results

The same input always gives the same score, risk and forecast.

Live Google data changes from one request to the next, so IDEORA separates the work into two parts:

1. **Market snapshot**: the raw data (competitors, search results, review sample) is fetched **once** per idea + area and stored (`.cache/ideora/`). Re-analysing the same idea and area reuses that snapshot.
2. **Formulas**: the score, risk, break-even and ROI are pure formulas of the snapshot (below). Same snapshot + same formulas = same numbers.

Details:
- Matching ignores letter case and extra spaces (`Coffee  Shop` = `coffee shop`).
- Your **budget is not part of the snapshot**; changing it only changes the budget check and funding advice, never the score.
- A snapshot is only stored when all review requests succeeded (failed ones are retried up to 3 times), so a one-off network failure is never frozen in.
- Snapshots are reused for 30 days. Set `ANALYSIS_CACHE_DAYS` to change that (`0` = always fetch fresh data, scores may then vary between runs). To refresh one idea, delete its file in `.cache/ideora/` (or the whole folder).

---

## The formulas

Let **N** = number of local competitors found (max 10), **D** = number of search results showing demand words (growing, demand, trend, market…), **R** = total review count across competitors, **K** = number of distinct complaint themes found in reviews, **S** = number of search results (max 8).

| Part | Formula | Max |
|---|---|---|
| Market room | `max(8, 38 − 2.5 × N)` | 38 |
| Demand | `min(30, 12 + 3 × D + min(R / 500, 8))` | 30 |
| Gap to exploit | `min(24, 10 + 4 × K)` | 24 |
| Data confidence | `min(8, S + 2 if reviews were found)` | 8 |

```
score = round( clamp( MarketRoom + Demand + Gap + Confidence, 28, 91 ) )
```

Outlook: **75+** Strong signal · **58–74** Worth testing · **below 58** Proceed carefully.

**Financial model** (monthly, 24 months)

```
revenueFactor   = 0.55 + 0.7 × score / 100        (× 0.9 if N ≥ 8, × 0.95 if avg rating ≥ 4.4)
ramp(month)     = min(1, 0.25 + 0.75 × month / rampMonths)
revenue(month)  = matureRevenue × scenario × ramp(month)
profit(month)   = revenue − fixedCost − variableCost% × revenue
cumulative      = −startupCost + Σ profit
lossRisk12      = clamp( round( −pessimisticCumulative(month 12) / startupCost × 100 ), 0, 100 )
```

Scenarios: pessimistic ×0.7, expected ×1.0, optimistic ×1.25. Cost and revenue benchmarks are chosen from the business category detected in the idea (cafe, gym, salon, retail, software, …) and adjusted for metro areas and lean models (home, online, delivery).

> These are planning estimates, not guarantees. Validate with real customers and real quotes before investing.

---

## How it works

1. The user enters an **idea**, **area** and **budget**.
2. The page sends them to the backend route `POST /api/analyze`.
3. The backend loads the market snapshot (cached, or fetched from **SerpApi**: Google Maps, Google Search, Google Maps Reviews).
4. The formulas above compute the score, weaknesses, opportunities and forecast.
5. The result is returned and displayed.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4 (PostCSS) |
| Backend | Next.js API route (TypeScript) |
| External API | SerpApi (Google Maps, Google Search, Google Maps Reviews) |
| Package manager | pnpm |
| Runtime | Node.js 24+ |

There is no database and no CMS; the only stored data is the snapshot cache.

---

## Getting started

### Prerequisites
- Node.js 24 or newer
- pnpm
- A [SerpApi](https://serpapi.com/) API key

### Run locally

```bash
git clone https://github.com/noorein456/Ideora.git
cd Ideora
pnpm install

# create your environment file
cp .env.example .env.local        # then put your real SERPAPI_API_KEY inside

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
pnpm build
pnpm start
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `SERPAPI_API_KEY` | Yes | SerpApi key used for all market data |
| `NEXT_PUBLIC_SITE_URL` | No | Public site URL (default `http://localhost:3000`) |
| `ANALYSIS_CACHE_DAYS` | No | Days a market snapshot is reused (default `30`, `0` = off) |

> Never commit `.env.local` or your API key. `.gitignore` already excludes `.env*` files (except `.env.example`).

---

## Project structure

```
src/app/
├── (frontend)/
│   ├── layout.tsx          # page shell and metadata
│   ├── page.tsx            # home page
│   ├── idea-analyzer.tsx   # the analyzer UI
│   ├── not-found.tsx
│   └── styles.css
└── api/analyze/route.ts    # SerpApi calls, snapshot cache, scoring and forecast formulas
public/favicon.svg
```

---

## Author

**Noorein**: [@noorein456](https://github.com/noorein456)
