import { useEffect, useMemo, useState } from 'react'
import type { ProjectHistoryEntry, QueueItem, Resource, ResourceCard } from '../../shared/types'
import { continueStudyingLabel } from '../../shared/progress'
import { formatYmd } from '../../shared/dates'
import CelebrationModal from '../components/CelebrationModal'
import CompletionBar from '../components/CompletionBar'

type TodayTab = 'queue' | 'continue' | 'history'
type ScheduleMode = 'today' | 'tomorrow' | 'date' | 'range'

const TABS: Array<{ id: TodayTab; label: string }> = [
  { id: 'queue', label: 'Queue' },
  { id: 'continue', label: 'Continue' },
  { id: 'history', label: 'History' }
]

function todayYmd(): string {
  return formatYmd(new Date())
}

function tomorrowYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return formatYmd(d)
}

export default function TodayScreen({
  projectId,
  refreshKey,
  onOpenResource,
  onUpdateProgress,
  onOpenDetails,
  onChanged,
  showStatus
}: {
  projectId: string
  refreshKey: number
  onOpenResource: (
    resource: Pick<Resource, 'locationKind' | 'locationValue' | 'id'>
  ) => Promise<{ ok: boolean; noLink?: boolean; message?: string }> | { ok: boolean; noLink?: boolean; message?: string }
  onUpdateProgress: (id: string) => void
  onOpenDetails: (id: string) => void
  onChanged: () => void
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [tab, setTab] = useState<TodayTab>('queue')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [tomorrowQueue, setTomorrowQueue] = useState<QueueItem[]>([])
  const [calendarDate, setCalendarDate] = useState(() => tomorrowYmd())
  const [calendarQueue, setCalendarQueue] = useState<QueueItem[]>([])
  const [resources, setResources] = useState<ResourceCard[]>([])
  const [history, setHistory] = useState<ProjectHistoryEntry[]>([])
  const [newDesc, setNewDesc] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const [newResourceId, setNewResourceId] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('today')
  const [pickDate, setPickDate] = useState(() => todayYmd())
  const [rangeEnd, setRangeEnd] = useState(() => tomorrowYmd())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const [editResourceId, setEditResourceId] = useState('')
  const [celebrateOpen, setCelebrateOpen] = useState(false)
  const [celebrateMessage, setCelebrateMessage] = useState('')
  const [celebrateImageUrl, setCelebrateImageUrl] = useState<string | null>(null)

  const reloadLists = async () => {
    setQueue(await window.studyHub.listQueue(projectId))
    setTomorrowQueue(await window.studyHub.listTomorrowQueue(projectId))
    setCalendarQueue(await window.studyHub.listQueueForDate(projectId, calendarDate))
    setResources(await window.studyHub.listResources(projectId))
    setHistory(await window.studyHub.listProjectHistory(projectId))
  }

  useEffect(() => {
    void reloadLists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey])

  useEffect(() => {
    void (async () => {
      setCalendarQueue(await window.studyHub.listQueueForDate(projectId, calendarDate))
    })()
  }, [projectId, calendarDate, refreshKey])

  const byId = useMemo(() => {
    const map = new Map<string, ResourceCard>()
    for (const r of resources) map.set(r.id, r)
    return map
  }, [resources])

  const continueCards = useMemo(() => {
    return [...resources]
      .filter((r) => !r.archived)
      .sort((a, b) => {
        const at = a.lastStudiedAt ? Date.parse(a.lastStudiedAt) : 0
        const bt = b.lastStudiedAt ? Date.parse(b.lastStudiedAt) : 0
        return bt - at
      })
      .slice(0, 8)
  }, [resources])

  const move = async (id: string, direction: -1 | 1) => {
    const ids = queue.map((q) => q.id)
    const index = ids.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await window.studyHub.reorderQueue(projectId, ids)
    onChanged()
  }

  const startEdit = (item: QueueItem) => {
    setEditingId(item.id)
    setEditDesc(item.description)
    setEditMinutes(item.estimatedMinutes != null ? String(item.estimatedMinutes) : '')
    setEditResourceId(item.resourceId ?? '')
  }

  const markComplete = async (item: QueueItem) => {
    const result = await window.studyHub.completeQueueItem(item.id)
    const celeb = await window.studyHub.getCelebration()
    setCelebrateMessage(
      result.progressRecorded
        ? `You finished “${item.description}”. Progress was updated for the linked resource.`
        : `You finished “${item.description}”.`
    )
    setCelebrateImageUrl(celeb.imageUrl)
    setCelebrateOpen(true)
    showStatus(result.progressRecorded ? 'Marked complete. Progress updated.' : 'Marked complete.')
    onChanged()
  }

  const renderQueueItem = (item: QueueItem, index: number, list: QueueItem[], allowReorder: boolean) => {
    const linked = item.resourceId ? byId.get(item.resourceId) : null
    const isEditing = editingId === item.id
    return (
      <article key={item.id} className="queue-item">
        {isEditing ? (
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!editDesc.trim()) return
              await window.studyHub.updateQueueItem(item.id, {
                description: editDesc.trim(),
                estimatedMinutes: editMinutes ? Number(editMinutes) : null,
                resourceId: editResourceId || null
              })
              setEditingId(null)
              showStatus('Queue item updated.')
              onChanged()
            }}
          >
            <label>
              Description
              <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} required autoComplete="off" />
            </label>
            <label>
              Estimated minutes
              <input type="number" min={1} value={editMinutes} onChange={(e) => setEditMinutes(e.target.value)} />
            </label>
            <label>
              Linked resource
              <select value={editResourceId} onChange={(e) => setEditResourceId(e.target.value)}>
                <option value="">None</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.isSample ? 'SAMPLE · ' : ''}
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary">
                Save changes
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="queue-item-main">
              <div>
                <p className="queue-desc">{item.description}</p>
                <p className="meta">
                  {item.forDate ? `Scheduled ${item.forDate}` : null}
                  {item.estimatedMinutes != null
                    ? `${item.forDate ? ' · ' : ''}About ${item.estimatedMinutes} minutes`
                    : null}
                  {linked ? `${item.forDate || item.estimatedMinutes != null ? ' · ' : ''}${linked.name}` : ''}
                  {linked?.isSample ? ' · SAMPLE' : ''}
                </p>
              </div>
              {allowReorder && (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={index === 0}
                    onClick={() => void move(item.id, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={index === list.length - 1}
                    onClick={() => void move(item.id, 1)}
                  >
                    Move down
                  </button>
                </div>
              )}
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!linked) {
                    showStatus('No resource is linked yet.', 'warn')
                    return
                  }
                  void onOpenResource(linked)
                }}
              >
                {linked?.type === 'anki' && linked.locationKind === 'app' ? 'Open Anki app' : 'Open resource'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => startEdit(item)}>
                Edit
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void markComplete(item)}>
                Mark complete
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  if (!window.confirm('Remove this item from the queue?')) return
                  await window.studyHub.deleteQueueItem(item.id)
                  showStatus('Removed from queue.')
                  onChanged()
                }}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </article>
    )
  }

  return (
    <div>
      <CelebrationModal
        open={celebrateOpen}
        message={celebrateMessage}
        imageUrl={celebrateImageUrl}
        onClose={() => setCelebrateOpen(false)}
      />

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Today</h2>
            <p>Queue what to do next, continue recent work, or review your study history.</p>
          </div>
        </div>
        <div className="tablist" role="tablist" aria-label="Today">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              id={`today-tab-${t.id}`}
              aria-controls={`today-panel-${t.id}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'queue' && (
        <section className="panel" role="tabpanel" id="today-panel-queue" aria-labelledby="today-tab-queue">
          <div className="section-head">
            <div>
              <h2>Today’s study queue</h2>
              <p>
                <strong>Open resource</strong> opens the website, file, or app.{' '}
                <strong>Mark complete</strong> finishes the item and records progress when a resource is linked.
              </p>
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="empty-state">
              <h3>Your queue is empty</h3>
              <p>Add a next action below, or pick another day on the calendar.</p>
            </div>
          ) : (
            <div className="queue-list">{queue.map((item, index) => renderQueueItem(item, index, queue, true))}</div>
          )}

          <form
            className="form-grid"
            style={{ marginTop: '1.25rem' }}
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newDesc.trim()) return
              const base = {
                projectId,
                resourceId: newResourceId || null,
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
                setCalendarDate(pickDate)
              } else {
                const items = await window.studyHub.addQueueItemsForDates({
                  ...base,
                  startDate: pickDate,
                  endDate: rangeEnd
                })
                showStatus(`Added to ${items.length} day${items.length === 1 ? '' : 's'}.`)
                setCalendarDate(pickDate)
              }
              setNewDesc('')
              setNewMinutes('')
              setNewResourceId('')
              setScheduleMode('today')
              onChanged()
            }}
          >
            <label>
              Next action
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="e.g. Continue Biology, Chapter 4, page 87."
                required
                autoComplete="off"
                name="today-queue-desc"
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
                name="today-queue-minutes"
              />
            </label>
            <label>
              Linked resource (optional)
              <select
                value={newResourceId}
                onChange={(e) => setNewResourceId(e.target.value)}
                name="today-queue-resource"
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
            <label>
              Schedule
              <select
                value={scheduleMode}
                onChange={(e) => setScheduleMode(e.target.value as ScheduleMode)}
                name="today-queue-when"
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
                Add to queue
              </button>
            </div>
          </form>

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.35rem' }}>Tomorrow’s queue</h3>
            <p className="meta" style={{ marginTop: 0 }}>
              These items move into Today automatically when that day arrives.
            </p>
            {tomorrowQueue.length === 0 ? (
              <p className="meta">Nothing planned for tomorrow yet.</p>
            ) : (
              <div className="queue-list">
                {tomorrowQueue.map((item) => {
                  const linked = item.resourceId ? byId.get(item.resourceId) : null
                  return (
                    <article key={item.id} className="queue-item">
                      <p className="queue-desc">{item.description}</p>
                      <p className="meta">
                        {item.estimatedMinutes != null ? `About ${item.estimatedMinutes} minutes` : null}
                        {linked ? `${item.estimatedMinutes != null ? ' · ' : ''}${linked.name}` : ''}
                      </p>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={async () => {
                            await window.studyHub.deleteQueueItem(item.id)
                            await window.studyHub.addQueueItem({
                              projectId,
                              resourceId: item.resourceId,
                              description: item.description,
                              estimatedMinutes: item.estimatedMinutes,
                              when: 'today'
                            })
                            showStatus('Moved to Today’s queue.')
                            onChanged()
                          }}
                        >
                          Move to Today
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={async () => {
                            if (!window.confirm('Remove this item from Tomorrow’s queue?')) return
                            await window.studyHub.deleteQueueItem(item.id)
                            showStatus('Removed from Tomorrow’s queue.')
                            onChanged()
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.35rem' }}>Other days</h3>
            <p className="meta" style={{ marginTop: 0 }}>
              Pick any date to see or plan tasks beyond today and tomorrow.
            </p>
            <label className="field-inline" style={{ maxWidth: 220, marginBottom: '0.75rem' }}>
              <span>Calendar day</span>
              <input type="date" value={calendarDate} onChange={(e) => setCalendarDate(e.target.value)} />
            </label>
            {calendarDate === todayYmd() ? (
              <p className="meta">That’s today — see the list above.</p>
            ) : calendarDate === tomorrowYmd() ? (
              <p className="meta">That’s tomorrow — see Tomorrow’s queue above.</p>
            ) : calendarQueue.length === 0 ? (
              <p className="meta">Nothing planned for {calendarDate} yet.</p>
            ) : (
              <div className="queue-list">
                {calendarQueue.map((item, index) => renderQueueItem(item, index, calendarQueue, false))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'continue' && (
        <section
          className="panel"
          role="tabpanel"
          id="today-panel-continue"
          aria-labelledby="today-tab-continue"
        >
          <div className="section-head">
            <div>
              <h2>Continue studying</h2>
              <p>Recent stopping points. Use different buttons for different jobs.</p>
            </div>
          </div>
          {continueCards.length === 0 ? (
            <div className="empty-state">
              <h3>No resources yet</h3>
              <p>Use My Resources to add a textbook, video, Anki deck, or practice set.</p>
            </div>
          ) : (
            <div className="continue-list">
              {continueCards.map((r) => (
                <article key={r.id} className="continue-card">
                  <div className="resource-meta-row">
                    <span className="badge">{r.type.replace('_', ' ')}</span>
                    {r.isSample && <span className="badge badge-sample">SAMPLE</span>}
                    {(r.studyAreaNames?.length
                      ? r.studyAreaNames
                      : r.studyAreaName
                        ? [r.studyAreaName]
                        : []
                    ).map((name) => (
                      <span key={name} className="badge">
                        {name}
                      </span>
                    ))}
                  </div>
                  <h3 style={{ margin: '0 0 0.35rem' }}>{r.name}</h3>
                  <p className="queue-desc" style={{ fontSize: '1.05rem' }}>
                    {continueStudyingLabel(r)}
                  </p>
                  <CompletionBar resource={r} sectionProgress={r.sectionProgress} />
                  <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                    <button type="button" className="btn btn-primary" onClick={() => void onOpenResource(r)}>
                      {r.type === 'anki' && r.locationKind === 'app' ? 'Open Anki app' : 'Open resource'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => onUpdateProgress(r.id)}>
                      Update progress
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => onOpenDetails(r.id)}>
                      Edit details
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section
          className="panel"
          role="tabpanel"
          id="today-panel-history"
          aria-labelledby="today-tab-history"
        >
          <div className="section-head">
            <div>
              <h2>Study history</h2>
              <p>Everything recorded for this project, newest first. Delete an entry if you made a mistake.</p>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="meta">No history yet. Update progress or mark a queue item complete.</p>
          ) : (
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id}>
                  <strong>{new Date(h.recordedAt).toLocaleString()}</strong>
                  <p className="meta" style={{ marginTop: '0.25rem' }}>
                    {h.resourceName}
                  </p>
                  <p className="queue-desc" style={{ fontSize: '1.05rem', marginTop: '0.35rem' }}>
                    {h.summary}
                  </p>
                  {h.payload.studiedPart ? (
                    <p className="meta">
                      <strong>Studied:</strong> {String(h.payload.studiedPart)}
                    </p>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Delete this history entry?\n\n${h.summary}\n${new Date(h.recordedAt).toLocaleString()}`
                          )
                        ) {
                          return
                        }
                        await window.studyHub.deleteHistory(h.id)
                        setHistory(await window.studyHub.listProjectHistory(projectId))
                        showStatus('History entry deleted.')
                        onChanged()
                      }}
                    >
                      Delete this entry
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
