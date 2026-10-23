import { useEffect, useRef, useState } from 'react'
import type {
  AnkiConfig,
  CustomConfig,
  LocationKind,
  QuestionBankConfig,
  Resource,
  ResourceConfig,
  ResourceSection,
  Category,
  StudyHistoryEntry,
  TextbookConfig,
  VideoConfig
} from '../../shared/types'
import { RESOURCE_TYPE_LABELS } from '../../shared/types'
import {
  completionPercent,
  formatTimestamp,
  parseTimestamp,
  studiedPartLabel,
  summarizeProgress
} from '../../shared/progress'
import { shouldApplyServerSnapshot } from '../../shared/draft-sync'
import type { DetailsFocus } from '../App'

type TabId = 'overview' | 'progress' | 'chapters' | 'history'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'progress', label: 'Progress' },
  { id: 'chapters', label: 'Chapters' },
  { id: 'history', label: 'History' }
]

function focusToTab(focus: DetailsFocus): TabId {
  if (focus === 'progress') return 'progress'
  if (focus === 'history') return 'history'
  return 'overview'
}

export default function ResourceDetailsScreen({
  resourceId,
  categories,
  initialFocus = 'overview',
  onBack,
  onChanged,
  onOpenResource,
  showStatus
}: {
  resourceId: string
  categories: Category[]
  initialFocus?: DetailsFocus
  onBack: () => void
  onChanged: () => void
  onOpenResource: (
    resource: Pick<Resource, 'locationKind' | 'locationValue' | 'id'>
  ) => Promise<{ ok: boolean; noLink?: boolean; message?: string }> | { ok: boolean; noLink?: boolean; message?: string }
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [resource, setResource] = useState<Resource | null>(null)
  const [sections, setSections] = useState<ResourceSection[]>([])
  const [history, setHistory] = useState<StudyHistoryEntry[]>([])
  const [tab, setTab] = useState<TabId>(focusToTab(initialFocus))
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([])
  const [sectionName, setSectionName] = useState('')
  const [queueNextAction, setQueueNextAction] = useState('')
  /** Blocks background reloads from wiping fields while the user is typing. */
  const overviewDirtyRef = useRef(false)

  const reload = async (force = false) => {
    const r = await window.studyHub.getResource(resourceId)
    setSections(await window.studyHub.listSections(resourceId))
    setHistory(await window.studyHub.listHistory(resourceId))
    if (!r) {
      setResource(null)
      return
    }
    if (force || shouldApplyServerSnapshot(overviewDirtyRef.current)) {
      setResource(r)
      setSelectedAreaIds(r.studyAreaIds)
      setQueueNextAction(r.nextAction ?? '')
      overviewDirtyRef.current = false
    } else {
      // Keep draft fields; still refresh non-draft resource metadata used elsewhere.
      setResource((prev) =>
        prev
          ? {
              ...r,
              name: prev.name,
              locationKind: prev.locationKind,
              locationValue: prev.locationValue,
              stoppingPointNote: prev.stoppingPointNote,
              notes: prev.notes,
              confidence: prev.confidence
            }
          : r
      )
    }
  }

  useEffect(() => {
    overviewDirtyRef.current = false
    setResource(null)
    setSectionName('')
    void reload(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  useEffect(() => {
    setTab(focusToTab(initialFocus))
  }, [initialFocus, resourceId])

  if (!resource) {
    return (
      <section className="panel">
        <p>Loading resource…</p>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back to My Resources
        </button>
      </section>
    )
  }

  const pct = completionPercent(resource)
  const savedUrl =
    resource.locationKind === 'url' && resource.locationValue.trim()
      ? resource.locationValue.trim()
      : ''
  const saveProgress = async (
    patch: Partial<Resource> & { studyAreaIds?: string[] },
    summary: string,
    extras: { studiedPart?: string; details?: string; studyAreaIds?: string[]; sectionId?: string }
  ) => {
    const updated = await window.studyHub.updateResource(
      resource.id,
      {
        ...patch,
        lastStudiedAt: new Date().toISOString()
      },
      summary,
      extras
    )
    setResource((prev) => {
      if (!prev || !overviewDirtyRef.current) return updated
      // Keep in-progress Overview typing if the user switched tabs mid-edit.
      return {
        ...updated,
        name: prev.name,
        locationKind: prev.locationKind,
        locationValue: prev.locationValue,
        stoppingPointNote: prev.stoppingPointNote,
        notes: prev.notes,
        confidence: prev.confidence
      }
    })
    if (!overviewDirtyRef.current) {
      setSelectedAreaIds(updated.studyAreaIds)
      setQueueNextAction(updated.nextAction ?? '')
    }
    setHistory(await window.studyHub.listHistory(resource.id))
    setSections(await window.studyHub.listSections(resource.id))
    onChanged()
  }

  const addNextToQueue = async (when: 'today' | 'tomorrow') => {
    const text = queueNextAction.trim() || resource.nextAction.trim()
    if (!text) {
      showStatus('Enter a next action first.', 'warn')
      return
    }
    await window.studyHub.addQueueItem({
      projectId: resource.projectId,
      resourceId: resource.id,
      description: text,
      when
    })
    showStatus(when === 'today' ? 'Added to Today’s queue.' : 'Added to Tomorrow’s queue.')
    onChanged()
  }

  const toggleArea = (areaId: string) => {
    overviewDirtyRef.current = true
    setSelectedAreaIds((prev) =>
      prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId]
    )
  }

  return (
    <div>
      <section className="panel">
        <div className="section-head">
          <div>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Back to My Resources
            </button>
            <h2 style={{ marginTop: '0.75rem' }}>{resource.name}</h2>
            <p>
              {RESOURCE_TYPE_LABELS[resource.type]}
              {resource.isSample ? ' · SAMPLE' : ''}
              {' · '}
              {summarizeProgress(resource)}
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void onOpenResource(resource)}>
              Open resource
            </button>
          </div>
        </div>

        {pct != null && (
          <div className="progress-meter" aria-label={`About ${pct}% complete`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="tablist" role="tablist" aria-label="Resource details">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              id={`tab-${t.id}`}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'overview' && (
        <section className="panel" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <h2 className="sr-only">Overview</h2>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault()
              const updated = await window.studyHub.updateResource(resource.id, {
                name: resource.name,
                studyAreaIds: selectedAreaIds,
                locationKind: resource.locationKind,
                locationValue: resource.locationValue,
                stoppingPointNote: resource.stoppingPointNote,
                nextAction: queueNextAction,
                notes: resource.notes,
                confidence: resource.confidence
              })
              overviewDirtyRef.current = false
              setResource(updated)
              setSelectedAreaIds(updated.studyAreaIds)
              setQueueNextAction(updated.nextAction ?? '')
              showStatus('Resource details saved.')
              onChanged()
            }}
          >
            <label>
              Name
              <input
                name="resource-name"
                autoComplete="off"
                value={resource.name}
                onChange={(e) => {
                  overviewDirtyRef.current = true
                  const name = e.target.value
                  setResource((prev) => (prev ? { ...prev, name } : prev))
                }}
              />
            </label>

            <fieldset className="chip-fieldset">
              <legend>Categories</legend>
              <p className="helper-text">Tag this whole resource. Categories are shared for the project.</p>
              {categories.length === 0 ? (
                <p className="meta">No categories yet. Create them on My Resources.</p>
              ) : (
                <div className="chip-row" role="group" aria-label="Categories">
                  {categories.map((c) => {
                    const on = selectedAreaIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`chip${on ? ' is-selected' : ''}`}
                        aria-pressed={on}
                        onClick={() => toggleArea(c.id)}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </fieldset>

            <label>
              Location type
              <select
                value={resource.locationKind}
                onChange={(e) => {
                  overviewDirtyRef.current = true
                  const locationKind = e.target.value as LocationKind
                  setResource((prev) => (prev ? { ...prev, locationKind } : prev))
                }}
              >
                <option value="none">No link yet</option>
                <option value="url">Website link</option>
                <option value="file">Local file</option>
              </select>
            </label>

            {resource.locationKind === 'url' && (
              <>
                <label>
                  Website address
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    name="resource-url"
                    placeholder="https://example.com/lesson"
                    value={resource.locationValue}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const locationValue = e.target.value
                      setResource((prev) => (prev ? { ...prev, locationValue } : prev))
                    }}
                  />
                </label>
                {savedUrl && (
                  <p className="meta">
                    Saved link:{' '}
                    <button type="button" className="link-button" onClick={() => void onOpenResource(resource)}>
                      {savedUrl}
                    </button>
                  </p>
                )}
              </>
            )}

            {resource.locationKind === 'file' && (
              <div>
                <p className="meta">{resource.locationValue || 'No file chosen'}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    const path = await window.studyHub.pickFile()
                    if (path) {
                      overviewDirtyRef.current = true
                      setResource((prev) => (prev ? { ...prev, locationValue: path } : prev))
                    }
                  }}
                >
                  Update file location
                </button>
              </div>
            )}

            <label>
              Stopping point note
              <input
                name="stopping-point"
                autoComplete="off"
                value={resource.stoppingPointNote}
                onChange={(e) => {
                  overviewDirtyRef.current = true
                  const stoppingPointNote = e.target.value
                  setResource((prev) => (prev ? { ...prev, stoppingPointNote } : prev))
                }}
              />
            </label>

            <label>
              Next action
              <input
                name="next-action"
                autoComplete="off"
                value={queueNextAction}
                onChange={(e) => {
                  overviewDirtyRef.current = true
                  setQueueNextAction(e.target.value)
                }}
                placeholder="What should you do next?"
              />
            </label>
            <p className="meta" style={{ margin: 0 }}>
              To queue a next action with progress, use the Progress tab. Or add it here:
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => void addNextToQueue('today')}>
                Add to Today’s queue
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void addNextToQueue('tomorrow')}>
                Add to Tomorrow’s queue
              </button>
            </div>

            <label>
              Notes
              <textarea
                name="resource-notes"
                value={resource.notes}
                onChange={(e) => {
                  overviewDirtyRef.current = true
                  const notes = e.target.value
                  setResource((prev) => (prev ? { ...prev, notes } : prev))
                }}
              />
            </label>
            <label>
              Confidence (optional, 1–5)
              <input
                type="number"
                min={1}
                max={5}
                name="confidence"
                value={resource.confidence ?? ''}
                onChange={(e) => {
                  overviewDirtyRef.current = true
                  const confidence = e.target.value ? Number(e.target.value) : null
                  setResource((prev) => (prev ? { ...prev, confidence } : prev))
                }}
              />
            </label>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary">
                Save details
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await window.studyHub.updateResource(resource.id, { archived: true })
                  showStatus('Resource archived.')
                  onChanged()
                  onBack()
                }}
              >
                Archive resource
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'progress' && (
        <section className="panel" role="tabpanel" id="panel-progress" aria-labelledby="tab-progress">
          <div className="section-head">
            <div>
              <h2>Update progress</h2>
              <p>
                Fill in what you studied, optionally toggle Today and/or Tomorrow for the next action, then Save. The
                form clears after a successful save. Use History to delete a mistaken entry.
              </p>
            </div>
          </div>
          <ProgressEditor
            resource={resource}
            sections={sections}
            selectedAreaIds={selectedAreaIds}
            onSave={async (config, extras, summary, hist, queueWhen) => {
              await saveProgress(
                {
                  config,
                  stoppingPointNote: extras.stoppingPointNote ?? '',
                  nextAction: extras.nextAction ?? '',
                  studyAreaIds: hist.studyAreaIds ?? selectedAreaIds
                },
                summary,
                hist
              )
              const action = extras.nextAction?.trim()
              if (action) setQueueNextAction(action)
              const queued: string[] = []
              if (action && queueWhen.today) {
                await window.studyHub.addQueueItem({
                  projectId: resource.projectId,
                  resourceId: resource.id,
                  description: action,
                  when: 'today'
                })
                queued.push('Today')
              }
              if (action && queueWhen.tomorrow) {
                await window.studyHub.addQueueItem({
                  projectId: resource.projectId,
                  resourceId: resource.id,
                  description: action,
                  when: 'tomorrow'
                })
                queued.push('Tomorrow')
              }
              if (queued.length) {
                showStatus(`Progress saved. Next action added to ${queued.join(' and ')}.`)
              } else {
                showStatus('Progress saved.')
              }
            }}
          />
        </section>
      )}

      {tab === 'chapters' && (
        <section className="panel" role="tabpanel" id="panel-chapters" aria-labelledby="tab-chapters">
          <div className="section-head">
            <div>
              <h2>Chapters & sections</h2>
              <p>
                Optional advanced detail for <strong>this resource only</strong> (chapters, lessons, modules). Not used
                to organize the whole app — categories on the resource do that.
              </p>
            </div>
          </div>

          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!sectionName.trim()) return
              await window.studyHub.upsertSection({
                resourceId: resource.id,
                name: sectionName.trim()
              })
              setSectionName('')
              setSections(await window.studyHub.listSections(resource.id))
              showStatus('Chapter added.')
              onChanged()
            }}
          >
            <label>
              Chapter or section name
              <input
                type="text"
                name="sectionName"
                autoComplete="off"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="Chapter 4 — Cell membranes"
              />
            </label>
            <p className="helper-text">
              Tip: name it the way you talk about it. You can pick it from a dropdown when you log progress on this
              resource.
            </p>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary">
                Add chapter
              </button>
            </div>
          </form>

          {sections.length === 0 ? (
            <p className="meta" style={{ marginTop: '1rem' }}>
              No chapters yet.
            </p>
          ) : (
            <ul className="history-list" style={{ marginTop: '1rem' }}>
              {sections.map((s) => {
                const done =
                  s.totalUnits != null && s.totalUnits > 0
                    ? s.completedUnits >= s.totalUnits
                    : s.completedUnits > 0
                return (
                  <li key={s.id}>
                    <strong>{s.name}</strong>
                    <p className="meta">
                      {done
                        ? 'Marked done'
                        : s.totalUnits != null
                          ? `${s.completedUnits} of ${s.totalUnits}`
                          : s.completedUnits > 0
                            ? 'In progress'
                            : 'Not started'}
                    </p>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={async () => {
                          const target =
                            s.totalUnits != null && s.totalUnits > 0
                              ? s.totalUnits
                              : Math.max(1, s.completedUnits || 1)
                          await window.studyHub.upsertSection({
                            id: s.id,
                            resourceId: resource.id,
                            name: s.name,
                            completedUnits: done ? 0 : target,
                            totalUnits: s.totalUnits
                          })
                          setSections(await window.studyHub.listSections(resource.id))
                          showStatus(done ? 'Chapter unmarked.' : 'Chapter marked done.')
                          onChanged()
                        }}
                      >
                        {done ? 'Mark not done' : 'Mark chapter done'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={async () => {
                          const patch = applySectionAsCurrent(resource, s.name)
                          const updated = await window.studyHub.updateResource(resource.id, patch)
                          setResource(updated)
                          showStatus(`Current position set to “${s.name}”.`)
                          setTab('progress')
                          onChanged()
                        }}
                      >
                        Use in Progress
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={async () => {
                          if (!window.confirm(`Remove “${s.name}”?`)) return
                          await window.studyHub.deleteSection(s.id)
                          setSections(await window.studyHub.listSections(resource.id))
                          showStatus('Chapter removed.')
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="panel" role="tabpanel" id="panel-history" aria-labelledby="tab-history">
          <div className="section-head">
            <div>
              <h2>Study history</h2>
              <p>
                A simple list of what you recorded. To correct a mistake, <strong>delete</strong> the entry you do not
                want.
              </p>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="meta">No history yet. Update progress to create the first entry.</p>
          ) : (
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id}>
                  <strong>{new Date(h.recordedAt).toLocaleString()}</strong>
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
                  {h.payload.details ? (
                    <p className="meta">
                      <strong>Details:</strong> {String(h.payload.details)}
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
                        setHistory(await window.studyHub.listHistory(resource.id))
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

function applySectionAsCurrent(resource: Resource, sectionName: string): { config: ResourceConfig } {
  if (resource.type === 'textbook') {
    const c = resource.config as TextbookConfig
    return { config: { ...c, currentChapter: sectionName.replace(/^chapter\s+/i, '') || sectionName } }
  }
  if (resource.type === 'video') {
    const c = resource.config as VideoConfig
    return { config: { ...c, currentLesson: sectionName.replace(/^lesson\s+/i, '') || sectionName } }
  }
  return { config: resource.config }
}

function emptyProgressDraft(resource: Resource): ResourceConfig {
  const base = resource.config
  if (resource.type === 'textbook') {
    const c = base as TextbookConfig
    return { ...c, currentChapter: '', currentPage: undefined }
  }
  if (resource.type === 'video') {
    const c = base as VideoConfig
    return { ...c, currentLesson: '', timestampSeconds: 0 }
  }
  if (resource.type === 'anki') {
    const c = base as AnkiConfig
    return { ...c, lastSessionMinutes: undefined, lastNewCards: undefined }
  }
  if (resource.type === 'question_bank') {
    const c = base as QuestionBankConfig
    return { ...c, questionsAttempted: undefined as unknown as number, correctAnswers: null }
  }
  if (resource.type === 'custom') {
    const c = base as CustomConfig
    if (c.mode === 'units') return { ...c, completedUnits: undefined as unknown as number }
    if (c.mode === 'time') return { ...c, timeSpentMinutes: undefined as unknown as number }
    return { ...c }
  }
  return base
}

function mergeProgressConfig(resource: Resource, draft: ResourceConfig): ResourceConfig {
  const prev = resource.config
  if (resource.type === 'textbook') {
    const d = draft as TextbookConfig
    const p = prev as TextbookConfig
    return {
      ...p,
      ...d,
      currentChapter: d.currentChapter?.trim() ? d.currentChapter : p.currentChapter,
      currentPage: d.currentPage != null && !Number.isNaN(d.currentPage) ? d.currentPage : p.currentPage
    }
  }
  if (resource.type === 'video') {
    const d = draft as VideoConfig
    const p = prev as VideoConfig
    return {
      ...p,
      ...d,
      currentLesson: d.currentLesson?.trim() ? d.currentLesson : p.currentLesson,
      timestampSeconds:
        d.timestampSeconds != null && d.timestampSeconds > 0 ? d.timestampSeconds : p.timestampSeconds
    }
  }
  if (resource.type === 'anki') {
    const d = draft as AnkiConfig
    const p = prev as AnkiConfig
    return {
      ...p,
      lastSessionMinutes: d.lastSessionMinutes,
      lastNewCards: d.lastNewCards,
      reviewSessionsThisWeek: (p.reviewSessionsThisWeek ?? 0) + 1
    }
  }
  if (resource.type === 'question_bank') {
    const d = draft as QuestionBankConfig
    const p = prev as QuestionBankConfig
    const attempted = d.questionsAttempted
    if (attempted == null || Number.isNaN(Number(attempted))) return { ...p, ...d, questionsAttempted: p.questionsAttempted }
    return { ...p, ...d, questionsAttempted: Number(attempted) }
  }
  if (resource.type === 'custom') {
    const d = draft as CustomConfig
    const p = prev as CustomConfig
    if (d.mode === 'units') {
      const units = d.completedUnits
      if (units == null || Number.isNaN(Number(units))) {
        return { ...p, ...d, completedUnits: p.completedUnits }
      }
    }
    if (d.mode === 'time') {
      const mins = d.timeSpentMinutes
      if (mins == null || Number.isNaN(Number(mins))) {
        return { ...p, ...d, timeSpentMinutes: p.timeSpentMinutes }
      }
    }
    return { ...p, ...d }
  }
  return draft
}

function ProgressEditor({
  resource,
  sections,
  selectedAreaIds,
  onSave
}: {
  resource: Resource
  sections: ResourceSection[]
  selectedAreaIds: string[]
  onSave: (
    config: ResourceConfig,
    extras: { stoppingPointNote?: string; nextAction?: string },
    summary: string,
    hist: { studiedPart?: string; details?: string; studyAreaIds?: string[]; sectionId?: string },
    queueWhen: { today: boolean; tomorrow: boolean }
  ) => Promise<void>
}) {
  const [config, setConfig] = useState(() => emptyProgressDraft(resource))
  const [stopping, setStopping] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [queueToday, setQueueToday] = useState(false)
  const [queueTomorrow, setQueueTomorrow] = useState(false)
  const [timestampText, setTimestampText] = useState('')
  const [draftItem, setDraftItem] = useState('')

  const resetForm = () => {
    setConfig(emptyProgressDraft(resource))
    setSectionId('')
    setStopping('')
    setNextAction('')
    setQueueToday(false)
    setQueueTomorrow(false)
    setDraftItem('')
    setTimestampText('')
  }

  useEffect(() => {
    resetForm()
    // Only re-init when switching resources — not after every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id])

  useEffect(() => {
    if (!sectionId) return
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return
    if (resource.type === 'textbook') {
      const c = config as TextbookConfig
      setConfig({
        ...c,
        currentChapter: section.name.replace(/^chapter\s+/i, '') || section.name
      })
    } else if (resource.type === 'video') {
      const c = config as VideoConfig
      setConfig({
        ...c,
        currentLesson: section.name.replace(/^lesson\s+/i, '') || section.name
      })
    }
  }, [sectionId])

  const areaAndChapterFields = (
    <>
      {sections.length > 0 && (
        <div>
          <label>
            Chapter / section studied (optional)
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Type chapter below instead</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <p className="helper-text">
            Optional list from this resource’s Chapters tab. Choosing one records that chapter in history. Categories
            on the resource (Overview) organize My Resources — not chapter-level tags.
          </p>
        </div>
      )}
    </>
  )

  const queueToggles = (
    <div>
      <p className="field-label">Add next action to queue when you save</p>
      <div className="chip-row" role="group" aria-label="Queue next action">
        <button
          type="button"
          className={`chip chip-queue${queueToday ? ' is-selected' : ''}`}
          aria-pressed={queueToday}
          onClick={() => setQueueToday((v) => !v)}
        >
          Today
        </button>
        <button
          type="button"
          className={`chip chip-queue${queueTomorrow ? ' is-selected' : ''}`}
          aria-pressed={queueTomorrow}
          onClick={() => setQueueTomorrow((v) => !v)}
        >
          Tomorrow
        </button>
      </div>
      <p className="meta" style={{ margin: '0.35rem 0 0' }}>
        Toggle Today and/or Tomorrow (color shows selected), then Save. Needs a next action above.
      </p>
    </div>
  )

  const histAreas = selectedAreaIds
  const queueWhen = { today: queueToday, tomorrow: queueTomorrow }

  if (resource.type === 'textbook') {
    const c = config as TextbookConfig
    return (
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          const nextConfig = mergeProgressConfig(resource, c) as TextbookConfig
          const section = sections.find((s) => s.id === sectionId)
          const studied =
            section?.name || studiedPartLabel({ type: 'textbook', config: nextConfig })
          const note = stopping || studied
          const action = nextAction || (note ? `Continue ${resource.name}: ${note}.` : '')
          await onSave(
            nextConfig,
            { stoppingPointNote: note, nextAction: action },
            `Updated reading — ${studied}`,
            {
              studiedPart: studied,
              details: note,
              studyAreaIds: histAreas,
              sectionId: sectionId || undefined
            },
            queueWhen
          )
          resetForm()
        }}
      >
        {areaAndChapterFields}
        {c.trackChapters && (
          <label>
            Chapter
            <input
              value={c.currentChapter ?? ''}
              onChange={(e) => setConfig({ ...c, currentChapter: e.target.value })}
            />
          </label>
        )}
        {c.trackPages && (
          <label>
            Page
            <input
              type="number"
              min={1}
              value={c.currentPage ?? ''}
              onChange={(e) =>
                setConfig({ ...c, currentPage: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </label>
        )}
        <label>
          Extra note (optional)
          <input value={stopping} onChange={(e) => setStopping(e.target.value)} />
        </label>
        <label>
          Next action (optional)
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </label>
        {queueToggles}
        <button type="submit" className="btn btn-primary">
          Save progress
        </button>
      </form>
    )
  }

  if (resource.type === 'video') {
    const c = config as VideoConfig
    return (
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          const seconds = parseTimestamp(timestampText)
          const draft = {
            ...c,
            timestampSeconds: seconds != null ? seconds : 0
          }
          const nextConfig = mergeProgressConfig(resource, draft) as VideoConfig
          if (seconds != null) nextConfig.timestampSeconds = seconds
          const section = sections.find((s) => s.id === sectionId)
          const studied =
            section?.name || studiedPartLabel({ type: 'video', config: nextConfig })
          const note = stopping || studied
          const action =
            nextAction ||
            `Resume Lesson ${nextConfig.currentLesson ?? ''} at ${formatTimestamp(nextConfig.timestampSeconds ?? 0)}.`
          await onSave(
            nextConfig,
            { stoppingPointNote: note, nextAction: action },
            `Updated video — ${studied}`,
            {
              studiedPart: studied,
              details: note,
              studyAreaIds: histAreas,
              sectionId: sectionId || undefined
            },
            queueWhen
          )
          resetForm()
        }}
      >
        {areaAndChapterFields}
        <label>
          Lesson
          <input
            value={c.currentLesson ?? ''}
            onChange={(e) => setConfig({ ...c, currentLesson: e.target.value })}
          />
        </label>
        <label>
          Timestamp (m:ss or h:mm:ss)
          <input value={timestampText} onChange={(e) => setTimestampText(e.target.value)} />
        </label>
        <label>
          Extra note (optional)
          <input value={stopping} onChange={(e) => setStopping(e.target.value)} />
        </label>
        <label>
          Next action (optional)
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </label>
        {queueToggles}
        <button type="submit" className="btn btn-primary">
          Save progress
        </button>
      </form>
    )
  }

  if (resource.type === 'anki') {
    const c = config as AnkiConfig
    return (
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          const nextConfig = mergeProgressConfig(resource, c) as AnkiConfig
          const note =
            stopping ||
            `Session: ${c.lastSessionMinutes ?? '?'} minutes` +
              (c.lastNewCards != null ? `, ${c.lastNewCards} new cards` : '')
          const action = nextAction || "Complete today's Anki reviews."
          await onSave(
            nextConfig,
            { stoppingPointNote: note, nextAction: action },
            `Recorded Anki review — ${note}`,
            {
              studiedPart: 'Anki review session',
              details: note,
              studyAreaIds: histAreas,
              sectionId: sectionId || undefined
            },
            queueWhen
          )
          resetForm()
        }}
      >
        {areaAndChapterFields}
        <label>
          Minutes this session (optional)
          <input
            type="number"
            min={1}
            value={c.lastSessionMinutes ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                lastSessionMinutes: e.target.value ? Number(e.target.value) : undefined
              })
            }
          />
        </label>
        <label>
          New cards (optional)
          <input
            type="number"
            min={0}
            value={c.lastNewCards ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                lastNewCards: e.target.value ? Number(e.target.value) : undefined
              })
            }
          />
        </label>
        <label>
          Next action (optional)
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </label>
        {queueToggles}
        <button type="submit" className="btn btn-primary">
          Save practice progress
        </button>
      </form>
    )
  }

  if (resource.type === 'question_bank') {
    const c = config as QuestionBankConfig
    return (
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          const nextConfig = mergeProgressConfig(resource, c) as QuestionBankConfig
          const note = stopping || `${nextConfig.questionsAttempted ?? 0} questions attempted`
          const action = nextAction || c.nextActionHint || 'Review missed questions.'
          await onSave(
            nextConfig,
            { stoppingPointNote: note, nextAction: action },
            `Practice update — ${note}`,
            {
              studiedPart: 'Practice questions',
              details: note,
              studyAreaIds: histAreas,
              sectionId: sectionId || undefined
            },
            queueWhen
          )
          resetForm()
        }}
      >
        {areaAndChapterFields}
        <label>
          Questions attempted
          <input
            type="number"
            min={0}
            value={c.questionsAttempted ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                questionsAttempted: e.target.value ? Number(e.target.value) : (undefined as unknown as number)
              })
            }
          />
        </label>
        <label>
          Correct answers (optional)
          <input
            type="number"
            min={0}
            value={c.correctAnswers ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                correctAnswers: e.target.value ? Number(e.target.value) : null
              })
            }
          />
        </label>
        <label>
          Next action (optional)
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </label>
        {queueToggles}
        <button type="submit" className="btn btn-primary">
          Save practice progress
        </button>
      </form>
    )
  }

  const c = config as CustomConfig
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault()
        const nextConfig = mergeProgressConfig(resource, c) as CustomConfig
        const studied = studiedPartLabel({ type: 'custom', config: nextConfig })
        const note = stopping || summarizeProgress({ type: 'custom', config: nextConfig })
        await onSave(
          nextConfig,
          { stoppingPointNote: note, nextAction },
          `Custom progress — ${note}`,
          {
            studiedPart: studied,
            details: note,
            studyAreaIds: histAreas,
            sectionId: sectionId || undefined
          },
          queueWhen
        )
        resetForm()
      }}
    >
      {areaAndChapterFields}
      <label>
        Completed units
        <input
          type="number"
          min={0}
          value={c.completedUnits ?? ''}
          onChange={(e) =>
            setConfig({
              ...c,
              mode: 'units',
              completedUnits: e.target.value ? Number(e.target.value) : (undefined as unknown as number)
            })
          }
        />
      </label>
      <label>
        Next action (optional)
        <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </label>
      {queueToggles}
      <button type="submit" className="btn btn-primary">
        Save practice progress
      </button>
      {c.mode === 'checklist' && (
        <div className="form-grid">
          {(c.checklist ?? []).map((item) => (
            <label key={item.id} className="check-row">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => {
                  const items = (c.checklist ?? []).map((i) =>
                    i.id === item.id ? { ...i, done: e.target.checked } : i
                  )
                  setConfig({ ...c, checklist: items })
                }}
              />
              <span>{item.label}</span>
            </label>
          ))}
          <label>
            Add checklist item
            <input value={draftItem} onChange={(e) => setDraftItem(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (!draftItem.trim()) return
              setConfig({
                ...c,
                checklist: [
                  ...(c.checklist ?? []),
                  { id: crypto.randomUUID(), label: draftItem.trim(), done: false }
                ]
              })
              setDraftItem('')
            }}
          >
            Add item
          </button>
        </div>
      )}
    </form>
  )
}
