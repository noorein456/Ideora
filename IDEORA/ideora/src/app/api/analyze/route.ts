import 'server-only'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type SerpMapResult = {
  title?: string
  rating?: number
  reviews?: number
  address?: string
  type?: string
  data_id?: string
  place_id?: string
  link?: string
}

type SerpOrganicResult = {
  title?: string
  link?: string
  snippet?: string
  source?: string
}

type SerpReview = {
  snippet?: string
  rating?: number
  link?: string
  user?: { name?: string }
}

const positiveThemes = [
  ['service', ['service', 'staff', 'friendly', 'helpful', 'hospitality']],
  ['quality', ['quality', 'delicious', 'fresh', 'excellent', 'amazing', 'taste']],
  ['ambience', ['ambience', 'atmosphere', 'quiet', 'cozy', 'clean', 'decor']],
  ['value', ['value', 'affordable', 'price', 'portion', 'worth']],
  ['convenience', ['location', 'delivery', 'quick', 'fast', 'parking', 'convenient']],
] as const

const negativeThemes = [
  ['slow service', ['slow', 'wait', 'waiting', 'late', 'delay']],
  ['inconsistent quality', ['bland', 'cold', 'stale', 'inconsistent', 'bad quality']],
  ['poor service', ['rude', 'unfriendly', 'poor service', 'ignored']],
  ['price concerns', ['expensive', 'overpriced', 'costly', 'pricey']],
  ['space or cleanliness', ['crowded', 'noisy', 'dirty', 'unclean', 'small', 'parking']],
] as const

function cleanText(value: unknown, maxLength = 180) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function countThemes(
  reviews: SerpReview[],
  themes: readonly (readonly [string, readonly string[]])[],
  positive: boolean,
) {
  return themes
    .map(([label, keywords]) => {
      const count = reviews.filter((review) => {
        const rating = Number(review.rating ?? 0)
        const matchesSentiment = positive ? rating >= 4 : rating > 0 && rating <= 3
        const text = (review.snippet ?? '').toLowerCase()
        return matchesSentiment && keywords.some((keyword) => text.includes(keyword))
      }).length
      return { label, count }
    })
    .filter((theme) => theme.count > 0)
    .sort((a, b) => b.count - a.count)
}

async function serpSearch(params: Record<string, string>) {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) throw new Error('SerpApi is not configured yet.')

  const url = new URL('https://serpapi.com/search.json')
  Object.entries({ ...params, api_key: apiKey }).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  )

  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  })
  const data = await response.json()
  if (!response.ok || data.error) {
    throw new Error(data.error || 'SerpApi could not complete this search.')
  }
  return data
}

// Retries a search a couple of times so one flaky review request does not silently
// change the result (a missing review sample changes the "gap" and "confidence" scores).
async function serpSearchWithRetry(params: Record<string, string>, attempts = 3) {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await serpSearch(params)
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message.includes('configured')) throw error
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
    }
  }
  throw lastError
}

/**
 * Market snapshot = the raw live data (Maps, Search, Reviews) for one idea + area.
 *
 * Live Google data changes between requests, which used to make the score drift when the same
 * input was analysed again. The score, risk and forecast are pure formulas of this snapshot,
 * so storing the snapshot per (idea, area) means the same input always gives the same output.
 * Budget is NOT part of the snapshot, it only feeds the financial formulas afterwards.
 */
type MarketSnapshot = {
  version: 1
  fetchedAt: string
  mapsUrl: string | null
  mapResults: SerpMapResult[]
  organicResults: SerpOrganicResult[]
  reviewsByTarget: SerpReview[][]
}

const memoryCache = new Map<string, MarketSnapshot>()
const cacheDirs = [
  path.join(process.cwd(), '.cache', 'ideora'),
  path.join(os.tmpdir(), 'ideora-cache'),
]

function cacheTtlMs() {
  const days = Number(process.env.ANALYSIS_CACHE_DAYS ?? 30)
  return Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 * 1000 : 0
}

function normalizeKeyPart(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function snapshotKey(idea: string, area: string) {
  return createHash('sha256')
    .update(`${normalizeKeyPart(idea)}|${normalizeKeyPart(area)}`)
    .digest('hex')
    .slice(0, 32)
}

function isValidSnapshot(value: unknown): value is MarketSnapshot {
  const snap = value as MarketSnapshot | null
  return (
    !!snap &&
    snap.version === 1 &&
    typeof snap.fetchedAt === 'string' &&
    Array.isArray(snap.mapResults) &&
    Array.isArray(snap.organicResults) &&
    Array.isArray(snap.reviewsByTarget)
  )
}

function isFresh(snapshot: MarketSnapshot, ttl: number) {
  const age = Date.now() - new Date(snapshot.fetchedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < ttl
}

async function readSnapshot(key: string, ttl: number): Promise<MarketSnapshot | null> {
  const inMemory = memoryCache.get(key)
  if (inMemory && isFresh(inMemory, ttl)) return inMemory

  for (const dir of cacheDirs) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, `${key}.json`), 'utf8'))
      if (isValidSnapshot(parsed) && isFresh(parsed, ttl)) {
        memoryCache.set(key, parsed)
        return parsed
      }
    } catch {
      // not cached in this location, try the next one
    }
  }
  return null
}

async function writeSnapshot(key: string, snapshot: MarketSnapshot) {
  memoryCache.set(key, snapshot)
  for (const dir of cacheDirs) {
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, `${key}.json`), JSON.stringify(snapshot), 'utf8')
      return
    } catch {
      // read-only location, try the next one
    }
  }
}

async function fetchSnapshot(idea: string, area: string): Promise<{
  snapshot: MarketSnapshot
  complete: boolean
}> {
  const query = `${idea} in ${area}`
  const [mapsData, searchData] = await Promise.all([
    serpSearch({ engine: 'google_maps', q: query, type: 'search', hl: 'en' }),
    serpSearch({ engine: 'google', q: `${query} market demand trends`, hl: 'en', num: '10' }),
  ])

  const mapResults = ((mapsData.local_results ?? []) as SerpMapResult[])
    .slice(0, 10)
    .map(({ title, rating, reviews, address, type, data_id, place_id, link }) => ({
      title,
      rating,
      reviews,
      address,
      type,
      data_id,
      place_id,
      link,
    }))
  const organicResults = ((searchData.organic_results ?? []) as SerpOrganicResult[])
    .slice(0, 8)
    .map(({ title, link, snippet, source }) => ({ title, link, snippet, source }))
  const reviewTargets = mapResults.filter((result) => result.data_id).slice(0, 3)

  const reviewResponses = await Promise.allSettled(
    reviewTargets.map((result) =>
      serpSearchWithRetry({
        engine: 'google_maps_reviews',
        data_id: result.data_id!,
        hl: 'en',
        sort_by: 'qualityScore',
      }),
    ),
  )

  const reviewsByTarget = reviewResponses.map((response) =>
    response.status === 'fulfilled'
      ? ((response.value.reviews ?? []) as SerpReview[]).map(
          ({ snippet, rating, link, user }) => ({
            snippet,
            rating,
            link,
            user: user ? { name: user.name } : undefined,
          }),
        )
      : [],
  )

  return {
    complete: reviewResponses.every((response) => response.status === 'fulfilled'),
    snapshot: {
      version: 1,
      fetchedAt: new Date().toISOString(),
      mapsUrl: mapsData.search_metadata?.google_maps_url ?? null,
      mapResults,
      organicResults,
      reviewsByTarget,
    },
  }
}

async function getMarketSnapshot(idea: string, area: string): Promise<MarketSnapshot> {
  const ttl = cacheTtlMs()
  const key = snapshotKey(idea, area)

  if (ttl > 0) {
    const cached = await readSnapshot(key, ttl)
    if (cached) return cached
  }

  const { snapshot, complete } = await fetchSnapshot(idea, area)
  // Only keep complete snapshots, so a one-off failed review request is never frozen in.
  if (ttl > 0 && complete) await writeSnapshot(key, snapshot)
  return snapshot
}


type ThemeCount = { label: string; count: number }

const themeFixes: Record<string, string> = {
  'slow service': 'Promise fast, time-boxed service and show the wait time up front.',
  'inconsistent quality': 'Standardise recipes / checklists and quality-check every order.',
  'poor service': 'Hire for friendliness, train the team, and follow up personally with customers.',
  'price concerns': 'Use transparent pricing, value bundles, and a clear “why it costs this” story.',
  'space or cleanliness': 'Make cleanliness, seating comfort, and easy access part of the brand.',
  'low visibility': 'Build your online presence and collect reviews from day one.',
  'mixed ratings': 'Make a consistent, review-worthy experience your core promise.',
}

type CategoryProfile = {
  name: string
  startup: number
  fixedMonthly: number
  matureRevenue: number
  variablePct: number
  rampMonths: number
}

const categories: [RegExp, CategoryProfile][] = [
  [/\b(cart|kiosk|stall|truck)\b/i, { name: 'Cart / kiosk', startup: 350000, fixedMonthly: 35000, matureRevenue: 240000, variablePct: 0.38, rampMonths: 4 }],
  [/\b(meal prep|cloud kitchen|tiffin|catering|home chef)\b/i, { name: 'Cloud kitchen', startup: 600000, fixedMonthly: 70000, matureRevenue: 300000, variablePct: 0.4, rampMonths: 5 }],
  [/\b(cafe|coffee|restaurant|bakery|bistro|bar|dessert|food)\b/i, { name: 'Cafe / restaurant', startup: 1800000, fixedMonthly: 150000, matureRevenue: 480000, variablePct: 0.35, rampMonths: 8 }],
  [/\b(salon|spa|grooming|barber|beauty|pet)\b/i, { name: 'Salon / grooming', startup: 800000, fixedMonthly: 90000, matureRevenue: 320000, variablePct: 0.25, rampMonths: 6 }],
  [/\b(gym|fitness|yoga|pilates|studio|crossfit)\b/i, { name: 'Fitness studio', startup: 1500000, fixedMonthly: 130000, matureRevenue: 400000, variablePct: 0.2, rampMonths: 9 }],
  [/\b(app|software|saas|platform|website|ecommerce|e-commerce|online|startup)\b/i, { name: 'Online / software', startup: 400000, fixedMonthly: 60000, matureRevenue: 250000, variablePct: 0.15, rampMonths: 10 }],
  [/\b(coaching|tutor|tuition|classes|education|school|study|library)\b/i, { name: 'Education', startup: 500000, fixedMonthly: 60000, matureRevenue: 260000, variablePct: 0.2, rampMonths: 6 }],
  [/\b(store|shop|boutique|retail|supermarket|mart)\b/i, { name: 'Retail store', startup: 1200000, fixedMonthly: 110000, matureRevenue: 380000, variablePct: 0.6, rampMonths: 7 }],
  [/\b(clinic|pharmacy|diagnostic|dental|care)\b/i, { name: 'Healthcare', startup: 2000000, fixedMonthly: 180000, matureRevenue: 520000, variablePct: 0.25, rampMonths: 9 }],
]

const defaultCategory: CategoryProfile = {
  name: 'General small business',
  startup: 800000,
  fixedMonthly: 80000,
  matureRevenue: 280000,
  variablePct: 0.35,
  rampMonths: 7,
}

const metroPattern =
  /\b(mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|pune|gurgaon|gurugram|noida|koramangala|indiranagar|bandra)\b/i

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step
}

function parseBudget(value: unknown) {
  const number = typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.min(Math.round(number), 1_000_000_000)
}

function buildFinancials(input: {
  idea: string
  area: string
  budget: number | null
  score: number
  competitorCount: number
  averageRating: number | null
  topWeakness: string | undefined
}) {
  const { idea, area, budget, score, competitorCount, averageRating, topWeakness } = input
  const profile = categories.find(([pattern]) => pattern.test(idea))?.[1] ?? defaultCategory
  const lean = /\b(home|mobile|online|delivery|pop-?up|virtual)\b/i.test(idea)
  const metro = metroPattern.test(area)

  const costFactor = (lean ? 0.45 : 1) * (metro ? 1.25 : 1)
  const startupCost = roundTo(profile.startup * costFactor, 5000)
  // Fixed costs include a modest owner's draw (30,000/mo, 20,000 for lean models).
  const fixedMonthly = roundTo(
    profile.fixedMonthly * (lean ? 0.55 : 1) * (metro ? 1.2 : 1) + (lean ? 20000 : 30000),
    1000,
  )
  // Marketing, platform fees, maintenance and wastage on top of the category's direct costs.
  const variablePct = Math.min(0.9, profile.variablePct + 0.12)

  let revenueFactor = 0.55 + (score / 100) * 0.7
  if (competitorCount >= 8) revenueFactor *= 0.9
  if (averageRating && averageRating >= 4.4) revenueFactor *= 0.95
  const matureRevenue = roundTo(
    profile.matureRevenue * revenueFactor * (metro ? 1.15 : 1) * (lean ? 0.6 : 1),
    1000,
  )

  const months = 24
  const scenarios = { pessimistic: 0.7, expected: 1, optimistic: 1.25 } as const
  const run = (multiplier: number) => {
    let cumulative = -startupCost
    return Array.from({ length: months }, (_, index) => {
      const month = index + 1
      const ramp = Math.min(1, 0.25 + 0.75 * (month / profile.rampMonths))
      const revenue = matureRevenue * multiplier * ramp
      const cost = fixedMonthly + variablePct * revenue
      const profit = revenue - cost
      cumulative += profit
      return {
        month,
        revenue: Math.round(revenue),
        cost: Math.round(cost),
        profit: Math.round(profit),
        cumulative: Math.round(cumulative),
      }
    })
  }

  const expected = run(scenarios.expected)
  const pessimistic = run(scenarios.pessimistic)
  const optimistic = run(scenarios.optimistic)

  const breakEvenOf = (series: typeof expected) =>
    series.find((point) => point.cumulative >= 0)?.month ?? null
  const roiAt = (series: typeof expected, month: number) =>
    Math.round((series[month - 1].cumulative / startupCost) * 100)

  const fundingNeeded = Math.max(0, -Math.min(...expected.map((point) => point.cumulative)))
  const worstFundingNeeded = Math.max(0, -Math.min(...pessimistic.map((point) => point.cumulative)))
  const lowEstimate = roundTo(startupCost * 0.8, 5000)
  const highEstimate = roundTo(startupCost * 1.25, 5000)

  const budgetStatus: 'none' | 'short' | 'tight' | 'comfortable' =
    budget === null
      ? 'none'
      : budget < startupCost
        ? 'short'
        : budget < fundingNeeded * 1.1
          ? 'tight'
          : 'comfortable'

  const m24 = expected[months - 1]
  const lossRisk12 = Math.min(100, Math.max(0, Math.round((-pessimistic[11].cumulative / startupCost) * 100)))
  const breakEven = breakEvenOf(expected)
  const breakEvenWorst = breakEvenOf(pessimistic)

  const suggestions: string[] = []
  if (budget === null) {
    suggestions.push(
      `Add your budget to see whether it covers the estimated ${startupCost.toLocaleString('en-IN')} start-up cost and the early cash dip.`,
    )
  } else if (budgetStatus === 'short') {
    suggestions.push(
      `Your budget covers about ${Math.round((budget / startupCost) * 100)}% of the estimated start-up cost. Start with a lean version (pop-up, cart, or online-first) or raise roughly ${(startupCost - budget).toLocaleString('en-IN')} more.`,
    )
  } else if (budgetStatus === 'tight') {
    suggestions.push(
      `Your budget covers the launch but not the early cash dip. Keep about ${Math.max(0, Math.round(fundingNeeded - budget)).toLocaleString('en-IN')} extra in reserve for the first months.`,
    )
  } else {
    suggestions.push(
      `Your budget comfortably covers launch and the early cash dip. Keep 3 months of fixed costs (${(fixedMonthly * 3).toLocaleString('en-IN')}) untouched as a safety buffer.`,
    )
  }
  if (breakEven) {
    suggestions.push(
      `In the expected case you break even around month ${breakEven}${
        breakEvenWorst ? ` (month ${breakEvenWorst} if sales come in 30% lower)` : ', but not within 24 months if sales come in 30% lower'
      }. Plan cash for that long.`,
    )
  } else {
    suggestions.push(
      `The model does not reach break-even within 24 months. Cut fixed costs or raise the average order value before committing capital.`,
    )
  }
  if (competitorCount >= 8) {
    suggestions.push(
      `The area is crowded, so spend your first marketing budget on one narrow audience instead of a broad launch.`,
    )
  }
  if (topWeakness) {
    suggestions.push(
      `Spend on fixing "${topWeakness}" first. It is where competitors lose customers and the cheapest way to stand out.`,
    )
  }
  suggestions.push(
    `Validate with a small pilot (5 paying customers) before spending the full budget; these figures are planning estimates, not guarantees.`,
  )

  return {
    currency: 'INR',
    category: profile.name,
    budget,
    budgetStatus,
    startupCost,
    costRange: { low: lowEstimate, high: highEstimate },
    monthlyFixedCost: fixedMonthly,
    matureMonthlyRevenue: matureRevenue,
    fundingNeeded: roundTo(fundingNeeded, 1000),
    worstCaseFundingNeeded: roundTo(worstFundingNeeded, 1000),
    breakEvenMonth: breakEven,
    roi12: roiAt(expected, 12),
    roi24: roiAt(expected, 24),
    profitMargin: m24.revenue > 0 ? Math.round((m24.profit / m24.revenue) * 100) : 0,
    lossRisk12,
    forecast: {
      expected,
      pessimistic: pessimistic.map(({ month, cumulative }) => ({ month, cumulative })),
      optimistic: optimistic.map(({ month, cumulative }) => ({ month, cumulative })),
    },
    suggestions,
    assumptionsNote:
      'Estimates use typical Indian small-business benchmarks for this category, adjusted for the live competition and demand signals found. Replace them with real quotes before investing.',
  }
}

function weaknessesFor(
  result: SerpMapResult,
  negatives: ThemeCount[],
  hasReviews: boolean,
): { label: string; detail: string }[] {
  const items: { label: string; detail: string }[] = negatives.slice(0, 3).map(({ label, count }) => ({
    label: `${label[0].toUpperCase()}${label.slice(1)}`,
    detail: `Mentioned in ${count} critical review${count === 1 ? '' : 's'}.`,
  }))
  const rating = Number(result.rating)
  const reviews = Number(result.reviews)
  if (Number.isFinite(rating) && rating > 0 && rating < 4.2) {
    items.push({
      label: 'Mixed ratings',
      detail: `Only ${rating.toFixed(1)}★ suggests customers' expectations are not consistently met.`,
    })
  }
  if (Number.isFinite(reviews) && reviews < 50) {
    items.push({
      label: 'Low visibility',
      detail: `Just ${reviews.toLocaleString()} reviews, so few customers know or talk about them.`,
    })
  }
  if (items.length === 0) {
    items.push({
      label: 'No clear weakness found',
      detail: hasReviews
        ? 'Reviews sampled showed no repeated complaint, so compete on a narrower niche.'
        : 'No review text was sampled for this business; check its recent reviews manually.',
    })
  }
  return items
}

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const idea = cleanText(body.idea, 140)
    const area = cleanText(body.area, 100)
    const budget = parseBudget(body.budget)

    if (idea.length < 3 || area.length < 2) {
      return Response.json(
        { error: 'Please enter a specific business idea and area.' },
        { status: 400 },
      )
    }

    const query = `${idea} in ${area}`
    const snapshot = await getMarketSnapshot(idea, area)

    const { mapResults, organicResults, reviewsByTarget } = snapshot
    const reviewTargets = mapResults.filter((result) => result.data_id).slice(0, 3)
    const reviews = reviewsByTarget.flat()
    const validRatings = mapResults
      .map((result) => Number(result.rating))
      .filter((rating) => Number.isFinite(rating) && rating > 0)
    const averageRating = validRatings.length
      ? validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length
      : null
    const totalReviews = mapResults.reduce(
      (sum, result) => sum + (Number.isFinite(Number(result.reviews)) ? Number(result.reviews) : 0),
      0,
    )

    const positive = countThemes(reviews, positiveThemes, true)
    const negative = countThemes(reviews, negativeThemes, false)
    const demandSignals = organicResults.filter((result) =>
      /\b(growing|growth|demand|trend|popular|increase|market|opportunity)\b/i.test(
        result.snippet ?? '',
      ),
    ).length

    const competitionScore = Math.max(8, 38 - mapResults.length * 2.5)
    const demandScore = Math.min(30, 12 + demandSignals * 3 + Math.min(totalReviews / 500, 8))
    const gapScore = Math.min(24, 10 + negative.length * 4)
    const confidenceScore = Math.min(8, organicResults.length + (reviews.length ? 2 : 0))
    const score = Math.round(
      Math.max(28, Math.min(91, competitionScore + demandScore + gapScore + confidenceScore)),
    )

    const outlook =
      score >= 75 ? 'Strong signal' : score >= 58 ? 'Worth testing' : 'Proceed carefully'

    const sourceList = [
      {
        id: 'M1',
        title: `Google Maps results for ${query}`,
        url:
          snapshot.mapsUrl ??
          `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
        kind: 'Maps' as const,
      },
      ...organicResults.slice(0, 6).map((result, index) => ({
        id: `S${index + 1}`,
        title: result.title ?? result.source ?? 'Google Search result',
        url: result.link ?? `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        kind: 'Search' as const,
      })),
      ...reviewTargets.map((result, index) => ({
        id: `R${index + 1}`,
        title: `Customer reviews for ${result.title ?? 'local competitor'}`,
        url:
          result.link ??
          `https://www.google.com/maps/search/${encodeURIComponent(`${result.title} ${area}`)}`,
        kind: 'Review' as const,
      })),
    ]

    const likes =
      positive.length > 0
        ? positive.slice(0, 4).map(({ label, count }) => {
            const source = reviewTargets[0] ? 'R1' : 'M1'
            return `Customers repeatedly praise ${label} across the sampled local reviews (${count} mentions). [${source}]`
          })
        : [
            `Strong ratings suggest customers value the existing local options. [M1]`,
            `Review volume shows people actively research and evaluate this category. [M1]`,
          ]

    const complaints =
      negative.length > 0
        ? negative.slice(0, 4).map(({ label, count }) => {
            const source = reviewTargets[Math.min(count - 1, reviewTargets.length - 1)]
              ? `R${Math.min(count, reviewTargets.length)}`
              : 'M1'
            return `${label[0].toUpperCase()}${label.slice(1)} appears in critical customer feedback (${count} mentions). [${source}]`
          })
        : [
            `The review sample exposes few repeated complaints; interview customers directly to uncover unmet needs. [R1]`,
            `High incumbent ratings can raise the quality bar for a new entrant. [M1]`,
          ]

    const strongestNegative = negative[0]?.label
    const gaps = [
      strongestNegative
        ? `Differentiate around ${strongestNegative}; it is the clearest repeated weakness in the review sample. [R1]`
        : `Lead with a sharply defined experience rather than competing as another general option. [M1]`,
      mapResults.length >= 8
        ? `The visible market is crowded. Start with a narrow audience, use case, or delivery model the top listings do not own. [M1]`
        : `Only ${mapResults.length} close matches appeared in the first Maps set, suggesting room to validate a focused offer. [M1]`,
      averageRating && averageRating >= 4.3
        ? `Incumbents average ${averageRating.toFixed(1)} stars, so compete on a specific unmet need—not baseline quality. [M1]`
        : `A consistent, review-worthy customer experience could stand out against uneven local ratings. [M1]`,
    ]

    const nextSteps = [
      `Speak to 10 people in ${area} and test whether the top complaint is painful enough to switch for.`,
      `Create a one-page offer around “${idea}” and collect five real sign-ups before spending on a location.`,
      `Mystery-shop the top three competitors and compare pricing, wait time, experience, and peak-hour demand.`,
    ]

    const competitors = mapResults.slice(0, 6).map((result) => {
      const targetIndex = reviewTargets.findIndex((target) => target.data_id === result.data_id)
      const ownReviews = targetIndex >= 0 ? reviewsByTarget[targetIndex] : []
      const ownNegatives = countThemes(ownReviews, negativeThemes, false)
      return {
        name: result.title ?? 'Local business',
        rating: Number.isFinite(Number(result.rating)) ? Number(result.rating) : null,
        reviews: Number.isFinite(Number(result.reviews)) ? Number(result.reviews) : null,
        address: result.address ?? area,
        type: result.type ?? 'Similar business',
        sourceId: targetIndex >= 0 ? `R${targetIndex + 1}` : 'M1',
        weaknesses: weaknessesFor(result, ownNegatives, ownReviews.length > 0),
      }
    })

    // Market-wide opportunities: every weakness theme, with how to build it into the idea.
    const themeTally = new Map<string, { mentions: number; competitors: Set<string> }>()
    competitors.forEach((competitor) =>
      competitor.weaknesses.forEach((weakness) => {
        const key = weakness.label.toLowerCase()
        if (!themeFixes[key]) return
        const entry = themeTally.get(key) ?? { mentions: 0, competitors: new Set<string>() }
        entry.mentions += Number(weakness.detail.match(/\d+/)?.[0] ?? 1) || 1
        entry.competitors.add(competitor.name)
        themeTally.set(key, entry)
      }),
    )
    negative.forEach(({ label, count }) => {
      const entry = themeTally.get(label) ?? { mentions: 0, competitors: new Set<string>() }
      entry.mentions = Math.max(entry.mentions, count)
      themeTally.set(label, entry)
    })
    const opportunities = [...themeTally.entries()]
      .map(([label, entry]) => ({
        label: `${label[0].toUpperCase()}${label.slice(1)}`,
        mentions: entry.mentions,
        competitorsAffected: entry.competitors.size,
        addToIdea: themeFixes[label] ?? `Make "${label}" a visible strength of your offer.`,
      }))
      .sort((a, b) => b.competitorsAffected - a.competitorsAffected || b.mentions - a.mentions)
      .slice(0, 6)

    const financials = buildFinancials({
      idea,
      area,
      budget,
      score,
      competitorCount: mapResults.length,
      averageRating,
      topWeakness: strongestNegative,
    })

    const scoreBreakdown = [
      { label: 'Market room', value: Math.round(competitionScore), max: 38 },
      { label: 'Demand', value: Math.round(demandScore), max: 30 },
      { label: 'Gap to exploit', value: Math.round(gapScore), max: 24 },
      { label: 'Data confidence', value: Math.round(confidenceScore), max: 8 },
    ]

    const summary =
      mapResults.length === 0
        ? `The first live Maps search found no close local matches, but that may reflect how the idea is described. Treat this as a prompt for customer interviews, not proof of an empty market. [M1]`
        : `We found ${mapResults.length} visible local competitors with ${
            averageRating ? `an average rating of ${averageRating.toFixed(1)}` : 'mixed rating data'
          }. ${
            strongestNegative
              ? `The clearest opening is to solve for ${strongestNegative}.`
              : `The opportunity depends on choosing a sharper niche than the current listings.`
          } [M1]`

    return Response.json({
      idea,
      area,
      generatedAt: snapshot.fetchedAt,
      score,
      outlook,
      summary,
      metrics: {
        competitors: mapResults.length,
        averageRating,
        totalReviews,
        demandSignals,
      },
      competitors,
      opportunities,
      financials,
      scoreBreakdown,
      likes,
      complaints,
      gaps,
      nextSteps,
      sources: sourceList,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze this idea.'
    const status = message.includes('configured') ? 503 : 502
    return Response.json({ error: message }, { status })
  }
}
