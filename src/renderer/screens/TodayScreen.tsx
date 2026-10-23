import { useEffect, useMemo, useState } from 'react'
import type { ProjectHistoryEntry, QueueItem, Resource, ResourceCard } from '../../shared/types'
import { continueStudyingLabel } from '../../shared/progress'

type TodayTab = 'queue' | 'continue' | 'history'

const TABS: Array<{ id: TodayTab; label: string }> = [
  { id: 'queue', label: 'Queue' },
  { id: 'continue', label: 'Continue' },
  { id: 'history', label: 'History' }
]

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
  const [resources, setResources] = useState<ResourceCard[]>([])
  const [history, setHistory] = useState<ProjectHistoryEntry[]>([])
  // Draft fields for “add to queue” — never cleared by refreshKey reloads.
  const [newDesc, setNewDesc] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const [newResourceId, setNewResourceId] = useState('')
  const [newWhen, setNewWhen] = useState<'today' | 'tomorrow'>('today')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const [editResourceId, setEditResourceId] = useState('')

  const reloadLists = async () => {
    setQueue(await window.studyHub.listQueue(projectId))
    setTomorrowQueue(await window.studyHub.listTomorrowQueue(projectId))
    setResources(await window.studyHub.listResources(projectId))
    setHistory(await window.studyHub.listProjectHistory(projectId))
  }

  useEffect(() => {
    // Only refresh list data — never wipe typing drafts (newDesc / edit fields).
    void reloadLists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey])

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

  return (
    <div>
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
        <section
          className="panel"
          role="tabpanel"
          id="today-panel-queue"
          aria-labelledby="today-tab-queue"
        >
          <div className="section-head">
            <div>
              <h2>Today’s study queue</h2>
              <p>
                <strong>Open resource</strong> opens the website or file.{' '}
                <strong>Mark complete</strong> finishes the item and records progress when a resource is linked.
              </p>
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="empty-state">
              <h3>Your queue is empty</h3>
              <p>Add a next action below, or open the Continue tab.</p>
            </div>
          ) : (
            <div className="queue-list">
              {queue.map((item, index) => {
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
                          setEditDesc('')
                          setEditMinutes('')
                          setEditResourceId('')
                          showStatus('Queue item updated.')
                          onChanged()
                        }}
                      >
                        <label>
                          Description
                          <input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          Estimated minutes
                          <input
                            type="number"
                            min={1}
                            value={editMinutes}
                            onChange={(e) => setEditMinutes(e.target.value)}
                          />
                        </label>
                        <label>
                          Linked resource
                          <select
                            value={editResourceId}
                            onChange={(e) => setEditResourceId(e.target.value)}
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
                        <div className="btn-row">
                          <button type="submit" className="btn btn-primary">
                            Save changes
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setEditingId(null)
                              setEditDesc('')
                              setEditMinutes('')
                              setEditResourceId('')
                            }}
                          >
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
                              {item.estimatedMinutes != null
                                ? `About ${item.estimatedMinutes} minutes`
                                : null}
                              {linked ? `${item.estimatedMinutes != null ? ' · ' : ''}${linked.name}` : ''}
                              {linked?.isSample ? ' · SAMPLE' : ''}
                            </p>
                          </div>
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
                              disabled={index === queue.length - 1}
                              onClick={() => void move(item.id, 1)}
                            >
                              Move down
                            </button>
                          </div>
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
                            title="Open the linked website or file"
                          >
                            Open resource
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => startEdit(item)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={async () => {
                              const result = await window.studyHub.completeQueueItem(item.id)
                              showStatus(
                                result.progressRecorded
                                  ? 'Marked complete. Progress updated for the linked resource.'
                                  : 'Marked complete.'
                              )
                              onChanged()
                            }}
                          >
                            Mark complete
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={async () => {
                              if (!window.confirm('Remove this item from today’s queue?')) return
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
              })}
            </div>
          )}

          <form
            className="form-grid"
            style={{ marginTop: '1.25rem' }}
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newDesc.trim()) return
              const when = newWhen
              await window.studyHub.addQueueItem({
                projectId,
                resourceId: newResourceId || null,
                description: newDesc.trim(),
                estimatedMinutes: newMinutes ? Number(newMinutes) : null,
                when
              })
              setNewDesc('')
              setNewMinutes('')
              setNewResourceId('')
              setNewWhen('today')
              showStatus(when === 'today' ? 'Added to Today’s queue.' : 'Added to Tomorrow’s queue.')
              onChanged()
            }}
          >
            <label>
              Next action
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder='e.g. Continue Biology, Chapter 4, page 87.'
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
              Add to
              <select
                value={newWhen}
                onChange={(e) => setNewWhen(e.target.value as 'today' | 'tomorrow')}
                name="today-queue-when"
              >
                <option value="today">Today’s queue</option>
                <option value="tomorrow">Tomorrow’s queue</option>
              </select>
            </label>
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
                  {r.progressSummary &&
                    r.progressSummary !== 'No progress yet' &&
                    !r.progressSummary.startsWith('No ') && (
                      <p className="meta">{r.progressSummary}</p>
                    )}
                  <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void onOpenResource(r)}
                    >
                      Open resource
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onUpdateProgress(r.id)}
                    >
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
              <p>
                Everything recorded for this project, newest first. Delete an entry if you made a mistake.
              </p>
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
                  {Array.isArray(h.payload.studyAreaNames) && h.payload.studyAreaNames.length > 0 ? (
                    <p className="meta">
                      <strong>Categories:</strong> {(h.payload.studyAreaNames as string[]).join(', ')}
                    </p>
                  ) : null}
                  {h.payload.sectionName ? (
                    <p className="meta">
                      <strong>Chapter:</strong> {String(h.payload.sectionName)}
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
