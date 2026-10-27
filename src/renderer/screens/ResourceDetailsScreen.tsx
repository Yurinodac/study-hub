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
  chapterCompletionFromSections,
  embeddedCustomItems,
  formatTimestamp,
  isChapterMarkedDone,
  itemsTabLabel,
  itemsTabNoun,
  mergeProgressConfig,
  parseTimestamp,
  readingMarkDoneValidation,
  resourceHasItemsTab,
  studiedPartLabel,
  summarizeProgress
} from '../../shared/progress'
import { shouldApplyServerSnapshot } from '../../shared/draft-sync'
import type { DetailsFocus } from '../App'
import CompletionBar from '../components/CompletionBar'
import { formatYmd } from '../../shared/dates'

type NextActionSchedule =
  | { mode: 'none' }
  | { mode: 'today' }
  | { mode: 'tomorrow' }
  | { mode: 'date'; startDate: string }
  | { mode: 'range'; startDate: string; endDate: string }

type TabId = 'overview' | 'progress' | 'chapters' | 'history'

function tabsForResource(resource: Resource): Array<{ id: TabId; label: string }> {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'progress', label: 'Progress' }
  ]
  if (resourceHasItemsTab(resource)) {
    tabs.push({ id: 'chapters', label: itemsTabLabel(resource) })
  }
  tabs.push({ id: 'history', label: 'History' })
  return tabs
}

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
  /** Blocks background reloads from wiping fields while the user is typing. */
  const overviewDirtyRef = useRef(false)

  const reload = async (force = false) => {
    let r = await window.studyHub.getResource(resourceId)
    let secs = await window.studyHub.listSections(resourceId)
    // One-time: move embedded checklist/milestone config rows onto the items tab (sections).
    if (r?.type === 'custom' && secs.length === 0) {
      const embedded = embeddedCustomItems(r.config as CustomConfig)
      if (embedded.length) {
        for (const item of embedded) {
          await window.studyHub.upsertSection({
            resourceId,
            name: item.label,
            totalUnits: 1,
            completedUnits: item.done ? 1 : 0
          })
        }
        const cleared: CustomConfig = {
          ...(r.config as CustomConfig),
          checklist: [],
          milestones: []
        }
        r = await window.studyHub.updateResource(resourceId, { config: cleared })
        secs = await window.studyHub.listSections(resourceId)
      }
    }
    setSections(secs)
    setHistory(await window.studyHub.listHistory(resourceId))
    if (!r) {
      setResource(null)
      return
    }
    if (force || shouldApplyServerSnapshot(overviewDirtyRef.current)) {
      setResource(r)
      setSelectedAreaIds(r.studyAreaIds)
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
              config: prev.config,
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

  useEffect(() => {
    if (!resource) return
    const allowed = new Set(tabsForResource(resource).map((t) => t.id))
    if (!allowed.has(tab)) setTab('overview')
  }, [resource, tab])

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

  const sectionProgress = chapterCompletionFromSections(
    sections,
    resource.type === 'textbook' ? (resource.config as TextbookConfig).totalChapters : null
  )
  const savedUrl =
    resource.locationKind === 'url' && resource.locationValue.trim()
      ? resource.locationValue.trim()
      : ''
  const openLabel =
    resource.type === 'anki' && resource.locationKind === 'app' ? 'Open Anki app' : 'Open resource'
  const saveProgress = async (
    patch: Partial<Resource> & { studyAreaIds?: string[] },
    summary: string,
    extras: {
      studiedPart?: string
      details?: string
      studyAreaIds?: string[]
      sectionId?: string
      sectionIds?: string[]
    }
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
    }
    setHistory(await window.studyHub.listHistory(resource.id))
    setSections(await window.studyHub.listSections(resource.id))
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
              {summarizeProgress(resource, sectionProgress)}
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void onOpenResource(resource)}>
              {openLabel}
            </button>
          </div>
        </div>

        <CompletionBar resource={resource} sectionProgress={sectionProgress} />

        <div className="tablist" role="tablist" aria-label="Resource details">
          {tabsForResource(resource).map((t) => (
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
                config: resource.config,
                stoppingPointNote: resource.stoppingPointNote,
                notes: resource.notes,
                confidence: resource.confidence
              })
              overviewDirtyRef.current = false
              setResource(updated)
              setSelectedAreaIds(updated.studyAreaIds)
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
                <option value="app">Desktop app (e.g. Anki)</option>
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

            {resource.locationKind === 'app' && (
              <div>
                <p className="helper-text">
                  Opens the app on this computer (for example Anki). Study Hub does not sync Anki decks — it only
                  launches the app.
                </p>
                <p className="meta">{resource.locationValue || 'No app chosen yet'}</p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      const path = await window.studyHub.pickApp()
                      if (path) {
                        overviewDirtyRef.current = true
                        setResource((prev) => (prev ? { ...prev, locationValue: path } : prev))
                      }
                    }}
                  >
                    Browse to app (.exe)
                  </button>
                  {resource.type === 'anki' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={async () => {
                        const found = await window.studyHub.findAnkiExe()
                        if (found) {
                          overviewDirtyRef.current = true
                          setResource((prev) => (prev ? { ...prev, locationValue: found } : prev))
                          showStatus('Found Anki on this PC.')
                        } else {
                          showStatus(
                            'Anki was not found in the usual folders. Install Anki or browse to anki.exe.',
                            'warn'
                          )
                        }
                      }}
                    >
                      Find Anki automatically
                    </button>
                  )}
                  {resource.locationValue.trim() && (
                    <button type="button" className="btn btn-primary" onClick={() => void onOpenResource(resource)}>
                      Open Anki app
                    </button>
                  )}
                </div>
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

            {resource.type === 'textbook' && (
              <>
                <p className="helper-text" style={{ margin: 0 }}>
                  The completion bar counts chapters marked done. On <strong>Progress</strong>, select one or more
                  chapters from the Chapters list and mark them complete to raise the count. You can also mark done on
                  the Chapters tab.
                </p>
                {sectionProgress ? (
                  <p className="meta" style={{ margin: 0 }}>
                    Chapters marked done: <strong>{sectionProgress.done}</strong> of{' '}
                    <strong>{sectionProgress.total}</strong>
                  </p>
                ) : (
                  <p className="meta" style={{ margin: 0 }}>
                    No chapters yet — add them on the Chapters tab, then link them when logging Progress.
                  </p>
                )}
                <label>
                  Expected total chapters (optional — for the bar if you haven’t listed every chapter yet)
                  <input
                    type="number"
                    min={1}
                    value={(resource.config as TextbookConfig).totalChapters ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const totalChapters = e.target.value ? Number(e.target.value) : null
                      setResource((prev) =>
                        prev
                          ? { ...prev, config: { ...(prev.config as TextbookConfig), totalChapters } }
                          : prev
                      )
                    }}
                  />
                </label>
                <label>
                  Total pages (optional — page-based bar if you prefer pages over chapters)
                  <input
                    type="number"
                    min={1}
                    value={(resource.config as TextbookConfig).totalPages ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const totalPages = e.target.value ? Number(e.target.value) : null
                      setResource((prev) =>
                        prev
                          ? { ...prev, config: { ...(prev.config as TextbookConfig), totalPages } }
                          : prev
                      )
                    }}
                  />
                </label>
              </>
            )}
            {resource.type === 'video' && (
              <label>
                Total lessons (optional — enables the lessons progress bar)
                <input
                  type="number"
                  min={1}
                  value={(resource.config as VideoConfig).totalLessons ?? ''}
                  onChange={(e) => {
                    overviewDirtyRef.current = true
                    const totalLessons = e.target.value ? Number(e.target.value) : null
                    setResource((prev) =>
                      prev
                        ? { ...prev, config: { ...(prev.config as VideoConfig), totalLessons } }
                        : prev
                    )
                  }}
                />
              </label>
            )}
            {resource.type === 'anki' && (
              <>
                <p className="helper-text">
                  Cumulative totals (Progress sessions add to these). Bar = correct ÷ attempted.
                </p>
                <label>
                  Cards attempted (total)
                  <input
                    type="number"
                    min={0}
                    value={(resource.config as AnkiConfig).cardsAttempted ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const cardsAttempted = e.target.value ? Number(e.target.value) : 0
                      setResource((prev) =>
                        prev
                          ? { ...prev, config: { ...(prev.config as AnkiConfig), cardsAttempted } }
                          : prev
                      )
                    }}
                  />
                </label>
                <label>
                  Cards correct (total)
                  <input
                    type="number"
                    min={0}
                    value={(resource.config as AnkiConfig).cardsCorrect ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const cardsCorrect = e.target.value ? Number(e.target.value) : undefined
                      setResource((prev) =>
                        prev
                          ? { ...prev, config: { ...(prev.config as AnkiConfig), cardsCorrect } }
                          : prev
                      )
                    }}
                  />
                </label>
              </>
            )}
            {resource.type === 'custom' && (resource.config as CustomConfig).mode === 'units' && (
              <>
                <p className="helper-text">
                  Set total units for the completion bar (done ÷ total). Progress sessions{' '}
                  <strong>add</strong> completed units onto the total below.
                </p>
                <label>
                  Unit label
                  <input
                    value={(resource.config as CustomConfig).unitLabel ?? 'modules'}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const unitLabel = e.target.value
                      setResource((prev) =>
                        prev
                          ? { ...prev, config: { ...(prev.config as CustomConfig), unitLabel } }
                          : prev
                      )
                    }}
                  />
                </label>
                <label>
                  Completed units (total)
                  <input
                    type="number"
                    min={0}
                    value={(resource.config as CustomConfig).completedUnits ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const completedUnits = e.target.value ? Number(e.target.value) : 0
                      setResource((prev) =>
                        prev
                          ? {
                              ...prev,
                              config: { ...(prev.config as CustomConfig), completedUnits }
                            }
                          : prev
                      )
                    }}
                  />
                </label>
                <label>
                  Total units (for the progress bar)
                  <input
                    type="number"
                    min={1}
                    value={(resource.config as CustomConfig).totalUnits ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const totalUnits = e.target.value ? Number(e.target.value) : null
                      setResource((prev) =>
                        prev
                          ? { ...prev, config: { ...(prev.config as CustomConfig), totalUnits } }
                          : prev
                      )
                    }}
                  />
                </label>
              </>
            )}
            {resource.type === 'question_bank' && (
              <>
                <p className="helper-text">
                  Cumulative totals (Progress sessions add to these). Bar = correct ÷ attempted.
                </p>
                <label>
                  Questions attempted (total)
                  <input
                    type="number"
                    min={0}
                    value={(resource.config as QuestionBankConfig).questionsAttempted ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const questionsAttempted = e.target.value ? Number(e.target.value) : 0
                      setResource((prev) =>
                        prev
                          ? {
                              ...prev,
                              config: {
                                ...(prev.config as QuestionBankConfig),
                                questionsAttempted
                              }
                            }
                          : prev
                      )
                    }}
                  />
                </label>
                <label>
                  Correct answers (total)
                  <input
                    type="number"
                    min={0}
                    value={(resource.config as QuestionBankConfig).correctAnswers ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const correctAnswers = e.target.value ? Number(e.target.value) : null
                      setResource((prev) =>
                        prev
                          ? {
                              ...prev,
                              config: { ...(prev.config as QuestionBankConfig), correctAnswers }
                            }
                          : prev
                      )
                    }}
                  />
                </label>
                <label>
                  Total questions in this set (optional note)
                  <input
                    type="number"
                    min={1}
                    value={(resource.config as QuestionBankConfig).totalQuestions ?? ''}
                    onChange={(e) => {
                      overviewDirtyRef.current = true
                      const totalQuestions = e.target.value ? Number(e.target.value) : null
                      setResource((prev) =>
                        prev
                          ? {
                              ...prev,
                              config: { ...(prev.config as QuestionBankConfig), totalQuestions }
                            }
                          : prev
                      )
                    }}
                  />
                </label>
              </>
            )}

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
                Log <strong>this session</strong> only. Anki, question bank, and custom unit counts{' '}
                <strong>add</strong> to Overview totals. For readings, select linked chapter(s) to raise the completion
                count. Checklist and milestone items live on their tab — check them off here. Optionally set a next
                action and when to queue it, then Save.
              </p>
            </div>
          </div>
          <ProgressEditor
            resource={resource}
            sections={sections}
            selectedAreaIds={selectedAreaIds}
            onSave={async (config, extras, summary, hist, schedule) => {
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
              if (!action || schedule.mode === 'none') {
                showStatus('Progress saved.')
                return
              }
              const base = {
                projectId: resource.projectId,
                resourceId: resource.id,
                description: action
              }
              if (schedule.mode === 'today') {
                await window.studyHub.addQueueItem({ ...base, when: 'today' })
                showStatus('Progress saved. Next action added to Today’s queue.')
              } else if (schedule.mode === 'tomorrow') {
                await window.studyHub.addQueueItem({ ...base, when: 'tomorrow' })
                showStatus('Progress saved. Next action added to Tomorrow’s queue.')
              } else if (schedule.mode === 'date') {
                await window.studyHub.addQueueItemsForDates({ ...base, startDate: schedule.startDate })
                showStatus(`Progress saved. Next action scheduled for ${schedule.startDate}.`)
              } else {
                const items = await window.studyHub.addQueueItemsForDates({
                  ...base,
                  startDate: schedule.startDate,
                  endDate: schedule.endDate
                })
                showStatus(
                  `Progress saved. Next action added to ${items.length} day${items.length === 1 ? '' : 's'}.`
                )
              }
            }}
          />
        </section>
      )}

      {tab === 'chapters' && resourceHasItemsTab(resource) && (
        <ItemsTabPanel
          resource={resource}
          sections={sections}
          sectionName={sectionName}
          setSectionName={setSectionName}
          setSections={setSections}
          setResource={setResource}
          setTab={setTab}
          showStatus={showStatus}
          onChanged={onChanged}
        />
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

function ItemsTabPanel({
  resource,
  sections,
  sectionName,
  setSectionName,
  setSections,
  setResource,
  setTab,
  showStatus,
  onChanged
}: {
  resource: Resource
  sections: ResourceSection[]
  sectionName: string
  setSectionName: (v: string) => void
  setSections: (s: ResourceSection[]) => void
  setResource: (r: Resource) => void
  setTab: (t: TabId) => void
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
  onChanged: () => void
}) {
  const label = itemsTabLabel(resource)
  const noun = itemsTabNoun(resource)
  const isCustomItems =
    resource.type === 'custom' &&
    ((resource.config as CustomConfig).mode === 'checklist' ||
      (resource.config as CustomConfig).mode === 'milestones')

  return (
    <section className="panel" role="tabpanel" id="panel-chapters" aria-labelledby="tab-chapters">
      <div className="section-head">
        <div>
          <h2>{label}</h2>
          <p>
            {isCustomItems
              ? `Define each ${noun.singular} here. The Overview bar uses these items. On Progress, check them off or mark partial completion with a comment.`
              : `Source of truth for ${noun.singular} completion. Mark done here, or select linked ${noun.plural} on Progress to raise the Overview bar.`}
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
            name: sectionName.trim(),
            totalUnits: 1,
            completedUnits: 0
          })
          setSectionName('')
          setSections(await window.studyHub.listSections(resource.id))
          showStatus(`${noun.singular[0].toUpperCase()}${noun.singular.slice(1)} added.`)
          onChanged()
        }}
      >
        <label>
          {isCustomItems ? `${label.slice(0, -1)} name` : 'Chapter or section name'}
          <input
            type="text"
            name="sectionName"
            autoComplete="off"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            placeholder={
              isCustomItems
                ? (resource.config as CustomConfig).mode === 'milestones'
                  ? 'Finish practice exam 1'
                  : 'Review amino acids'
                : 'Chapter 4 — Cell membranes'
            }
          />
        </label>
        <p className="helper-text">
          {isCustomItems
            ? `Add every ${noun.singular} you want on the bar. Progress updates check them off without redefining the list.`
            : 'Tip: name it the way you talk about it. On Progress, select one or more listed chapters to mark them read/complete.'}
        </p>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">
            {noun.addButton}
          </button>
        </div>
      </form>

      {sections.length === 0 ? (
        <p className="meta" style={{ marginTop: '1rem' }}>
          No {noun.plural} yet.
        </p>
      ) : (
        <ul className="history-list" style={{ marginTop: '1rem' }}>
          {sections.map((s) => {
            const done = isChapterMarkedDone(s)
            const partial = !done && s.completedUnits > 0
            return (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <p className="meta">
                  {done ? 'Completed' : partial ? 'Partial' : 'Not completed'}
                  {s.notes?.trim() ? ` · ${s.notes.trim()}` : ''}
                </p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      const unitTotal = s.totalUnits != null && s.totalUnits > 0 ? s.totalUnits : 1
                      await window.studyHub.upsertSection({
                        id: s.id,
                        resourceId: resource.id,
                        name: s.name,
                        completedUnits: done ? 0 : unitTotal,
                        totalUnits: unitTotal,
                        notes: s.notes
                      })
                      setSections(await window.studyHub.listSections(resource.id))
                      showStatus(
                        done
                          ? `${noun.singular[0].toUpperCase()}${noun.singular.slice(1)} unmarked — completion decreased.`
                          : `${noun.singular[0].toUpperCase()}${noun.singular.slice(1)} marked done — completion increased.`
                      )
                      onChanged()
                    }}
                  >
                    {done ? 'Mark not done' : `Mark ${noun.singular} done`}
                  </button>
                  {!isCustomItems && (
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
                  )}
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!window.confirm(`Remove “${s.name}”?`)) return
                      await window.studyHub.deleteSection(s.id)
                      setSections(await window.studyHub.listSections(resource.id))
                      showStatus(`${noun.singular[0].toUpperCase()}${noun.singular.slice(1)} removed.`)
                      onChanged()
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
    return {
      ...c,
      currentChapter: '',
      currentPage: undefined
    }
  }
  if (resource.type === 'video') {
    const c = base as VideoConfig
    return { ...c, currentLesson: '', timestampSeconds: 0 }
  }
  if (resource.type === 'anki') {
    const c = base as AnkiConfig
    return {
      ...c,
      lastSessionMinutes: undefined,
      lastNewCards: undefined,
      cardsAttempted: undefined as unknown as number,
      cardsCorrect: undefined
    }
  }
  if (resource.type === 'question_bank') {
    const c = base as QuestionBankConfig
    return {
      ...c,
      questionsAttempted: undefined as unknown as number,
      correctAnswers: null,
      incorrectAnswers: null
    }
  }
  if (resource.type === 'custom') {
    const c = base as CustomConfig
    if (c.mode === 'units') return { ...c, completedUnits: undefined as unknown as number }
    if (c.mode === 'time') return { ...c, timeSpentMinutes: undefined as unknown as number }
    return { ...c }
  }
  return base
}

type ItemSessionAction = 'none' | 'done' | 'partial'

/** Compact multi-select: one closed control, checklist inside a dropdown panel. */
function ChapterChecklistDropdown({
  sections,
  selectedIds,
  onToggle
}: {
  sections: ResourceSection[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = sections.filter((s) => selectedIds.includes(s.id))
  const summary =
    selected.length === 0
      ? 'Select chapter(s)…'
      : selected.length <= 2
        ? selected.map((s) => s.name).join(', ')
        : `${selected.length} chapters selected`

  return (
    <div className="dropdown-checklist" ref={rootRef}>
      <span className="field-label" id="chapters-read-label">
        Chapters read this session
      </span>
      <button
        type="button"
        className="dropdown-checklist-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="chapters-read-label"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dropdown-checklist-summary">{summary}</span>
        <span className="dropdown-checklist-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown-checklist-menu" role="listbox" aria-multiselectable="true">
          {sections.map((s) => {
            const checked = selectedIds.includes(s.id)
            const done = isChapterMarkedDone(s)
            return (
              <label key={s.id} className="dropdown-checklist-option check-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(s.id)}
                />
                <span>
                  {s.name}
                  {done ? ' (already done)' : ''}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
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
    hist: {
      studiedPart?: string
      details?: string
      studyAreaIds?: string[]
      sectionId?: string
      sectionIds?: string[]
    },
    schedule: NextActionSchedule
  ) => Promise<void>
}) {
  const [config, setConfig] = useState(() => emptyProgressDraft(resource))
  const [stopping, setStopping] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([])
  const [markSelectedDone, setMarkSelectedDone] = useState(false)
  const [formError, setFormError] = useState('')
  const [itemActions, setItemActions] = useState<Record<string, ItemSessionAction>>({})
  const [itemComments, setItemComments] = useState<Record<string, string>>({})
  const [scheduleMode, setScheduleMode] = useState<'none' | 'today' | 'tomorrow' | 'date' | 'range'>('none')
  const [pickDate, setPickDate] = useState(() => formatYmd(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return formatYmd(d)
  })
  const [timestampText, setTimestampText] = useState('')

  const resetForm = () => {
    setConfig(emptyProgressDraft(resource))
    setSectionId('')
    setSelectedSectionIds([])
    setMarkSelectedDone(false)
    setFormError('')
    setItemActions({})
    setItemComments({})
    setStopping('')
    setNextAction('')
    setScheduleMode('none')
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
    if (resource.type === 'video') {
      const c = config as VideoConfig
      setConfig({
        ...c,
        currentLesson: section.name.replace(/^lesson\s+/i, '') || section.name
      })
    }
  }, [sectionId])

  const toggleSelectedSection = (id: string) => {
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
    setFormError('')
  }

  const areaAndChapterFields = (
    <>
      {sections.length > 0 && resource.type !== 'textbook' && (
        <div>
          <label>
            Chapter / section studied (optional)
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">None</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </>
  )

  const buildSchedule = (): NextActionSchedule => {
    if (scheduleMode === 'today') return { mode: 'today' }
    if (scheduleMode === 'tomorrow') return { mode: 'tomorrow' }
    if (scheduleMode === 'date') return { mode: 'date', startDate: pickDate }
    if (scheduleMode === 'range') return { mode: 'range', startDate: pickDate, endDate: rangeEnd }
    return { mode: 'none' }
  }

  const queueToggles = (
    <div className="next-action-schedule">
      <p className="field-label">Next action — add to queue when you save</p>
      <label>
        When
        <select
          value={scheduleMode}
          onChange={(e) =>
            setScheduleMode(e.target.value as 'none' | 'today' | 'tomorrow' | 'date' | 'range')
          }
          name="next-action-when"
        >
          <option value="none">Don’t add to queue</option>
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
      <p className="meta" style={{ margin: '0.35rem 0 0' }}>
        Needs a next action above. Chosen dates land on the Today queue tabs for those days.
      </p>
    </div>
  )

  const histAreas = selectedAreaIds
  const queueWhen = buildSchedule()

  if (resource.type === 'textbook') {
    const c = config as TextbookConfig
    return (
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          const markError = readingMarkDoneValidation(markSelectedDone, selectedSectionIds, sections)
          if (markError) {
            setFormError(markError)
            return
          }
          if (markSelectedDone) {
            for (const id of selectedSectionIds) {
              const s = sections.find((row) => row.id === id)
              if (!s) continue
              const unitTotal = s.totalUnits != null && s.totalUnits > 0 ? s.totalUnits : 1
              await window.studyHub.upsertSection({
                id: s.id,
                resourceId: resource.id,
                name: s.name,
                completedUnits: unitTotal,
                totalUnits: unitTotal,
                notes: s.notes
              })
            }
          }
          const linked = selectedSectionIds
            .map((id) => sections.find((s) => s.id === id))
            .filter((s): s is ResourceSection => Boolean(s))
          const lastLinked = linked[linked.length - 1]
          const nextConfig = mergeProgressConfig(resource, {
            ...c,
            currentChapter:
              c.currentChapter?.trim() ||
              (lastLinked
                ? lastLinked.name.replace(/^chapter\s+/i, '') || lastLinked.name
                : c.currentChapter)
          }) as TextbookConfig
          const studied =
            linked.length > 0
              ? linked.map((s) => s.name).join(', ')
              : studiedPartLabel({ type: 'textbook', config: nextConfig })
          const note =
            stopping ||
            (markSelectedDone && linked.length
              ? `Read: ${studied}`
              : studied)
          const action = nextAction || (note ? `Continue ${resource.name}: ${note}.` : '')
          await onSave(
            nextConfig,
            { stoppingPointNote: note, nextAction: action },
            markSelectedDone && linked.length
              ? `Marked read — ${studied}`
              : `Updated reading — ${studied}`,
            {
              studiedPart: studied,
              details: note,
              studyAreaIds: histAreas,
              sectionId: linked[0]?.id,
              sectionIds: linked.map((s) => s.id)
            },
            queueWhen
          )
          resetForm()
        }}
      >
        <p className="helper-text">
          Select <strong>which chapter(s) you read</strong> from the Chapters tab list. Checking “Mark selected as
          completed” is the only way Progress raises the completion count — and it requires at least one linked
          chapter.
        </p>
        {sections.length === 0 ? (
          <div className="panel-warn" role="status">
            No chapters listed yet. Add them on the <strong>Chapters</strong> tab before you can increase the
            completion count.
          </div>
        ) : (
          <ChapterChecklistDropdown
            sections={sections}
            selectedIds={selectedSectionIds}
            onToggle={toggleSelectedSection}
          />
        )}
        <label className="check-row">
          <input
            type="checkbox"
            checked={markSelectedDone}
            onChange={(e) => {
              setMarkSelectedDone(e.target.checked)
              setFormError('')
            }}
            disabled={sections.length === 0}
          />
          <span>Mark selected chapter(s) as completed (raises Overview count)</span>
        </label>
        {formError && (
          <div className="panel-warn" role="alert">
            {formError}
          </div>
        )}
        {c.trackChapters && (
          <label>
            Stopping point — chapter (optional)
            <input
              value={c.currentChapter ?? ''}
              onChange={(e) => setConfig({ ...c, currentChapter: e.target.value })}
              placeholder="Where you left off"
            />
          </label>
        )}
        {c.trackPages && (
          <label>
            Stopping point — page (optional)
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
        <p className="helper-text">
          Session counts are <strong>added</strong> to Overview totals. Bar = correct ÷ attempted (cumulative).
        </p>
        <label>
          Cards attempted this session
          <input
            type="number"
            min={0}
            value={c.cardsAttempted ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                cardsAttempted: e.target.value ? Number(e.target.value) : (undefined as unknown as number)
              })
            }
          />
        </label>
        <label>
          Cards correct this session
          <input
            type="number"
            min={0}
            value={c.cardsCorrect ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                cardsCorrect: e.target.value ? Number(e.target.value) : undefined
              })
            }
          />
        </label>
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
        <p className="helper-text">
          Session counts are <strong>added</strong> to Overview totals. Bar = correct ÷ attempted (cumulative).
        </p>
        <label>
          Questions attempted this session
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
          Correct this session
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
          Incorrect this session (optional)
          <input
            type="number"
            min={0}
            value={c.incorrectAnswers ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                incorrectAnswers: e.target.value ? Number(e.target.value) : null
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
  const storedCustom = resource.config as CustomConfig
  const unitLabel = c.unitLabel || storedCustom.unitLabel || 'units'
  const totalUnits = storedCustom.totalUnits
  const itemsMode = storedCustom.mode === 'checklist' || storedCustom.mode === 'milestones'
  const itemsLabel = itemsTabLabel(resource)
  const itemsNoun = itemsTabNoun(resource)

  if (itemsMode) {
    return (
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          const touched = sections.filter((s) => {
            const action = itemActions[s.id] ?? 'none'
            const comment = itemComments[s.id]?.trim()
            return action !== 'none' || Boolean(comment)
          })
          if (!touched.length && !stopping.trim() && !nextAction.trim()) {
            setFormError(`Select at least one ${itemsNoun.singular} to update, or add a note.`)
            return
          }
          setFormError('')
          const changedNames: string[] = []
          for (const s of touched) {
            const action = itemActions[s.id] ?? 'none'
            const comment = itemComments[s.id]?.trim() ?? ''
            const unitTotal = s.totalUnits != null && s.totalUnits > 0 ? s.totalUnits : 1
            let completedUnits = s.completedUnits
            let total = unitTotal
            let notes = s.notes
            if (action === 'done') {
              completedUnits = unitTotal
              total = unitTotal
            } else if (action === 'partial') {
              // Half-complete for the bar’s “done” count (not marked done), with comment.
              total = Math.max(2, unitTotal === 1 ? 2 : unitTotal)
              completedUnits = Math.max(1, Math.floor(total / 2))
            }
            if (comment) {
              notes = comment
            }
            await window.studyHub.upsertSection({
              id: s.id,
              resourceId: resource.id,
              name: s.name,
              completedUnits,
              totalUnits: total,
              notes
            })
            changedNames.push(s.name)
          }
          const studied = changedNames.length ? changedNames.join(', ') : itemsLabel
          const note =
            stopping ||
            (changedNames.length
              ? `Updated ${changedNames.length} ${changedNames.length === 1 ? itemsNoun.singular : itemsNoun.plural}`
              : summarizeProgress({ type: 'custom', config: storedCustom }))
          await onSave(
            storedCustom,
            { stoppingPointNote: note, nextAction },
            `${itemsLabel} progress — ${note}`,
            {
              studiedPart: studied,
              details: note,
              studyAreaIds: histAreas,
              sectionId: touched[0]?.id,
              sectionIds: touched.map((s) => s.id)
            },
            queueWhen
          )
          resetForm()
        }}
      >
        <p className="helper-text">
          Check off {itemsNoun.plural} defined on the <strong>{itemsLabel}</strong> tab, or mark partial with a
          comment. The Overview bar uses those items.
        </p>
        {sections.length === 0 ? (
          <div className="panel-warn" role="status">
            No {itemsNoun.plural} yet. Add them on the <strong>{itemsLabel}</strong> tab first.
          </div>
        ) : (
          <ul className="history-list" style={{ margin: 0 }}>
            {sections.map((s) => {
              const done = isChapterMarkedDone(s)
              const action = itemActions[s.id] ?? 'none'
              return (
                <li key={s.id}>
                  <strong>
                    {s.name}
                    {done ? ' · done' : s.completedUnits > 0 ? ' · partial' : ''}
                  </strong>
                  {s.notes?.trim() ? <p className="meta">{s.notes.trim()}</p> : null}
                  <div className="btn-row" style={{ marginTop: '0.35rem' }}>
                    <label className="check-row">
                      <input
                        type="radio"
                        name={`item-action-${s.id}`}
                        checked={action === 'none'}
                        onChange={() =>
                          setItemActions((prev) => ({ ...prev, [s.id]: 'none' }))
                        }
                      />
                      <span>No change</span>
                    </label>
                    <label className="check-row">
                      <input
                        type="radio"
                        name={`item-action-${s.id}`}
                        checked={action === 'done'}
                        onChange={() =>
                          setItemActions((prev) => ({ ...prev, [s.id]: 'done' }))
                        }
                      />
                      <span>Complete</span>
                    </label>
                    <label className="check-row">
                      <input
                        type="radio"
                        name={`item-action-${s.id}`}
                        checked={action === 'partial'}
                        onChange={() =>
                          setItemActions((prev) => ({ ...prev, [s.id]: 'partial' }))
                        }
                      />
                      <span>Partial</span>
                    </label>
                  </div>
                  <label>
                    Comment (optional)
                    <input
                      value={itemComments[s.id] ?? ''}
                      onChange={(e) =>
                        setItemComments((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      placeholder="What you finished or what’s left"
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {formError && (
          <div className="panel-warn" role="alert">
            {formError}
          </div>
        )}
        <label>
          Session note (optional)
          <input value={stopping} onChange={(e) => setStopping(e.target.value)} />
        </label>
        <label>
          Next action (optional)
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </label>
        {queueToggles}
        <button type="submit" className="btn btn-primary">
          Save {itemsLabel.toLowerCase()} progress
        </button>
      </form>
    )
  }

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
      {(c.mode === 'units' || storedCustom.mode === 'units') && (
        <>
          <p className="helper-text">
            Session units are <strong>added</strong> to Overview totals
            {totalUnits != null && totalUnits > 0
              ? ` (currently ${storedCustom.completedUnits ?? 0} of ${totalUnits} ${unitLabel}).`
              : '. Set total units on Overview so the completion bar can show done ÷ total.'}
          </p>
          {!(totalUnits != null && totalUnits > 0) && (
            <div className="panel-warn" role="status">
              No total units set yet. Open <strong>Overview</strong> and enter total units to enable the progress bar.
            </div>
          )}
          <label>
            Units completed this session
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
        </>
      )}
      {storedCustom.mode === 'time' && (
        <label>
          Minutes this session
          <input
            type="number"
            min={0}
            value={c.timeSpentMinutes ?? ''}
            onChange={(e) =>
              setConfig({
                ...c,
                mode: 'time',
                timeSpentMinutes: e.target.value ? Number(e.target.value) : (undefined as unknown as number)
              })
            }
          />
        </label>
      )}
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
