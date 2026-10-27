import { useEffect, useState } from 'react'
import {
  calendarDaysBetween,
  formatYmd,
  testCountdownMeterPercent,
  testDateCountdownLabel
} from '../../shared/dates'

/** Daily-use test countdown — progress-bar weight; date editing is secondary. */
export default function TestCountdownStrip({
  projectId,
  refreshKey,
  showStatus
}: {
  projectId: string
  refreshKey: number
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [testDate, setTestDate] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const today = formatYmd(new Date())

  const reload = async () => {
    const td = await window.studyHub.getProjectTestDate(projectId)
    setTestDate(td)
    setDraft(td ?? '')
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey])

  const days = testDate ? calendarDaysBetween(today, testDate) : null
  const meter = testCountdownMeterPercent(days)
  const label = testDate ? testDateCountdownLabel(testDate, today) : null

  return (
    <div className="test-countdown-strip completion-bar" aria-label="Test date countdown">
      <div className="completion-bar-head">
        <span className="completion-bar-label">Test countdown</span>
        {days != null ? (
          <span className="completion-bar-pct test-countdown-days">
            {days > 0 ? `${days} days` : days === 0 ? 'Today' : `${Math.abs(days)} days ago`}
          </span>
        ) : (
          <span className="completion-bar-pct">Not set</span>
        )}
      </div>
      {meter != null ? (
        <div
          className="progress-meter"
          role="progressbar"
          aria-valuenow={meter}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? 'Test countdown'}
        >
          <span style={{ width: `${meter}%` }} />
        </div>
      ) : (
        <div className="progress-meter progress-meter-empty" aria-hidden="true">
          <span style={{ width: '0%' }} />
        </div>
      )}
      <div className="test-countdown-foot">
        {label ? <p className="meta completion-bar-extra">{label}</p> : (
          <p className="meta completion-bar-extra">Add your MCAT or test date to track days remaining.</p>
        )}
        {!editing ? (
          <button type="button" className="linkish" onClick={() => setEditing(true)}>
            {testDate ? 'Change date' : 'Set test date'}
          </button>
        ) : (
          <form
            className="test-countdown-edit"
            onSubmit={async (e) => {
              e.preventDefault()
              const saved = await window.studyHub.setProjectTestDate(projectId, draft.trim() || null)
              setTestDate(saved)
              setDraft(saved ?? '')
              setEditing(false)
              showStatus(saved ? `Test date saved: ${saved}` : 'Test date cleared.')
            }}
          >
            <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" className="btn btn-secondary">
              Save
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
