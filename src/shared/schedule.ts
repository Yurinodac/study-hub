import { addDaysYmd, formatYmd, parseYmd } from './dates'

/** How a next-action / queue item is scheduled onto calendar days. */
export type QueueScheduleMode = 'none' | 'today' | 'tomorrow' | 'dates' | 'recur'

export type RecurrenceFreq = 'daily' | 'weekdays' | 'weekly' | 'every_n'

export type QueueScheduleValue =
  | { mode: 'none' }
  | { mode: 'today' }
  | { mode: 'tomorrow' }
  | { mode: 'dates'; dates: string[] }
  | {
      mode: 'recur'
      startDate: string
      freq: RecurrenceFreq
      /** For every_n: repeat every N days (min 1). */
      interval: number
      /** For weekly: which weekdays (0=Sun … 6=Sat). Empty = same weekday as start. */
      weekdays: number[]
      endMode: 'count' | 'until'
      count: number
      untilDate: string
    }

export const MAX_SCHEDULE_OCCURRENCES = 90

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[((day % 7) + 7) % 7] ?? String(day)
}

/**
 * Expand a recurrence rule into concrete YYYY-MM-DD dates (local calendar).
 * Caps at MAX_SCHEDULE_OCCURRENCES.
 */
export function expandRecurrence(input: {
  startDate: string
  freq: RecurrenceFreq
  interval?: number
  weekdays?: number[]
  endMode: 'count' | 'until'
  count?: number
  untilDate?: string
}): string[] {
  const start = parseYmd(input.startDate)
  if (!start) return []

  const interval = Math.max(1, Math.floor(input.interval ?? 1))
  const countCap =
    input.endMode === 'count'
      ? Math.min(MAX_SCHEDULE_OCCURRENCES, Math.max(1, Math.floor(input.count ?? 1)))
      : MAX_SCHEDULE_OCCURRENCES
  const until =
    input.endMode === 'until' && input.untilDate
      ? parseYmd(input.untilDate)
      : null

  const weekdays =
    input.freq === 'weekly'
      ? input.weekdays?.length
        ? Array.from(new Set(input.weekdays.map((d) => ((d % 7) + 7) % 7)))
        : [start.getDay()]
      : input.freq === 'weekdays'
        ? [1, 2, 3, 4, 5]
        : null

  const out: string[] = []
  const cursor = new Date(start)

  // Safety bound: walk at most ~2 years of days.
  for (let step = 0; step < 800 && out.length < countCap; step++) {
    const ymd = formatYmd(cursor)
    if (until && cursor.getTime() > until.getTime()) break

    let include = false
    if (input.freq === 'daily') {
      const daysFromStart = Math.round((cursor.getTime() - start.getTime()) / 86400000)
      include = daysFromStart >= 0 && daysFromStart % interval === 0
    } else if (input.freq === 'every_n') {
      const daysFromStart = Math.round((cursor.getTime() - start.getTime()) / 86400000)
      include = daysFromStart >= 0 && daysFromStart % interval === 0
    } else if (weekdays) {
      include = weekdays.includes(cursor.getDay()) && cursor.getTime() >= start.getTime()
      if (include && input.freq === 'weekly' && interval > 1) {
        const daysFromStart = Math.round((cursor.getTime() - start.getTime()) / 86400000)
        const weeksFromStart = Math.floor(daysFromStart / 7)
        include = weeksFromStart % interval === 0
      }
    }

    if (include) {
      out.push(ymd)
      if (input.endMode === 'count' && out.length >= countCap) break
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return out
}

/** Resolve a schedule value into concrete queue dates (empty = don’t add). */
export function resolveScheduleDates(schedule: QueueScheduleValue, todayYmd: string): string[] {
  if (schedule.mode === 'none') return []
  if (schedule.mode === 'today') return [todayYmd]
  if (schedule.mode === 'tomorrow') return [addDaysYmd(todayYmd, 1)]
  if (schedule.mode === 'dates') {
    const unique = Array.from(new Set(schedule.dates.map((d) => d.trim()).filter(Boolean))).sort()
    return unique.slice(0, MAX_SCHEDULE_OCCURRENCES)
  }
  return expandRecurrence({
    startDate: schedule.startDate,
    freq: schedule.freq,
    interval: schedule.interval,
    weekdays: schedule.weekdays,
    endMode: schedule.endMode,
    count: schedule.count,
    untilDate: schedule.untilDate
  })
}

export function defaultQueueSchedule(includeNone: boolean): QueueScheduleValue {
  return includeNone ? { mode: 'none' } : { mode: 'today' }
}

export function scheduleStatusMessage(dates: string[], prefix = ''): string {
  const n = dates.length
  if (n === 0) return `${prefix}`.trim() || 'Nothing scheduled.'
  if (n === 1) return `${prefix}${prefix ? ' ' : ''}Scheduled for ${dates[0]}.`.trim()
  return `${prefix}${prefix ? ' ' : ''}Added to ${n} days (${dates[0]} … ${dates[n - 1]}).`.trim()
}
