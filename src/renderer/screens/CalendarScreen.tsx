import { useEffect, useMemo, useState } from 'react'
import type { QueueItem, ResourceCard } from '../../shared/types'
import {
  addDaysYmd,
  calendarDayStatusCounts,
  formatYmd,
  monthGridContaining,
  monthLabel,
  weekRangeContaining
} from '../../shared/dates'

type CalMode = 'week' | 'month'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarScreen({
  projectId,
  refreshKey,
  onOpenResource,
  onUpdateProgress,
  onChanged,
  showStatus
}: {
  projectId: string
  refreshKey: number
  onOpenResource: (
    resource: Pick<ResourceCard, 'locationKind' | 'locationValue' | 'id'>
  ) => Promise<{ ok: boolean; noLink?: boolean; message?: string }> | { ok: boolean; noLink?: boolean; message?: string }
  onUpdateProgress: (id: string) => void
  onChanged: () => void
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [mode, setMode] = useState<CalMode>('month')
  const [anchor, setAnchor] = useState(() => formatYmd(new Date()))
  const [selected, setSelected] = useState(() => formatYmd(new Date()))
  const [rangeItems, setRangeItems] = useState<QueueItem[]>([])
  const [dayItems, setDayItems] = useState<QueueItem[]>([])
  const [resources, setResources] = useState<ResourceCard[]>([])

  const week = useMemo(() => weekRangeContaining(anchor), [anchor])
  const month = useMemo(() => monthGridContaining(anchor), [anchor])
  const today = formatYmd(new Date())

  const rangeStart = mode === 'week' ? week.start : month.days[0].ymd
  const rangeEnd = mode === 'week' ? week.end : month.days[month.days.length - 1].ymd

  /** Yellow on planned forDate while open; green only on completion day after done. */
  const dayStatus = useMemo(() => calendarDayStatusCounts(rangeItems), [rangeItems])

  const byId = useMemo(() => {
    const map = new Map<string, ResourceCard>()
    for (const r of resources) map.set(r.id, r)
    return map
  }, [resources])

  useEffect(() => {
    void (async () => {
      setRangeItems(await window.studyHub.listQueueInRange(projectId, rangeStart, rangeEnd))
      setResources(await window.studyHub.listResources(projectId))
    })()
  }, [projectId, refreshKey, rangeStart, rangeEnd])

  useEffect(() => {
    void (async () => {
      setDayItems(await window.studyHub.listQueueForDate(projectId, selected, true))
    })()
  }, [projectId, selected, refreshKey])

  const shiftAnchor = (dir: -1 | 1) => {
    if (mode === 'week') {
      setAnchor(addDaysYmd(anchor, dir * 7))
    } else {
      const d = new Date(month.year, month.monthIndex + dir, 1, 12)
      setAnchor(formatYmd(d))
    }
  }

  const heading =
    mode === 'week'
      ? `${week.start} – ${week.end}`
      : monthLabel(month.year, month.monthIndex)

  const renderDayCell = (ymd: string, inMonth: boolean) => {
    const status = dayStatus.get(ymd) ?? { planned: 0, done: 0 }
    const hasAny = status.planned > 0 || status.done > 0
    const isSelected = ymd === selected
    const isToday = ymd === today
    const dayNum = Number(ymd.slice(8, 10))
    const dots: Array<'done' | 'planned'> = []
    for (let i = 0; i < Math.min(status.done, 3); i++) dots.push('done')
    for (let i = 0; i < Math.min(status.planned, 3 - dots.length); i++) dots.push('planned')
    const labelBits: string[] = []
    if (status.done) labelBits.push(`${status.done} done`)
    if (status.planned) labelBits.push(`${status.planned} planned`)
    return (
      <button
        key={ymd}
        type="button"
        className={[
          'cal-day',
          inMonth ? '' : 'is-outside',
          isSelected ? 'is-selected' : '',
          isToday ? 'is-today' : '',
          hasAny ? 'has-todos' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => setSelected(ymd)}
        aria-pressed={isSelected}
        aria-label={`${ymd}${labelBits.length ? `, ${labelBits.join(', ')}` : ''}`}
      >
        <span className="cal-day-num">{dayNum}</span>
        {dots.length > 0 && (
          <span className="cal-day-dots" aria-hidden>
            {dots.map((kind, i) => (
              <i key={`${kind}-${i}`} className={kind === 'done' ? 'is-done' : 'is-planned'} />
            ))}
          </span>
        )}
      </button>
    )
  }

  return (
    <div>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Calendar</h2>
            <p>
              Monitor your plan in advance.{' '}
              <span className="cal-legend-dot is-planned" aria-hidden /> Yellow = planned that day ·{' '}
              <span className="cal-legend-dot is-done" aria-hidden /> Green = completed that day (when you marked it
              done).
            </p>
          </div>
        </div>
        <div className="tablist" role="tablist" aria-label="Calendar view">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={mode === 'week'}
            onClick={() => setMode('week')}
          >
            Weekly
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={mode === 'month'}
            onClick={() => setMode('month')}
          >
            Monthly
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="cal-toolbar">
          <button type="button" className="btn btn-ghost" onClick={() => shiftAnchor(-1)}>
            Previous
          </button>
          <h3 className="cal-heading">{heading}</h3>
          <button type="button" className="btn btn-ghost" onClick={() => shiftAnchor(1)}>
            Next
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const t = formatYmd(new Date())
              setAnchor(t)
              setSelected(t)
            }}
          >
            Today
          </button>
        </div>

        <div className="cal-weekdays" aria-hidden>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {mode === 'week' ? (
          <div className="cal-grid cal-grid-week">
            {week.days.map((ymd) => renderDayCell(ymd, true))}
          </div>
        ) : (
          <div className="cal-grid cal-grid-month">
            {month.days.map((cell) => renderDayCell(cell.ymd, cell.inMonth))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{selected === today ? 'Today’s tasks' : `Tasks for ${selected}`}</h2>
            <p className="meta" style={{ margin: 0 }}>
              {dayItems.length === 0
                ? 'Nothing planned this day yet.'
                : `${dayItems.length} task${dayItems.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        {dayItems.length > 0 && (
          <div className="queue-list">
            {dayItems.map((item) => {
              const linked = item.resourceId ? byId.get(item.resourceId) : null
              return (
                <article
                  key={item.id}
                  className={`queue-item${item.completed ? ' is-complete' : ''}`}
                >
                  <p className="queue-desc">
                    {item.completed ? '✓ ' : ''}
                    {item.description}
                  </p>
                  <p className="meta">
                    {item.completed ? 'Done' : 'Planned'}
                    {item.estimatedMinutes != null ? ` · About ${item.estimatedMinutes} minutes` : ''}
                    {linked ? ` · ${linked.name}` : ''}
                  </p>
                  <div className="btn-row">
                    {linked && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void onOpenResource(linked)}
                        >
                          Open resource
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => onUpdateProgress(linked.id)}
                        >
                          Update progress
                        </button>
                      </>
                    )}
                    {!item.completed && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={async () => {
                          await window.studyHub.completeQueueItem(item.id)
                          showStatus('Marked complete.')
                          onChanged()
                        }}
                      >
                        Mark complete
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
