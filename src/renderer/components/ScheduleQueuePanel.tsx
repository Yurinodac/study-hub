import { useEffect, useState } from 'react'
import type { ResourceCard } from '../../shared/types'
import { formatYmd } from '../../shared/dates'

type ScheduleMode = 'today' | 'tomorrow' | 'date' | 'range'

function todayYmd(): string {
  return formatYmd(new Date())
}

function tomorrowYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return formatYmd(d)
}

/** Calendar / multi-day queue scheduler (Today page, or locked to one resource on Progress). */
export default function ScheduleQueuePanel({
  projectId,
  resources = [],
  defaultResourceId = '',
  lockedResourceId,
  lockedResourceName,
  title = 'Schedule a study task',
  help = 'Add a task to Today, Tomorrow, one date, or several days at once.',
  onScheduled,
  showStatus
}: {
  projectId: string
  resources?: ResourceCard[]
  /** Pre-select a linked resource when the picker is shown. */
  defaultResourceId?: string
  /** When set, tasks always link to this resource and the picker is hidden. */
  lockedResourceId?: string
  lockedResourceName?: string
  title?: string
  help?: string
  onScheduled: () => void
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [newDesc, setNewDesc] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const [newResourceId, setNewResourceId] = useState(lockedResourceId || defaultResourceId)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('today')
  const [pickDate, setPickDate] = useState(() => todayYmd())
  const [rangeEnd, setRangeEnd] = useState(() => tomorrowYmd())

  useEffect(() => {
    if (lockedResourceId) setNewResourceId(lockedResourceId)
    else if (defaultResourceId) setNewResourceId(defaultResourceId)
  }, [lockedResourceId, defaultResourceId])

  return (
    <div className="schedule-panel">
      <div className="section-head" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="meta" style={{ margin: '0.25rem 0 0' }}>
            {help}
          </p>
          {lockedResourceId && lockedResourceName ? (
            <p className="meta" style={{ margin: '0.35rem 0 0' }}>
              Linked to: <strong>{lockedResourceName}</strong>
            </p>
          ) : null}
        </div>
      </div>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!newDesc.trim()) return
          const resourceId = lockedResourceId || newResourceId || null
          const base = {
            projectId,
            resourceId,
            description: newDesc.trim(),
            estimatedMinutes: newMinutes ? Number(newMinutes) : null
          }
          if (scheduleMode === 'today') {
            await window.studyHub.addQueueItem({ ...base, when: 'today' })
            showStatus('Added to Today’s queue.')
          } else if (scheduleMode === 'tomorrow') {
            await window.studyHub.addQueueItem({ ...base, when: 'tomorrow' })
            showStatus('Added to Tomorrow’s queue.')
          } else if (scheduleMode === 'date') {
            await window.studyHub.addQueueItemsForDates({ ...base, startDate: pickDate })
            showStatus(`Added for ${pickDate}.`)
          } else {
            const items = await window.studyHub.addQueueItemsForDates({
              ...base,
              startDate: pickDate,
              endDate: rangeEnd
            })
            showStatus(`Added to ${items.length} day${items.length === 1 ? '' : 's'}.`)
          }
          setNewDesc('')
          setNewMinutes('')
          if (!lockedResourceId) setNewResourceId(defaultResourceId || '')
          setScheduleMode('today')
          onScheduled()
        }}
      >
        <label>
          Task
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="e.g. Review CARS passages"
            required
            autoComplete="off"
            name="schedule-queue-desc"
          />
        </label>
        <label>
          Estimated minutes (optional)
          <input
            type="number"
            min={1}
            value={newMinutes}
            onChange={(e) => setNewMinutes(e.target.value)}
            placeholder="45"
            name="schedule-queue-minutes"
          />
        </label>
        {!lockedResourceId && (
          <label>
            Linked resource (optional)
            <select
              value={newResourceId}
              onChange={(e) => setNewResourceId(e.target.value)}
              name="schedule-queue-resource"
            >
              <option value="">None</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.isSample ? 'SAMPLE · ' : ''}
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          When
          <select
            value={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.value as ScheduleMode)}
            name="schedule-queue-when"
          >
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="date">Pick a date</option>
            <option value="range">Several days (date range)</option>
          </select>
        </label>
        {(scheduleMode === 'date' || scheduleMode === 'range') && (
          <label>
            {scheduleMode === 'range' ? 'From date' : 'Date'}
            <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} required />
          </label>
        )}
        {scheduleMode === 'range' && (
          <label>
            Through date
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} required />
          </label>
        )}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">
            Add to calendar / queue
          </button>
        </div>
      </form>
    </div>
  )
}
