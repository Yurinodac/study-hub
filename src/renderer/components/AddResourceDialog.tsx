import { useState } from 'react'
import type { Category, LocationKind, ResourceConfig, ResourceType } from '../../shared/types'
import { RESOURCE_TYPE_LABELS } from '../../shared/types'
import { defaultConfigForType } from '../../shared/progress'

export default function AddResourceDialog({
  projectId,
  categories,
  onClose,
  onCreated
}: {
  projectId: string
  categories: Category[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ResourceType>('textbook')
  const [studyAreaIds, setStudyAreaIds] = useState<string[]>([])
  const [locationKind, setLocationKind] = useState<LocationKind>('none')
  const [locationValue, setLocationValue] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [config, setConfig] = useState<ResourceConfig>(defaultConfigForType('textbook'))

  const changeType = (t: ResourceType) => {
    setType(t)
    setConfig(defaultConfigForType(t))
    if (t === 'anki' && locationKind === 'none') {
      setLocationKind('app')
      setLocationValue('')
    }
  }

  const toggleArea = (id: string) => {
    setStudyAreaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-resource-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-resource-title">Add a resource</h2>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault()
            await window.studyHub.createResource({
              projectId,
              studyAreaIds,
              name,
              type,
              locationKind,
              locationValue,
              config,
              nextAction,
              stoppingPointNote: ''
            })
            setName('')
            setStudyAreaIds([])
            setLocationKind('none')
            setLocationValue('')
            setNextAction('')
            setType('textbook')
            setConfig(defaultConfigForType('textbook'))
            onCreated()
          }}
        >
          <label>
            1. Name
            <input
              name="add-resource-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Biology textbook"
            />
          </label>
          <label>
            2. Resource type
            <select value={type} onChange={(e) => changeType(e.target.value as ResourceType)}>
              {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="chip-fieldset">
            <legend>Categories (optional — pick one or more)</legend>
            <p className="helper-text">
              Tag the whole resource. Same shared list for this project — you do not create categories per resource.
            </p>
            {categories.length === 0 ? (
              <p className="meta">No categories yet. Add them on My Resources (or use an MCAT project).</p>
            ) : (
              <div className="chip-row" role="group" aria-label="Categories">
                {categories.map((c) => {
                  const on = studyAreaIds.includes(c.id)
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
            3. Location type
            <select
              value={locationKind}
              onChange={(e) => setLocationKind(e.target.value as LocationKind)}
            >
              <option value="none">No link yet</option>
              <option value="url">Website link</option>
              <option value="file">Local file</option>
              <option value="app">Desktop app (e.g. Anki)</option>
            </select>
          </label>
          {locationKind === 'url' && (
            <label>
              Website address
              <input
                type="url"
                inputMode="url"
                name="add-resource-url"
                autoComplete="off"
                value={locationValue}
                onChange={(e) => setLocationValue(e.target.value)}
                placeholder="https://"
              />
            </label>
          )}
          {locationKind === 'file' && (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const path = await window.studyHub.pickFile()
                  if (path) setLocationValue(path)
                }}
              >
                Choose file
              </button>
              <span className="meta">{locationValue || 'No file chosen'}</span>
            </div>
          )}
          {locationKind === 'app' && (
            <div>
              <p className="helper-text">
                Opens the app on this PC. For Anki: browse to <code>anki.exe</code> or use Find Anki. Study Hub does
                not sync Anki data.
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    const path = await window.studyHub.pickApp()
                    if (path) setLocationValue(path)
                  }}
                >
                  Browse to app
                </button>
                {type === 'anki' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={async () => {
                      const found = await window.studyHub.findAnkiExe()
                      if (found) setLocationValue(found)
                    }}
                  >
                    Find Anki
                  </button>
                )}
              </div>
              <p className="meta">{locationValue || 'No app chosen yet'}</p>
            </div>
          )}
          <label>
            4. Next action (optional)
            <input
              name="add-resource-next"
              autoComplete="off"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Continue Chapter 1, page 1"
            />
          </label>

          <details className="advanced">
            <summary>Advanced tracking defaults</summary>
            <TypeDefaultsEditor type={type} config={config} onChange={setConfig} />
          </details>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary">
              Save resource
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TypeDefaultsEditor({
  type,
  config,
  onChange
}: {
  type: ResourceType
  config: ResourceConfig
  onChange: (c: ResourceConfig) => void
}) {
  if (type === 'textbook') {
    const c = config as Extract<ResourceConfig, { trackChapters?: boolean }>
    return (
      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <label>
          <input
            type="checkbox"
            checked={!!c.trackChapters}
            onChange={(e) => onChange({ ...c, trackChapters: e.target.checked })}
          />{' '}
          Track chapters
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!c.trackPages}
            onChange={(e) => onChange({ ...c, trackPages: e.target.checked })}
          />{' '}
          Track pages
        </label>
        <label>
          Expected total chapters (optional — Overview bar; mark chapters done on Chapters tab)
          <input
            type="number"
            min={1}
            value={c.totalChapters ?? ''}
            onChange={(e) =>
              onChange({ ...c, totalChapters: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label>
          Total pages (optional — page-based bar if you prefer pages)
          <input
            type="number"
            min={1}
            value={c.totalPages ?? ''}
            onChange={(e) =>
              onChange({ ...c, totalPages: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
      </div>
    )
  }

  if (type === 'video') {
    const c = config as Extract<ResourceConfig, { currentLesson?: string }>
    return (
      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <label>
          Total lessons (optional)
          <input
            type="number"
            min={1}
            value={c.totalLessons ?? ''}
            onChange={(e) =>
              onChange({ ...c, totalLessons: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
      </div>
    )
  }

  if (type === 'custom') {
    const c = config as Extract<ResourceConfig, { mode: string }>
    return (
      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <label>
          Tracking style
          <select
            value={c.mode}
            onChange={(e) => onChange({ ...c, mode: e.target.value as typeof c.mode })}
          >
            <option value="units">Completed units</option>
            <option value="checklist">Checklist</option>
            <option value="time">Time spent</option>
            <option value="milestones">Milestones</option>
          </select>
        </label>
        {(c.mode === 'checklist' || c.mode === 'milestones') && (
          <p className="helper-text">
            After creating, define each {c.mode === 'checklist' ? 'checklist item' : 'milestone'} on the{' '}
            {c.mode === 'checklist' ? 'Checklist' : 'Milestones'} tab. Progress checks them off; the Overview bar
            uses that list.
          </p>
        )}
        {c.mode === 'units' && (
          <>
            <label>
              Unit label
              <input
                value={c.unitLabel ?? 'modules'}
                onChange={(e) => onChange({ ...c, unitLabel: e.target.value })}
              />
            </label>
            <label>
              Total units (for the progress bar)
              <input
                type="number"
                min={1}
                value={c.totalUnits ?? ''}
                onChange={(e) =>
                  onChange({ ...c, totalUnits: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>
            <p className="helper-text">
              Progress sessions will add completed units toward this total (done ÷ total).
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <p className="meta" style={{ marginTop: '0.75rem' }}>
      You can set detailed progress after the resource is created.
    </p>
  )
}
