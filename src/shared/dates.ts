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

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd)
  if (!d) return ymd
  d.setDate(d.getDate() + days)
  return formatYmd(d)
}
