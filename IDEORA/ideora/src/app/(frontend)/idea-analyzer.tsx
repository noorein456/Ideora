'use client'

import { FormEvent, useMemo, useState } from 'react'

type Weakness = { label: string; detail: string }

type Competitor = {
  name: string
  rating: number | null
  reviews: number | null
  address: string
  type: string
  sourceId: string
  weaknesses: Weakness[]
}

type Opportunity = {
  label: string
  mentions: number
  competitorsAffected: number
  addToIdea: string
}

type ForecastPoint = { month: number; revenue: number; cost: number; profit: number; cumulative: number }
type CumulativePoint = { month: number; cumulative: number }

type Financials = {
  currency: string
  category: string
  budget: number | null
  budgetStatus: 'none' | 'short' | 'tight' | 'comfortable'
  startupCost: number
  costRange: { low: number; high: number }
  monthlyFixedCost: number
  matureMonthlyRevenue: number
  fundingNeeded: number
  worstCaseFundingNeeded: number
  breakEvenMonth: number | null
  roi12: number
  roi24: number
  profitMargin: number
  lossRisk12: number
  forecast: {
    expected: ForecastPoint[]
    pessimistic: CumulativePoint[]
    optimistic: CumulativePoint[]
  }
  suggestions: string[]
  assumptionsNote: string
}

type Source = {
  id: string
  title: string
  url: string
  kind: 'Maps' | 'Search' | 'Review'
}

type Analysis = {
  idea: string
  area: string
  generatedAt: string
  score: number
  outlook: string
  summary: string
  metrics: {
    competitors: number
    averageRating: number | null
    totalReviews: number
    demandSignals: number
  }
  competitors: Competitor[]
  opportunities: Opportunity[]
  financials: Financials
  scoreBreakdown: { label: string; value: number; max: number }[]
  likes: string[]
  complaints: string[]
  gaps: string[]
  nextSteps: string[]
  sources: Source[]
}

const examples = [
  ['Specialty coffee cart', 'Koramangala, Bengaluru', '600000'],
  ['Pet grooming at home', 'Indiranagar, Bengaluru', '550000'],
  ['Healthy meal prep', 'Pune, Maharashtra', '900000'],
]

type Tab = 'overview' | 'financials' | 'competitors' | 'actions'

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Budget & profit' },
  { id: 'competitors', label: 'Competitor gaps' },
  { id: 'actions', label: 'Action plan' },
]

/** Compact Indian-rupee format: ₹45K, ₹12.5L, ₹1.2Cr. */
function inr(value: number) {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(abs >= 100_000_000 ? 0 : 1)}Cr`
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(abs >= 1_000_000 ? 0 : 1)}L`
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`
  return `${sign}₹${Math.round(abs)}`
}

function pct(value: number) {
  return `${value > 0 ? '+' : ''}${value}%`
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const id = `spark-${color.replace('#', '')}`
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * 100,
    34 - ((value - min) / range) * 28,
  ])
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-12 w-28" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${line} 100,40`} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function KpiCard({
  icon,
  label,
  value,
  note,
  noteTone,
  spark,
  color,
}: {
  icon: string
  label: string
  value: string
  note: string
  noteTone: 'good' | 'bad' | 'neutral'
  spark: number[]
  color: string
}) {
  const toneClass =
    noteTone === 'good' ? 'text-emerald-400' : noteTone === 'bad' ? 'text-rose-400' : 'text-violet-200/50'
  return (
    <article className="kpi-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid size-9 place-items-center rounded-xl border border-white/10 text-sm"
          style={{ background: `${color}22`, color }}
        >
          {icon}
        </span>
        <Sparkline values={spark} color={color} />
      </div>
      <p className="mt-4 text-sm text-violet-100/70">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tracking-[-0.04em]">{value}</span>
        <span className={`text-[11px] font-medium ${toneClass}`}>{note}</span>
      </div>
    </article>
  )
}

/** Half-circle tick gauge, like the confidence index in the reference dashboard. */
function GaugeMeter({ score }: { score: number }) {
  const ticks = 44
  const filled = Math.round((score / 100) * ticks)
  const cx = 150
  const cy = 150
  const colors = ['#d9f24a', '#46e6a8', '#22d3ee', '#3b9bff', '#7c6cff', '#d946ef']
  return (
    <svg viewBox="0 0 300 175" className="w-full" role="img" aria-label={`Opportunity score ${score} out of 100`}>
      {Array.from({ length: ticks }, (_, index) => {
        const angle = Math.PI - (index / (ticks - 1)) * Math.PI
        const x1 = cx + Math.cos(angle) * 96
        const y1 = cy - Math.sin(angle) * 96
        const x2 = cx + Math.cos(angle) * 128
        const y2 = cy - Math.sin(angle) * 128
        const color = colors[Math.min(colors.length - 1, Math.floor((index / ticks) * colors.length))]
        const active = index < filled
        return (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={active ? color : 'rgba(216,180,254,0.12)'}
            strokeWidth="5"
            strokeLinecap="round"
            style={active ? { filter: `drop-shadow(0 0 4px ${color}88)` } : undefined}
          />
        )
      })}
      <path
        d="M 66 150 A 84 84 0 0 1 234 150"
        fill="none"
        stroke="rgba(216,180,254,0.3)"
        strokeWidth="1.5"
        strokeDasharray="1 5"
        strokeLinecap="round"
      />
      <text x={cx} y={cy - 22} textAnchor="middle" fill="#fff" fontSize="40" fontWeight="600">
        {score}
      </text>
      <text x={cx} y={cy - 2} textAnchor="middle" fill="rgba(237,233,254,0.55)" fontSize="10">
        Overall opportunity score
      </text>
    </svg>
  )
}

const scenarioStyles = {
  pessimistic: { color: '#f472b6', label: 'Slow sales (-30%)' },
  expected: { color: '#a78bfa', label: 'Expected' },
  optimistic: { color: '#22d3ee', label: 'Strong sales (+25%)' },
} as const

/** Cumulative profit / loss over 24 months: the "where will I be in the future" graph. */
function ForecastChart({ financials }: { financials: Financials }) {
  const [hover, setHover] = useState<number | null>(null)
  const { expected, pessimistic, optimistic } = financials.forecast
  const width = 640
  const height = 270
  const pad = { left: 56, right: 16, top: 16, bottom: 30 }
  const all = [...expected, ...pessimistic, ...optimistic].map((point) => point.cumulative)
  const rawMin = Math.min(0, ...all)
  const rawMax = Math.max(0, ...all)
  const span = rawMax - rawMin || 1
  const min = rawMin - span * 0.05
  const max = rawMax + span * 0.05
  const x = (month: number) =>
    pad.left + ((month - 1) / (expected.length - 1)) * (width - pad.left - pad.right)
  const y = (value: number) =>
    pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom)
  const path = (series: CumulativePoint[]) =>
    series.map((point) => `${x(point.month).toFixed(1)},${y(point.cumulative).toFixed(1)}`).join(' ')
  const gridValues = [0, 1, 2, 3].map((step) => min + ((max - min) * step) / 3)
  const breakEven = financials.breakEvenMonth
  const active = hover !== null ? hover : null
  const colWidth = (width - pad.left - pad.right) / (expected.length - 1)

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" role="img" aria-label="Profit and loss forecast over 24 months">
        <defs>
          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="activeCol" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#a78bfa" stopOpacity="0.45" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridValues.map((value) => (
          <g key={value}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="rgba(216,180,254,0.08)" />
            <text x={pad.left - 8} y={y(value) + 3} textAnchor="end" fill="rgba(237,233,254,0.4)" fontSize="10">
              {inr(value)}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="rgba(237,233,254,0.45)" strokeDasharray="4 4" />
        <text x={width - pad.right} y={y(0) - 5} textAnchor="end" fill="rgba(237,233,254,0.5)" fontSize="9">
          break-even line
        </text>
        {active !== null && (
          <rect
            x={x(active) - colWidth / 2}
            y={pad.top}
            width={colWidth}
            height={height - pad.top - pad.bottom}
            rx="6"
            fill="url(#activeCol)"
          />
        )}
        <polygon
          points={`${x(1)},${y(0)} ${path(expected)} ${x(expected.length)},${y(0)}`}
          fill="url(#forecastFill)"
        />
        <polyline points={path(pessimistic)} fill="none" stroke={scenarioStyles.pessimistic.color} strokeWidth="1.8" strokeDasharray="5 5" strokeLinecap="round" />
        <polyline points={path(optimistic)} fill="none" stroke={scenarioStyles.optimistic.color} strokeWidth="1.8" strokeDasharray="5 5" strokeLinecap="round" />
        <polyline points={path(expected)} fill="none" stroke={scenarioStyles.expected.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        {breakEven && (
          <g>
            <circle cx={x(breakEven)} cy={y(0)} r="6" fill="#130b20" stroke="#34d399" strokeWidth="2.5" />
            <text x={x(breakEven)} y={y(0) + 20} textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="600">
              Break-even · month {breakEven}
            </text>
          </g>
        )}
        {[1, 6, 12, 18, 24].map((month) => (
          <text key={month} x={x(month)} y={height - 8} textAnchor="middle" fill="rgba(237,233,254,0.4)" fontSize="10">
            M{month}
          </text>
        ))}
        {active !== null && (
          <circle cx={x(active)} cy={y(expected[active - 1].cumulative)} r="5" fill="#130b20" stroke="#fff" strokeWidth="2" />
        )}
        {expected.map((point) => (
          <rect
            key={point.month}
            x={x(point.month) - colWidth / 2}
            y={pad.top}
            width={colWidth}
            height={height - pad.top - pad.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(point.month)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(point.month)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`Month ${point.month}: expected cumulative ${inr(point.cumulative)}`}
          />
        ))}
      </svg>
      <div className="mt-2 flex min-h-9 flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap gap-4">
          {(Object.keys(scenarioStyles) as (keyof typeof scenarioStyles)[]).map((key) => (
            <span key={key} className="flex items-center gap-1.5 text-violet-100/60">
              <span className="size-2 rounded-full" style={{ background: scenarioStyles[key].color }} />
              {scenarioStyles[key].label}
            </span>
          ))}
        </div>
        {active !== null && (
          <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-violet-100">
            Month {active}: slow {inr(pessimistic[active - 1].cumulative)} · expected{' '}
            <strong>{inr(expected[active - 1].cumulative)}</strong> · strong {inr(optimistic[active - 1].cumulative)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Monthly revenue vs cost bars (first 12 months, expected case). */
function RevenueCostBars({ points }: { points: ForecastPoint[] }) {
  const data = points.slice(0, 12)
  const max = Math.max(...data.map((point) => Math.max(point.revenue, point.cost))) || 1
  const width = 640
  const height = 190
  const barArea = (width - 40) / data.length
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Monthly revenue versus cost for the first 12 months">
      {data.map((point, index) => {
        const bx = 30 + index * barArea
        const revenueHeight = (point.revenue / max) * 140
        const costHeight = (point.cost / max) * 140
        return (
          <g key={point.month}>
            <rect x={bx + barArea * 0.12} y={160 - revenueHeight} width={barArea * 0.32} height={revenueHeight} rx="3" fill="#a78bfa" />
            <rect x={bx + barArea * 0.48} y={160 - costHeight} width={barArea * 0.32} height={costHeight} rx="3" fill="#f472b6" opacity="0.8" />
            <text x={bx + barArea * 0.46} y={180} textAnchor="middle" fill="rgba(237,233,254,0.4)" fontSize="10">
              M{point.month}
            </text>
          </g>
        )
      })}
      <line x1="30" x2={width - 10} y1="160" y2="160" stroke="rgba(216,180,254,0.15)" />
    </svg>
  )
}

function Panel({
  title,
  eyebrow,
  right,
  children,
  className = '',
}: {
  title: string
  eyebrow?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`glass-panel rounded-[28px] p-6 md:p-7 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
          )}
          <h3 className="mt-1 text-xl font-medium tracking-[-0.03em]">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function BudgetMeter({ financials }: { financials: Financials }) {
  const { budget, startupCost, fundingNeeded, budgetStatus } = financials
  const scaleMax = Math.max(budget ?? 0, fundingNeeded, startupCost) * 1.1 || 1
  const at = (value: number) => `${Math.min(100, (value / scaleMax) * 100)}%`
  const statusCopy = {
    none: { text: 'No budget entered', tone: 'text-violet-200/60' },
    short: { text: 'Budget is below the launch cost', tone: 'text-rose-400' },
    tight: { text: 'Covers launch, thin on early losses', tone: 'text-amber-300' },
    comfortable: { text: 'Budget covers launch and the early dip', tone: 'text-emerald-400' },
  }[budgetStatus]
  const statusColor =
    budgetStatus === 'short' ? '#fb7185' : budgetStatus === 'tight' ? '#fcd34d' : '#34d399'

  return (
    <div>
      <p className={`text-sm font-semibold ${statusCopy.tone}`}>{statusCopy.text}</p>
      <div className="relative mt-6 h-3 rounded-full bg-violet-200/10">
        {budget !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: at(budget), background: `linear-gradient(90deg, #7c3aed, ${statusColor})` }}
          />
        )}
        {[
          { value: startupCost, label: 'Launch cost' },
          { value: fundingNeeded, label: 'Cash needed to survive dip' },
        ].map((marker, index) => (
          <div key={marker.label} className="absolute -top-1 h-5 w-px bg-white/70" style={{ left: at(marker.value) }}>
            <span
              className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-violet-100/60 ${
                index === 0 ? '-top-5' : 'top-6'
              }`}
            >
              {marker.label} · {inr(marker.value)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-12 text-xs text-violet-200/45">
        {budget !== null ? `Your budget: ${inr(budget)}` : 'Add a budget on the home form to compare it here.'}
      </p>
    </div>
  )
}

export default function IdeaAnalyzer() {
  const [idea, setIdea] = useState('')
  const [area, setArea] = useState('')
  const [budget, setBudget] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scenario, setScenario] = useState<'safe' | 'balanced' | 'bold'>('balanced')
  const [tab, setTab] = useState<Tab>('overview')
  const [edge, setEdge] = useState<string[]>([])
  const sourceMap = useMemo(
    () => new Map(analysis?.sources.map((source) => [source.id, source]) ?? []),
    [analysis],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    setAnalysis(null)
    setTab('overview')
    setEdge([])

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, area, budget: budget.replace(/[^\d.]/g, '') || null }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'We could not build the report.')
      setAnalysis(result)
      window.setTimeout(() => {
        document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  function useExample(exampleIdea: string, exampleArea: string, exampleBudget: string) {
    setIdea(exampleIdea)
    setArea(exampleArea)
    setBudget(exampleBudget)
    setError('')
  }

  function toggleEdge(label: string) {
    setEdge((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }

  const fin = analysis?.financials
  const returnTone = fin ? (fin.roi24 >= 0 ? 'good' : 'bad') : 'neutral'

  return (
    <main className="aurora-shell min-h-screen overflow-hidden bg-[#090510] text-white">
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-10">
        <a href="#" className="flex items-center gap-2.5 font-semibold tracking-[-0.03em]">
          <span className="logo-gem grid size-9 place-items-center rounded-xl text-sm text-white">
            I.
          </span>
          <span className="text-lg tracking-[0.18em]">IDEORA</span>
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-violet-200/50 sm:block">
            Built for Beyond 9TO5
          </span>
          <span className="rounded-full border border-violet-300/20 bg-violet-300/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-100 backdrop-blur">
            Powered by SerpApi
          </span>
        </div>
      </nav>

      <section className="relative mx-auto max-w-7xl px-5 pb-24 pt-16 md:px-10 md:pb-32 md:pt-24">
        <div className="orb orb-one absolute -right-44 top-2 size-[460px] rounded-full bg-violet-700/30 blur-3xl md:right-0" />
        <div className="orb orb-two absolute -left-56 top-64 size-[400px] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute left-[15%] top-16 size-24 rounded-full bg-cyan-300/10 blur-2xl" />

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/8 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />
            Live market evidence, not guesswork
          </div>
          <h1 className="text-balance text-5xl font-medium leading-[0.98] tracking-[-0.065em] sm:text-6xl md:text-[82px]">
            Is your business idea
            <span className="gradient-text font-serif italic"> worth it?</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-balance text-base leading-7 text-violet-100/60 md:text-lg">
            See the competition, their weaknesses, and what your budget could earn or lose, grounded
            in live Google Search and Maps results.
          </p>

          <form
            onSubmit={handleSubmit}
            className="glass-panel mx-auto mt-10 max-w-4xl rounded-[28px] p-2.5 text-left shadow-[0_28px_100px_rgba(84,35,160,0.3)]"
          >
            <div className="grid gap-1 md:grid-cols-[1.3fr_1fr_0.85fr_auto]">
              <label className="rounded-2xl px-4 py-3 transition focus-within:bg-white/5">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200/50">
                  Your idea
                </span>
                <input
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  required
                  maxLength={140}
                  placeholder="e.g. a quiet study cafe"
                  className="mt-1 w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-violet-200/30"
                />
              </label>
              <label className="rounded-2xl px-4 py-3 transition focus-within:bg-white/5 md:border-l md:border-violet-200/10">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200/50">
                  Area
                </span>
                <input
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  required
                  maxLength={100}
                  placeholder="City or neighborhood"
                  className="mt-1 w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-violet-200/30"
                />
              </label>
              <label className="rounded-2xl px-4 py-3 transition focus-within:bg-white/5 md:border-l md:border-violet-200/10">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200/50">
                  Budget (₹)
                </span>
                <input
                  value={budget}
                  onChange={(event) => setBudget(event.target.value.replace(/[^\d,]/g, ''))}
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="e.g. 500000"
                  className="mt-1 w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-violet-200/30"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="shine-button flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-violet-500 px-6 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(139,92,246,0.35)] transition hover:-translate-y-0.5 hover:bg-violet-400 disabled:cursor-wait disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Researching
                  </>
                ) : (
                  <>
                    Check my idea
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <p
              role="alert"
              className="mx-auto mt-4 max-w-xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-violet-200/45">
            <span>Try:</span>
            {examples.map(([exampleIdea, exampleArea, exampleBudget]) => (
              <button
                key={exampleIdea}
                type="button"
                onClick={() => useExample(exampleIdea, exampleArea, exampleBudget)}
                className="rounded-full border border-violet-300/15 bg-violet-200/5 px-3 py-1.5 transition hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-violet-300/10 hover:text-white"
              >
                {exampleIdea}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-24 grid gap-3 border-t border-violet-200/10 pt-5 text-left md:grid-cols-3">
          {[
            ['01', 'Describe it', 'Tell us what you want to build, where, and your budget.'],
            ['02', 'We research', 'Live Google Maps, Search, and customer reviews.'],
            ['03', 'Get your report', 'Score, cost and profit forecast, competitor gaps, next steps.'],
          ].map(([number, title, copy]) => (
            <div
              key={number}
              className="flex gap-4 rounded-2xl border border-transparent p-4 transition hover:border-violet-300/10 hover:bg-white/3"
            >
              <span className="font-mono text-xs text-cyan-300">{number}</span>
              <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-violet-200/45">{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {loading && (
        <section className="border-t border-violet-200/10 bg-[#10091b] px-5 py-24 md:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-7 grid size-16 place-items-center rounded-2xl border border-violet-300/20 bg-violet-400/10 shadow-[0_0_50px_rgba(139,92,246,0.3)]">
              <span className="size-6 animate-spin rounded-full border-2 border-violet-300/20 border-t-cyan-300" />
            </div>
            <h2 className="text-3xl font-medium tracking-[-0.04em]">
              Building your evidence brief
            </h2>
            <p className="mt-3 text-violet-200/50">
              Comparing local businesses, reading customer reviews, and modelling your costs…
            </p>
          </div>
        </section>
      )}

      {analysis && fin && (
        <section
          id="report"
          className="report-grid scroll-mt-4 border-t border-violet-200/10 bg-[#0d0715] px-5 py-16 text-white md:px-10"
        >
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                  IDEORA feasibility report
                </p>
                <h2 className="mt-3 max-w-3xl text-4xl font-medium tracking-[-0.05em] md:text-5xl">
                  {analysis.idea}
                </h2>
                <p className="mt-3 text-sm text-violet-200/45">
                  {analysis.area} · {fin.category} · Researched{' '}
                  {new Date(analysis.generatedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-3 md:items-end">
                <div
                  role="tablist"
                  aria-label="Report sections"
                  className="flex flex-wrap gap-1 rounded-full border border-violet-300/15 bg-black/30 p-1 backdrop-blur"
                >
                  {tabs.map((item) => (
                    <button
                      key={item.id}
                      role="tab"
                      type="button"
                      aria-selected={tab === item.id}
                      onClick={() => setTab(item.id)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        tab === item.id
                          ? 'bg-linear-to-r from-violet-400 to-violet-600 text-white shadow-[0_6px_24px_rgba(139,92,246,0.45)]'
                          : 'text-violet-100/60 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAnalysis(null)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="rounded-full border border-violet-300/20 bg-violet-300/5 px-4 py-2 text-xs font-semibold transition hover:border-violet-300/50 hover:bg-violet-300/10"
                >
                  Analyze another idea
                </button>
              </div>
            </div>

            {tab === 'overview' && (
              <div className="mt-8 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiCard
                    icon="◎"
                    label="Opportunity score"
                    value={`${analysis.score}`}
                    note={analysis.outlook}
                    noteTone="neutral"
                    color="#f59e0b"
                    spark={analysis.scoreBreakdown.map((item) => (item.value / item.max) * 100)}
                  />
                  <KpiCard
                    icon="₹"
                    label="Estimated start-up cost"
                    value={inr(fin.startupCost)}
                    note={`${inr(fin.costRange.low)} – ${inr(fin.costRange.high)}`}
                    noteTone="neutral"
                    color="#a78bfa"
                    spark={fin.forecast.expected.map((point) => point.revenue)}
                  />
                  <KpiCard
                    icon="↗"
                    label="Return after 24 months"
                    value={pct(fin.roi24)}
                    note={fin.breakEvenMonth ? `break-even M${fin.breakEvenMonth}` : 'no break-even in 24 mo'}
                    noteTone={returnTone}
                    color="#22d3ee"
                    spark={fin.forecast.expected.map((point) => point.cumulative)}
                  />
                  <KpiCard
                    icon="⚠"
                    label="Loss risk (slow sales, year 1)"
                    value={`${fin.lossRisk12}%`}
                    note={fin.lossRisk12 > 0 ? 'of capital at risk' : 'no loss in year 1'}
                    noteTone={fin.lossRisk12 > 0 ? 'bad' : 'good'}
                    color="#e879f9"
                    spark={fin.forecast.pessimistic.map((point) => point.cumulative)}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.45fr_0.85fr]">
                  <Panel
                    eyebrow="Future outlook"
                    title="Profit or loss forecast"
                    right={
                      <span className="rounded-full border border-violet-300/15 bg-violet-300/8 px-3 py-1 text-[11px] text-violet-100/70">
                        24 months · cumulative
                      </span>
                    }
                  >
                    <p className="mb-5 text-3xl font-semibold tracking-[-0.04em]">
                      {inr(fin.forecast.expected[23].cumulative)}
                      <span
                        className={`ml-3 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${
                          fin.roi24 >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'
                        }`}
                      >
                        {pct(fin.roi24)}
                      </span>
                    </p>
                    <ForecastChart financials={fin} />
                  </Panel>

                  <Panel eyebrow="Confidence" title="Opportunity index">
                    <GaugeMeter score={analysis.score} />
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-violet-200/10 pt-4 text-xs">
                      {analysis.scoreBreakdown.map((item, index) => (
                        <div key={item.label} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-violet-100/65">
                            <span
                              className="size-2 rounded-full"
                              style={{ background: ['#d9f24a', '#22d3ee', '#3b9bff', '#d946ef'][index] }}
                            />
                            {item.label}
                          </span>
                          <span className="font-semibold">{Math.round((item.value / item.max) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
                  <article className="glass-panel rounded-[28px] p-6 md:p-8">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-200">
                      {analysis.outlook}
                    </span>
                    <h3 className="mt-4 text-2xl font-medium tracking-[-0.035em]">The short answer</h3>
                    <p className="mt-2 max-w-2xl leading-7 text-violet-100/60">{analysis.summary}</p>
                  </article>
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-violet-200/10 bg-violet-200/10">
                    {[
                      ['Competitors', analysis.metrics.competitors.toString()],
                      ['Avg. rating', analysis.metrics.averageRating?.toFixed(1) ?? '—'],
                      ['Local reviews', analysis.metrics.totalReviews.toLocaleString()],
                      ['Demand signals', analysis.metrics.demandSignals.toString()],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-[#151020] p-5 transition hover:bg-violet-500/15">
                        <p className="text-2xl font-semibold tracking-[-0.04em]">{value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-violet-200/40">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <MarketPulse analysis={analysis} scenario={scenario} onScenarioChange={setScenario} />

                <div className="grid gap-5 lg:grid-cols-2">
                  <InsightCard title="What customers value" eyebrow="Demand">
                    <ul className="space-y-3">
                      {analysis.likes.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-violet-100/60">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </InsightCard>
                  <InsightCard title="Where competitors fall short" eyebrow="Friction">
                    <ul className="space-y-3">
                      {analysis.complaints.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-violet-100/60">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fuchsia-400 shadow-[0_0_10px_#e879f9]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </InsightCard>
                </div>
              </div>
            )}

            {tab === 'financials' && (
              <div className="mt-8 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Estimated start-up cost', inr(fin.startupCost), `Range ${inr(fin.costRange.low)} – ${inr(fin.costRange.high)}`],
                    ['Monthly running cost', inr(fin.monthlyFixedCost), 'Rent, staff, utilities (before ingredients / stock)'],
                    ['Revenue once established', `${inr(fin.matureMonthlyRevenue)}/mo`, 'Expected case, after ramp-up'],
                    ['Profit margin (month 24)', `${fin.profitMargin}%`, 'After all running costs'],
                  ].map(([label, value, note]) => (
                    <article key={label} className="kpi-card rounded-3xl p-5">
                      <p className="text-sm text-violet-100/70">{label}</p>
                      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
                      <p className="mt-2 text-[11px] leading-4 text-violet-200/45">{note}</p>
                    </article>
                  ))}
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <Panel eyebrow="Profit & loss" title="Where you end up">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        {
                          label: 'After 12 months',
                          value: pct(fin.roi12),
                          good: fin.roi12 >= 0,
                          note: fin.roi12 >= 0 ? 'Profit on capital' : 'Loss on capital',
                        },
                        {
                          label: 'After 24 months',
                          value: pct(fin.roi24),
                          good: fin.roi24 >= 0,
                          note: fin.roi24 >= 0 ? 'Profit on capital' : 'Loss on capital',
                        },
                        {
                          label: 'Break-even',
                          value: fin.breakEvenMonth ? `Month ${fin.breakEvenMonth}` : '24+ mo',
                          good: fin.breakEvenMonth !== null,
                          note: 'Expected case',
                        },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-violet-200/10 bg-black/20 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200/45">{item.label}</p>
                          <p className={`mt-2 text-2xl font-semibold ${item.good ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {item.value}
                          </p>
                          <p className="mt-1 text-[11px] text-violet-200/45">{item.note}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6">
                      <ForecastChart financials={fin} />
                    </div>
                  </Panel>

                  <Panel eyebrow="Your budget" title="Does it cover the plan?">
                    <BudgetMeter financials={fin} />
                    <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-2xl border border-violet-200/10 bg-black/20 p-4">
                        <p className="text-violet-200/45">Cash needed (expected)</p>
                        <p className="mt-1 text-lg font-semibold">{inr(fin.fundingNeeded)}</p>
                      </div>
                      <div className="rounded-2xl border border-violet-200/10 bg-black/20 p-4">
                        <p className="text-violet-200/45">Cash needed (slow sales)</p>
                        <p className="mt-1 text-lg font-semibold">{inr(fin.worstCaseFundingNeeded)}</p>
                      </div>
                    </div>
                  </Panel>
                </div>

                <Panel
                  eyebrow="Monthly view"
                  title="Revenue vs cost, first year"
                  right={
                    <div className="flex gap-4 text-xs text-violet-100/60">
                      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-violet-400" />Revenue</span>
                      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-pink-400" />Cost</span>
                    </div>
                  }
                >
                  <RevenueCostBars points={fin.forecast.expected} />
                </Panel>

                <InsightCard title="Suggestions for your budget" eyebrow="What to do" accent>
                  <ol className="space-y-5">
                    {fin.suggestions.map((suggestion, index) => (
                      <li key={suggestion} className="flex gap-4">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-violet-300/30 bg-violet-300/10 text-xs font-semibold text-violet-200">
                          {index + 1}
                        </span>
                        <p className="pt-0.5 text-sm leading-6 text-violet-100/65">{suggestion}</p>
                      </li>
                    ))}
                  </ol>
                </InsightCard>
                <p className="text-xs leading-5 text-violet-200/35">{fin.assumptionsNote}</p>
              </div>
            )}

            {tab === 'competitors' && (
              <div className="mt-8 space-y-5">
                <Panel
                  eyebrow="Build your edge"
                  title="What competitors are lacking"
                  right={
                    <span className="text-xs text-violet-200/45">Tap “Add to my idea” on any gap</span>
                  }
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    {analysis.opportunities.length === 0 && (
                      <p className="text-sm text-violet-200/50">
                        No repeated weakness stood out. Compete on a narrower niche or a clearer promise.
                      </p>
                    )}
                    {analysis.opportunities.map((opportunity) => {
                      const added = edge.includes(opportunity.label)
                      return (
                        <article
                          key={opportunity.label}
                          className={`rounded-2xl border p-5 transition ${
                            added
                              ? 'border-cyan-300/40 bg-cyan-300/8'
                              : 'border-violet-200/10 bg-black/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="text-sm font-semibold">{opportunity.label}</h4>
                            <span className="shrink-0 rounded-full bg-fuchsia-400/15 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-200">
                              {opportunity.competitorsAffected} competitor{opportunity.competitorsAffected === 1 ? '' : 's'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-violet-100/55">{opportunity.addToIdea}</p>
                          <button
                            type="button"
                            onClick={() => toggleEdge(opportunity.label)}
                            aria-pressed={added}
                            className={`mt-4 rounded-full px-4 py-2 text-xs font-semibold transition ${
                              added
                                ? 'bg-cyan-300 text-[#0d0715]'
                                : 'border border-violet-300/30 bg-violet-300/10 hover:bg-violet-300/20'
                            }`}
                          >
                            {added ? '✓ Added to my idea' : '+ Add to my idea'}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </Panel>

                <article className="next-steps-card rounded-[28px] p-7 md:p-9">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Your idea, upgraded</p>
                  <h3 className="mt-2 text-2xl font-medium tracking-[-0.035em]">{analysis.idea}</h3>
                  {edge.length === 0 ? (
                    <p className="mt-4 text-sm text-violet-100/55">
                      Add gaps from above and they appear here as the promises your business makes
                      that competitors do not.
                    </p>
                  ) : (
                    <ul className="mt-5 space-y-3">
                      {analysis.opportunities
                        .filter((opportunity) => edge.includes(opportunity.label))
                        .map((opportunity) => (
                          <li key={opportunity.label} className="flex gap-3 text-sm leading-6 text-violet-100/75">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
                            <span>
                              <strong className="text-white">{opportunity.label}:</strong> {opportunity.addToIdea}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </article>

                <section className="glass-panel overflow-hidden rounded-[28px]">
                  <div className="flex flex-col justify-between gap-2 border-b border-violet-200/10 p-7 sm:flex-row sm:items-end md:px-9">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Local landscape</p>
                      <h3 className="mt-2 text-2xl font-medium tracking-[-0.035em]">Competitor by competitor</h3>
                    </div>
                    <span className="text-xs text-violet-200/40">Top Google Maps matches</span>
                  </div>
                  {analysis.competitors.length > 0 ? (
                    <div className="divide-y divide-violet-200/10">
                      {analysis.competitors.map((competitor, index) => (
                        <div key={`${competitor.name}-${index}`} className="px-7 py-5 transition hover:bg-violet-400/7 md:px-9">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold">{competitor.name}</h4>
                              <p className="mt-1 truncate text-xs text-violet-200/40">
                                {competitor.type} · {competitor.address}
                              </p>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="flex items-center gap-1.5 font-semibold">
                                <span className="text-violet-300">★</span>
                                {competitor.rating?.toFixed(1) ?? '—'}
                              </span>
                              <span className="text-xs text-violet-200/40">
                                {competitor.reviews?.toLocaleString() ?? '—'} reviews
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {competitor.weaknesses.map((weakness) => (
                              <span
                                key={weakness.label}
                                title={weakness.detail}
                                className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/8 px-3 py-1 text-[11px] text-fuchsia-100/80"
                              >
                                {weakness.label}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-violet-200/40">
                            {competitor.weaknesses[0].detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-9 text-sm leading-6 text-violet-200/45">
                      No close matches appeared in the first Maps result set. Try a broader category
                      description to confirm the local landscape.
                    </p>
                  )}
                </section>
              </div>
            )}

            {tab === 'actions' && (
              <div className="mt-8 space-y-5">
                <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                  <InsightCard title="Your opening" eyebrow="Market gaps" accent>
                    <ol className="space-y-5">
                      {analysis.gaps.map((gap, index) => (
                        <li key={gap} className="flex gap-4">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-violet-300/30 bg-violet-300/10 text-xs font-semibold text-violet-200">
                            {index + 1}
                          </span>
                          <p className="pt-0.5 text-sm leading-6 text-violet-100/65">{gap}</p>
                        </li>
                      ))}
                    </ol>
                  </InsightCard>

                  <article className="next-steps-card rounded-[28px] p-7 text-white md:p-9">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Your next 7 days</p>
                    <h3 className="mt-2 text-2xl font-medium tracking-[-0.035em]">Test before you invest</h3>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      {analysis.nextSteps.map((step, index) => (
                        <div key={step} className="rounded-2xl border border-white/8 bg-white/6 p-4">
                          <span className="font-mono text-xs text-cyan-300">0{index + 1}</span>
                          <p className="mt-5 text-sm leading-6 text-violet-100/65">{step}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>

                <section className="mt-9 border-t border-violet-200/10 pt-9">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Evidence ledger</p>
                      <h3 className="mt-2 text-2xl font-medium tracking-[-0.035em]">See every source</h3>
                    </div>
                    <p className="text-xs text-violet-200/40">Live results may change over time.</p>
                  </div>
                  <div className="mt-5 grid gap-2">
                    {analysis.sources.map((source) => (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-4 rounded-2xl border border-violet-200/10 bg-violet-200/3 px-4 py-3 transition hover:-translate-y-0.5 hover:border-violet-300/30 hover:bg-violet-300/8"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-400/15 text-[10px] font-bold text-violet-200">
                          {source.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{source.title}</span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-200/35">{source.kind}</span>
                        <span className="text-violet-200/35 transition group-hover:translate-x-0.5 group-hover:text-cyan-300">↗</span>
                      </a>
                    ))}
                  </div>
                  {sourceMap.size > 0 && (
                    <p className="mt-5 text-xs leading-5 text-violet-200/35">
                      IDEORA analyzes public business listings, ratings, review snippets, and search
                      result snippets. Cost and profit figures are planning estimates. It is a
                      research aid, not financial advice.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="border-t border-violet-200/10 bg-[#090510] px-5 py-6 text-xs text-violet-200/35 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 sm:flex-row">
          <span>IDEORA · Evidence before investment</span>
          <span>Google data via SerpApi</span>
        </div>
      </footer>
    </main>
  )
}

type Scenario = 'safe' | 'balanced' | 'bold'

function MarketPulse({
  analysis,
  scenario,
  onScenarioChange,
}: {
  analysis: Analysis
  scenario: Scenario
  onScenarioChange: (scenario: Scenario) => void
}) {
  const adjustments: Record<Scenario, number> = { safe: -3, balanced: 6, bold: 14 }
  const projected = Math.min(98, Math.max(20, analysis.score + adjustments[scenario]))
  const values = [
    Math.max(15, analysis.score - 14),
    Math.max(20, analysis.score - 8),
    analysis.score,
    projected,
  ]
  const points = values.map((value, index) => `${25 + index * 92},${145 - value * 1.12}`).join(' ')

  return (
    <section className="market-pulse mt-5 grid overflow-hidden rounded-[28px] border border-violet-200/10 lg:grid-cols-[0.72fr_1.28fr]">
      <div className="border-b border-violet-200/10 p-7 lg:border-b-0 lg:border-r md:p-9">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
          Strategy simulator
        </p>
        <h3 className="mt-2 text-2xl font-medium tracking-[-0.035em]">Play with your approach</h3>
        <p className="mt-3 text-sm leading-6 text-violet-100/50">
          Explore how positioning intensity could change your opportunity outlook.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-violet-200/10 bg-black/20 p-1.5">
          {(['safe', 'balanced', 'bold'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onScenarioChange(option)}
              className={`rounded-xl px-3 py-2.5 text-[11px] font-semibold capitalize transition ${
                scenario === option
                  ? 'bg-violet-500 text-white shadow-[0_5px_25px_rgba(139,92,246,0.4)]'
                  : 'text-violet-200/45 hover:bg-white/5 hover:text-white'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="mt-6 flex items-end gap-2">
          <span className="text-4xl font-semibold tracking-[-0.06em]">{projected}</span>
          <span className="mb-1.5 text-xs font-semibold text-emerald-300">
            {projected >= analysis.score
              ? `+${projected - analysis.score}`
              : projected - analysis.score}{' '}
            potential
          </span>
        </div>
      </div>

      <div className="relative min-h-64 p-6 md:p-9">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-violet-100/70">Opportunity curve</span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-violet-200/35">
            <span className="size-1.5 rounded-full bg-cyan-300" />
            Live model
          </span>
        </div>
        <svg
          viewBox="0 0 330 170"
          className="h-44 w-full overflow-visible"
          aria-label="Opportunity curve"
        >
          {[35, 75, 115, 155].map((y) => (
            <line
              key={y}
              x1="20"
              y1={y}
              x2="310"
              y2={y}
              stroke="rgba(216,180,254,0.1)"
              strokeDasharray="4 6"
            />
          ))}
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#a78bfa" stopOpacity="0.4" />
              <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#67e8f9" />
            </linearGradient>
          </defs>
          <polygon points={`25,155 ${points} 301,155`} fill="url(#chartFill)" />
          <polyline
            points={points}
            fill="none"
            stroke="url(#chartLine)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {values.map((value, index) => (
            <g key={`${value}-${index}`}>
              <circle
                cx={25 + index * 92}
                cy={145 - value * 1.12}
                r="7"
                fill="#130b20"
                stroke={index === values.length - 1 ? '#67e8f9' : '#a78bfa'}
                strokeWidth="3"
              />
              <text
                x={25 + index * 92}
                y={166}
                textAnchor="middle"
                fill="rgba(237,233,254,0.45)"
                fontSize="9"
              >
                {['Discover', 'Validate', 'Launch', 'Scale'][index]}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}

function InsightCard({
  title,
  eyebrow,
  accent = false,
  children,
}: {
  title: string
  eyebrow: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <article
      className={`rounded-[28px] border p-7 md:p-9 ${
        accent ? 'border-fuchsia-300/15 bg-fuchsia-400/6' : 'border-violet-200/10 bg-violet-200/4'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p>
      <h3 className="mb-6 mt-2 text-2xl font-medium tracking-[-0.035em]">{title}</h3>
      {children}
    </article>
  )
}
