/** Inclusive YYYY-MM-DD range → list of dates (local calendar, noon-safe). */
export function eachDateInclusive(startYmd: string, endYmd: string): string[] {
  const start = parseYmd(startYmd)
  const end = parseYmd(endYmd)
  if (!start || !end) return []
  if (end.getTime() < start.getTime()) return eachDateInclusive(endYmd, startYmd)

  const out: string[] = []
  const cur = new Date(start)
  while (cur.getTime() <= end.getTime()) {
    out.push(formatYmd(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  if (Number.isNaN(d.getTime())) return null
  return d
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local YYYY-MM-DD from an ISO timestamp (or already-YMD string). */
export function localYmdFromTimestamp(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return formatYmd(d)
}

/**
 * Calendar marker buckets:
 * - Yellow (planned): incomplete items on their scheduled forDate
 * - Green (done): completed items on the local day of completedAt only (never on forDate after done)
 */
export function calendarDayStatusCounts(
  items: Array<{ completed: boolean; forDate: string; completedAt: string | null }>
): Map<string, { planned: number; done: number }> {
  const map = new Map<string, { planned: number; done: number }>()
  const bump = (ymd: string, key: 'planned' | 'done') => {
    const cur = map.get(ymd) ?? { planned: 0, done: 0 }
    cur[key] += 1
    map.set(ymd, cur)
  }
  for (const item of items) {
    if (item.completed) {
      const doneDay = localYmdFromTimestamp(item.completedAt)
      if (doneDay) bump(doneDay, 'done')
    } else if (item.forDate) {
      bump(item.forDate, 'planned')
    }
  }
  return map
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd)
  if (!d) return ymd
  d.setDate(d.getDate() + days)
  return formatYmd(d)
}

/** Whole local calendar days from `fromYmd` to `toYmd` (can be negative if past). */
export function calendarDaysBetween(fromYmd: string, toYmd: string): number | null {
  const from = parseYmd(fromYmd)
  const to = parseYmd(toYmd)
  if (!from || !to) return null
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

/** Friendly countdown copy for a test/exam date. */
export function testDateCountdownLabel(testYmd: string, todayYmd: string): string {
  const days = calendarDaysBetween(todayYmd, testYmd)
  if (days == null) return 'Test date looks invalid — pick a new one.'
  if (days > 1) return `${days} days until your test`
  if (days === 1) return '1 day until your test'
  if (days === 0) return 'Test day is today'
  if (days === -1) return 'Test date was yesterday'
  return `Test date was ${Math.abs(days)} days ago`
}

/** 0–100 meter fill: fuller as the test date approaches (caps at ~90-day horizon). */
export function testCountdownMeterPercent(daysRemaining: number | null): number | null {
  if (daysRemaining == null) return null
  if (daysRemaining <= 0) return 100
  const horizon = 90
  return Math.max(4, Math.min(100, Math.round(100 * (1 - Math.min(daysRemaining, horizon) / horizon))))
}

/** Sunday-start week containing `ymd`. */
export function weekRangeContaining(ymd: string): { start: string; end: string; days: string[] } {
  const d = parseYmd(ymd) ?? new Date()
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start)
    cur.setDate(start.getDate() + i)
    days.push(formatYmd(cur))
  }
  return { start: days[0], end: days[6], days }
}

/** Full month grid (Sun–Sat), including leading/trailing days from adjacent months. */
export function monthGridContaining(ymd: string): {
  year: number
  month: number
  /** 0-indexed month label helper */
  monthIndex: number
  days: Array<{ ymd: string; inMonth: boolean }>
} {
  const d = parseYmd(ymd) ?? new Date()
  const year = d.getFullYear()
  const monthIndex = d.getMonth()
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const days: Array<{ ymd: string; inMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start)
    cur.setDate(start.getDate() + i)
    days.push({ ymd: formatYmd(cur), inMonth: cur.getMonth() === monthIndex })
  }
  return { year, month: monthIndex + 1, monthIndex, days }
}

export function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
}
