import { useEffect, useState } from 'react'
import type { Category, ProjectPreset, Resource, ResourceCard, ResourceType } from '../../shared/types'
import { RESOURCE_TYPE_LABELS } from '../../shared/types'
import { completionPercent } from '../../shared/progress'
import AddResourceDialog from '../components/AddResourceDialog'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}

function hasUsefulProgress(summary: string): boolean {
  const s = summary.trim().toLowerCase()
  if (!s) return false
  if (s === 'no progress yet') return false
  if (s.startsWith('no ')) return false
  if (s.includes('empty checklist')) return false
  return true
}

export default function ResourcesScreen({
  projectId,
  projectPreset,
  categories,
  refreshKey,
  onOpenDetails,
  onUpdateProgress,
  onOpenResource,
  onChanged,
  showStatus
}: {
  projectId: string
  projectPreset: ProjectPreset
  categories: Category[]
  refreshKey: number
  onOpenDetails: (id: string) => void
  onUpdateProgress: (id: string) => void
  onOpenResource: (
    resource: Pick<Resource, 'locationKind' | 'locationValue' | 'id'>
  ) => Promise<{ ok: boolean; noLink?: boolean; message?: string }> | { ok: boolean; noLink?: boolean; message?: string }
  onChanged: () => Promise<void> | void
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [resources, setResources] = useState<ResourceCard[]>([])
  const [sectionNames, setSectionNames] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 250)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [isRenamingCategory, setIsRenamingCategory] = useState(false)
  const [renameCategoryValue, setRenameCategoryValue] = useState('')
  const isMcat = projectPreset === 'mcat'

  useEffect(() => {
    // Refresh cards only — never clear search/rename drafts here.
    let cancelled = false
    ;(async () => {
      const list = await window.studyHub.listResources(projectId, {
        query: debouncedQuery,
        categoryId: categoryFilter || null,
        type: (typeFilter as ResourceType) || null,
        sectionName: sectionFilter || null
      })
      const names = await window.studyHub.listSectionNames(projectId)
      if (!cancelled) {
        setResources(list)
        setSectionNames(names)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, refreshKey, debouncedQuery, categoryFilter, typeFilter, sectionFilter])

  return (
    <div>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>My Resources</h2>
            <p>
              Tap a card for details. <strong>Open resource</strong> opens the file or site;{' '}
              <strong>Update progress</strong> goes straight to the progress form.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
            Add resource
          </button>
        </div>

        <div className="filters">
          <label className="field-inline">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, stopping point, next action"
              autoComplete="off"
              name="resources-search"
            />
          </label>
          <label className="field-inline">
            <span>Study method / type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <span>Section in resource</span>
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
              <option value="">All</option>
              {sectionNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <p className="meta" style={{ margin: '0 0 0.35rem' }}>
            {isMcat
              ? 'Filter by study category (shared list for this project). Tag whole resources when you add them.'
              : 'Filter by category. Select a category chip, then Rename or Remove if needed.'}
          </p>
          {!isMcat && (
            <div className="area-manage-row" style={{ marginBottom: '0.5rem' }}>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category"
                aria-label="New category name"
                autoComplete="off"
                name="new-category"
                style={{ flex: '1 1 160px', minWidth: '140px', maxWidth: '240px' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  if (!newCategoryName.trim()) return
                  const created = await window.studyHub.createArea(projectId, newCategoryName.trim())
                  setNewCategoryName('')
                  setSelectedCategoryId(created.id)
                  setCategoryFilter(created.id)
                  setIsRenamingCategory(false)
                  showStatus('Category created.')
                  await onChanged()
                }}
              >
                Add
              </button>
            </div>
          )}
          {categories.length > 0 && (
            <div>
              <div className="chip-row" role="listbox" aria-label="Filter by category">
                <button
                  type="button"
                  role="option"
                  aria-selected={!categoryFilter}
                  className={`chip${!categoryFilter ? ' is-selected' : ''}`}
                  onClick={() => {
                    setCategoryFilter('')
                    setSelectedCategoryId('')
                    setIsRenamingCategory(false)
                  }}
                >
                  All
                </button>
                {categories.map((c) => {
                  const on = categoryFilter === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`chip${on ? ' is-selected' : ''}`}
                      onClick={() => {
                        setCategoryFilter(c.id)
                        setSelectedCategoryId(c.id)
                        setIsRenamingCategory(false)
                        setRenameCategoryValue(c.name)
                      }}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
              {!isMcat && (
                <div className="subject-toolbar">
                  {isRenamingCategory && selectedCategoryId ? (
                    <>
                      <input
                        value={renameCategoryValue}
                        onChange={(e) => setRenameCategoryValue(e.target.value)}
                        aria-label="New category name"
                        style={{ width: '10rem' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={async () => {
                          await window.studyHub.renameArea(selectedCategoryId, renameCategoryValue)
                          setIsRenamingCategory(false)
                          showStatus('Category renamed.')
                          await onChanged()
                        }}
                      >
                        Save name
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setIsRenamingCategory(false)
                          const current = categories.find((c) => c.id === selectedCategoryId)
                          setRenameCategoryValue(current?.name ?? '')
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!selectedCategoryId}
                        onClick={() => {
                          const current = categories.find((c) => c.id === selectedCategoryId)
                          if (!current) return
                          setRenameCategoryValue(current.name)
                          setIsRenamingCategory(true)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={!selectedCategoryId}
                        onClick={async () => {
                          const current = categories.find((c) => c.id === selectedCategoryId)
                          if (!current) return
                          if (
                            !window.confirm(
                              `Remove category “${current.name}”? Resources stay; they just lose this tag.`
                            )
                          ) {
                            return
                          }
                          await window.studyHub.deleteArea(current.id)
                          if (categoryFilter === current.id) setCategoryFilter('')
                          setSelectedCategoryId('')
                          setIsRenamingCategory(false)
                          showStatus('Category removed.')
                          await onChanged()
                        }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {resources.length === 0 ? (
          <div className="empty-state">
            <h3>No resources match</h3>
            <p>Add your first resource, or clear filters. You can also load sample data from Backup & projects.</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
              Add resource
            </button>
          </div>
        ) : (
          <div className="resource-list">
            {resources.map((r) => {
              const pct = completionPercent(r)
              const showProgress = hasUsefulProgress(r.progressSummary)
              const showStopping = Boolean(r.stoppingPointNote?.trim())
              const showNext = Boolean(r.nextAction?.trim())
              const showLast = Boolean(r.lastStudiedAt)
              return (
                <div key={r.id} className="resource-card" style={{ cursor: 'default' }}>
                  <button
                    type="button"
                    className="resource-card"
                    style={{ border: 0, padding: 0, boxShadow: 'none', background: 'transparent' }}
                    onClick={() => onOpenDetails(r.id)}
                  >
                    <div className="resource-meta-row">
                      <span className="badge">{RESOURCE_TYPE_LABELS[r.type]}</span>
                      {r.isSample && <span className="badge badge-sample">SAMPLE</span>}
                      {(r.studyAreaNames?.length ? r.studyAreaNames : r.studyAreaName ? [r.studyAreaName] : []).map(
                        (name) => (
                          <span key={name} className="badge">
                            {name}
                          </span>
                        )
                      )}
                    </div>
                    <h3>{r.name}</h3>
                    {showProgress && (
                      <p className="meta">
                        <strong>Progress:</strong> {r.progressSummary}
                      </p>
                    )}
                    {showStopping && (
                      <p className="meta">
                        <strong>Stopping point:</strong> {r.stoppingPointNote}
                      </p>
                    )}
                    {showNext && (
                      <p className="meta">
                        <strong>Next action:</strong> {r.nextAction}
                      </p>
                    )}
                    {showLast && (
                      <p className="meta">
                        <strong>Last studied:</strong> {new Date(r.lastStudiedAt!).toLocaleString()}
                      </p>
                    )}
                    {pct != null && (
                      <div className="progress-meter" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </button>
                  <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void onOpenResource(r)}
                    >
                      Open resource
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => onUpdateProgress(r.id)}>
                      Update progress
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => onOpenDetails(r.id)}>
                      Edit details
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {showAdd && (
        <AddResourceDialog
          projectId={projectId}
          categories={categories}
          onClose={() => setShowAdd(false)}
          onCreated={async () => {
            setShowAdd(false)
            showStatus('Resource saved.')
            await onChanged()
          }}
        />
      )}
    </div>
  )
}
