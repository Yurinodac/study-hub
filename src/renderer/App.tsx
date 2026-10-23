import { useCallback, useEffect, useState } from 'react'
import type { Category, Project, Resource } from '../shared/types'
import TodayScreen from './screens/TodayScreen'
import ResourcesScreen from './screens/ResourcesScreen'
import ResourceDetailsScreen from './screens/ResourceDetailsScreen'
import SettingsPanel from './components/SettingsPanel'
import StatusBanner from './components/StatusBanner'

type Screen = 'today' | 'resources' | 'details' | 'settings'
export type DetailsFocus = 'overview' | 'progress' | 'history'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [areas, setAreas] = useState<Category[]>([])
  const [screen, setScreen] = useState<Screen>('today')
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [detailsFocus, setDetailsFocus] = useState<DetailsFocus>('overview')
  const [status, setStatus] = useState<{ message: string; tone?: 'ok' | 'warn' } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  const showStatus = useCallback((message: string, tone: 'ok' | 'warn' = 'ok') => {
    setStatus({ message, tone })
  }, [])

  const loadProjects = useCallback(async () => {
    const list = await window.studyHub.listProjects()
    setProjects(list)
    if (!projectId && list[0]) setProjectId(list[0].id)
    if (projectId && !list.find((p: Project) => p.id === projectId) && list[0]) {
      setProjectId(list[0].id)
    }
    if (list.length === 0) {
      const created = await window.studyHub.createProject('MCAT', 'mcat')
      setProjects([created])
      setProjectId(created.id)
    }
  }, [projectId])

  const loadAreas = useCallback(async () => {
    if (!projectId) return
    const project = (await window.studyHub.listProjects()).find((p: Project) => p.id === projectId)
    if (project?.preset === 'mcat') {
      setAreas(await window.studyHub.ensureMcatCategories(projectId))
    } else {
      setAreas(await window.studyHub.listCategories(projectId))
    }
  }, [projectId])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects, refreshKey])

  useEffect(() => {
    void loadAreas()
  }, [loadAreas, refreshKey])

  const openResourceDetails = (id: string, focus: DetailsFocus = 'overview') => {
    setSelectedResourceId(id)
    setDetailsFocus(focus)
    setScreen('details')
  }

  /** OS-open only. All failures go to the top banner — never navigate to details. */
  const openLinkedResource = async (
    resource: Pick<Resource, 'locationKind' | 'locationValue' | 'id'>
  ): Promise<{ ok: boolean; noLink?: boolean; message?: string }> => {
    if (resource.locationKind === 'none' || !resource.locationValue?.trim()) {
      showStatus('No resource is linked yet.', 'warn')
      return { ok: false, noLink: true, message: 'No resource is linked yet.' }
    }
    const result = await window.studyHub.openResource(resource.locationKind, resource.locationValue)
    if (result.ok) {
      showStatus('Opened in your default app or browser.')
      return { ok: true }
    }
    showStatus(result.message || 'No resource is linked yet.', 'warn')
    return {
      ok: false,
      noLink: result.message === 'No resource is linked yet.',
      message: result.message
    }
  }

  if (!projectId && projects.length === 0) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-block">
            <h1 className="brand">Study Hub</h1>
            <p className="brand-tag">Loading your study data…</p>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {status && (
        <StatusBanner
          message={status.message}
          tone={status.tone}
          onDismiss={() => setStatus(null)}
        />
      )}
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand">Study Hub</h1>
          <p className="brand-tag">See what to study next. Remember where you stopped.</p>
        </div>
        <div className="topbar-controls">
          <div className="field-inline">
            <label htmlFor="project-select">Study project</label>
            <select
              id="project-select"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setScreen('today')
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <nav className="nav" aria-label="Main">
            <button
              type="button"
              aria-current={screen === 'today' ? 'page' : undefined}
              onClick={() => setScreen('today')}
            >
              Today
            </button>
            <button
              type="button"
              aria-current={screen === 'resources' || screen === 'details' ? 'page' : undefined}
              onClick={() => setScreen('resources')}
            >
              My Resources
            </button>
            <button
              type="button"
              aria-current={screen === 'settings' ? 'page' : undefined}
              onClick={() => setScreen('settings')}
            >
              Backup & projects
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {screen === 'today' && (
          <TodayScreen
            projectId={projectId}
            refreshKey={refreshKey}
            onOpenResource={openLinkedResource}
            onUpdateProgress={(id) => openResourceDetails(id, 'progress')}
            onOpenDetails={(id) => openResourceDetails(id, 'overview')}
            onChanged={bump}
            showStatus={showStatus}
          />
        )}
        {screen === 'resources' && (
          <ResourcesScreen
            projectId={projectId}
            projectPreset={projects.find((p) => p.id === projectId)?.preset ?? 'custom'}
            categories={areas}
            refreshKey={refreshKey}
            onOpenDetails={(id) => openResourceDetails(id, 'overview')}
            onUpdateProgress={(id) => openResourceDetails(id, 'progress')}
            onOpenResource={openLinkedResource}
            onChanged={async () => {
              bump()
              await loadAreas()
            }}
            showStatus={showStatus}
          />
        )}
        {screen === 'details' && selectedResourceId && (
          <ResourceDetailsScreen
            resourceId={selectedResourceId}
            categories={areas}
            initialFocus={detailsFocus}
            onBack={() => setScreen('resources')}
            onChanged={bump}
            onOpenResource={openLinkedResource}
            showStatus={showStatus}
          />
        )}
        {screen === 'settings' && (
          <SettingsPanel
            projectId={projectId}
            projects={projects}
            onProjectsChanged={async () => {
              bump()
              await loadProjects()
            }}
            onChanged={bump}
            showStatus={showStatus}
            onSelectProject={setProjectId}
          />
        )}
      </main>
    </div>
  )
}
