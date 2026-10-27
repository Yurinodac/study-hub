import { useState } from 'react'
import type { QueueScheduleMode, QueueScheduleValue, RecurrenceFreq } from '../../shared/schedule'
import { weekdayLabel } from '../../shared/schedule'
import { formatYmd } from '../../shared/dates'

/**
 * Compact next-action / queue date control (Today, Tomorrow, specific dates, or repeat).
 * Built to feel closer to a calendar picker without a huge new page section.
 */
export default function QueueScheduleFields({
  value,
  onChange,
  allowNone = false,
  label = 'When'
}: {
  value: QueueScheduleValue
  onChange: (next: QueueScheduleValue) => void
  allowNone?: boolean
  label?: string
}) {
  const [draftDate, setDraftDate] = useState(() => formatYmd(new Date()))
  const mode: QueueScheduleMode = value.mode

  const setMode = (next: QueueScheduleMode) => {
    if (next === 'none') onChange({ mode: 'none' })
    else if (next === 'today') onChange({ mode: 'today' })
    else if (next === 'tomorrow') onChange({ mode: 'tomorrow' })
    else if (next === 'dates') {
      onChange({
        mode: 'dates',
        dates: value.mode === 'dates' ? value.dates : [formatYmd(new Date())]
      })
    } else {
      const start = formatYmd(new Date())
      onChange({
        mode: 'recur',
        startDate: start,
        freq: 'daily',
        interval: 1,
        weekdays: [new Date().getDay()],
        endMode: 'count',
        count: 7,
        untilDate: start
      })
    }
  }

  return (
    <div className="queue-schedule">
      <label>
        {label}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as QueueScheduleMode)}
          name="queue-schedule-mode"
        >
          {allowNone && <option value="none">Don’t add to queue</option>}
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="dates">Specific dates</option>
          <option value="recur">Repeat (daily / weekly…)</option>
        </select>
      </label>

      {value.mode === 'dates' && (
        <div className="queue-schedule-dates">
          <label>
            Add a date
            <span className="queue-schedule-add-row">
              <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (!draftDate) return
                  if (value.dates.includes(draftDate)) return
                  onChange({ mode: 'dates', dates: [...value.dates, draftDate].sort() })
                }}
              >
                Add
              </button>
            </span>
          </label>
          {value.dates.length === 0 ? (
            <p className="meta">No dates yet — add one or more days for this task.</p>
          ) : (
            <div className="chip-row" aria-label="Selected dates">
              {value.dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip is-selected"
                  title="Remove date"
                  onClick={() =>
                    onChange({ mode: 'dates', dates: value.dates.filter((x) => x !== d) })
                  }
                >
                  {d} ×
                </button>
              ))}
            </div>
          )}
          <p className="helper-text">Tip: click a date chip to remove it. One queue item is created per day.</p>
        </div>
      )}

      {value.mode === 'recur' && (
        <div className="queue-schedule-recur form-grid">
          <label>
            Starts
            <input
              type="date"
              value={value.startDate}
              onChange={(e) => onChange({ ...value, startDate: e.target.value })}
              required
            />
          </label>
          <label>
            Repeat
            <select
              value={value.freq}
              onChange={(e) =>
                onChange({ ...value, freq: e.target.value as RecurrenceFreq, interval: 1 })
              }
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays (Mon–Fri)</option>
              <option value="weekly">Weekly (pick days)</option>
              <option value="every_n">Every N days</option>
            </select>
          </label>
          {value.freq === 'every_n' && (
            <label>
              Every how many days?
              <input
                type="number"
                min={1}
                max={60}
                value={value.interval}
                onChange={(e) =>
                  onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </label>
          )}
          {value.freq === 'weekly' && (
            <fieldset className="chip-fieldset">
              <legend>On these days</legend>
              <div className="chip-row">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const on = value.weekdays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`chip ${on ? 'is-selected' : ''}`}
                      onClick={() => {
                        const weekdays = on
                          ? value.weekdays.filter((x) => x !== d)
                          : [...value.weekdays, d]
                        onChange({
                          ...value,
                          weekdays: weekdays.length ? weekdays : [new Date().getDay()]
                        })
                      }}
                    >
                      {weekdayLabel(d)}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
          <label>
            Ends
            <select
              value={value.endMode}
              onChange={(e) =>
                onChange({ ...value, endMode: e.target.value as 'count' | 'until' })
              }
            >
              <option value="count">After a number of times</option>
              <option value="until">On a date</option>
            </select>
          </label>
          {value.endMode === 'count' ? (
            <label>
              How many times? (max 90)
              <input
                type="number"
                min={1}
                max={90}
                value={value.count}
                onChange={(e) =>
                  onChange({ ...value, count: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })
                }
              />
            </label>
          ) : (
            <label>
              Until date
              <input
                type="date"
                value={value.untilDate}
                onChange={(e) => onChange({ ...value, untilDate: e.target.value })}
                required
              />
            </label>
          )}
          <p className="helper-text">
            Each day gets its own queue item. Marking one day complete only finishes that day — later days stay on
            your list.
          </p>
        </div>
      )}
    </div>
  )
}
