<img width="1600" height="853" alt="96de2536-5127-4543-85ed-e170eb9221c4" src="https://github.com/user-attachments/assets/b8c4e4c3-a444-46c5-a5b7-8b2157820d4e" />
<img width="1568" height="897" alt="33912a7d-870c-4072-8490-c9ecf1757f0f" src="https://github.com/user-attachments/assets/33829b6d-4f69-4644-b891-a8c85c878e15" />
<img width="736" height="756" alt="5f6db185-b38b-4bb6-b8e2-91830be06f9e" src="https://github.com/user-attachments/assets/f54cc375-bffd-4aa7-88f3-df1d8c163185" />

# IDEORA

**Validate a business idea with live market data before you spend a rupee.**

IDEORA is a web app where you enter a business idea, an area and an optional budget. It then analyses the local market using live Google Maps and Google Search data, and gives you a viability score, competitor weaknesses and a 24-month financial forecast.

---

## Features

- **Idea viability score (0–100)** with a clear breakdown: market room, demand, gap to exploit and data confidence
- **Competitor analysis**: nearby businesses with ratings, review counts and addresses
- **Review insights**: what customers like and complain about, found by analysing real Google Maps reviews
- **Opportunity finder**: repeated competitor weaknesses, with suggestions on how to build them into your idea
- **Financial forecast**: start-up cost, monthly fixed cost, break-even month, ROI and funding needed, with pessimistic, expected and optimistic scenarios over 24 months
- **Budget check**: tells you whether your budget is short, tight or comfortable
- **Next steps and sources**: practical actions plus links to the data used

---

## How it works

1. The user enters an **idea**, an **area** and a **budget** on the website
2. The frontend sends the request to the backend route `/api/analyze`
3. The backend calls **SerpApi** to get:
   - local competitors (Google Maps)
   - market demand signals (Google Search)
   - customer reviews of the top competitors (Google Maps Reviews)
4. Our own logic works out the score, weaknesses, opportunities and the financial forecast
5. The result is returned and shown to the user

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4, PostCSS |
| Backend | Next.js API route (TypeScript) |
| CMS / Admin | Payload CMS 4 (beta) with GraphQL and Lexical editor |
| External API | SerpApi (Google Maps, Google Search, Google Maps Reviews) |
| Image processing | sharp |
| Package manager | pnpm |
| Runtime | Node.js 24+ |

---

## Getting started

### Prerequisites
- Node.js 24 or newer
- pnpm
- A [SerpApi](https://serpapi.com/) API key

### Installation

```bash
1. Clone the repository
git clone https://github.com/noorein456/Ideora.git
cd Ideora

2. Install dependencies
pnpm install

3. Add your environment variables
#    Create a file named .env.local in the project root with:
#    SERPAPI_API_KEY=your_serpapi_key_here

4. Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `SERPAPI_API_KEY` | Yes | Your SerpApi key, used for all market data |
| `NEXT_PUBLIC_SITE_URL` | No | Public site URL (defaults to `http://localhost:3000`) |


---

## Project structure

```
src/
├── app/
│   ├── (frontend)/        # Pages and the idea analyzer UI
│   ├── (payload)/         # Payload admin panel and CMS routes
│   └── api/analyze/       # Backend route: SerpApi calls + scoring + forecast
├── collections/           # Payload collections (Admins, Media, Tags, Folders)
├── lib/                   # Helper functions
└── payload.config.ts      # Payload CMS configuration
```

---

## Disclaimer

The scores and financial figures are **planning estimates** based on typical small-business benchmarks and the market signals found. They are not guarantees. Validate with real customers and real quotes before investing.

---

GitHub: [@noorein456](https://github.com/noorein456)
