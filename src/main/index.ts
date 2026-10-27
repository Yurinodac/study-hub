import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, extname } from 'path'
import { existsSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, unlinkSync } from 'fs'
import { pathToFileURL } from 'url'
import type { BackupPayload, LocationKind, OpenResourceResult, ResourceType } from '../shared/types'
import { SCHEMA_VERSION } from '../shared/types'

const CELEBRATION_META_KEY = 'celebrationImageRelPath'
const CELEBRATION_DIR = 'celebration'

// Register early so native-module failures can surface a dialog instead of a silent exit.
process.on('uncaughtException', (error) => {
  try {
    const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
    const logPath = join(app.getPath('userData'), 'startup-error.log')
    writeFileSync(logPath, `${new Date().toISOString()}\n${message}\n`, 'utf8')
    dialog.showErrorBox(
      'Study Hub could not start',
      `${message}\n\nA copy of this error was saved to:\n${logPath}`
    )
  } catch {
    dialog.showErrorBox('Study Hub could not start', String(error))
  }
  app.exit(1)
})

import * as db from './database'
import { hasSampleData, loadSampleData } from './sample-data'

let mainWindow: BrowserWindow | null = null

const COMMON_ANKI_PATHS = [
  join(process.env.LOCALAPPDATA || '', 'Programs', 'Anki', 'anki.exe'),
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Anki', 'anki.exe'),
  join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Anki', 'anki.exe')
]

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: 'Study Hub',
    backgroundColor: '#e8eef2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function userDataPath(): string {
  return app.getPath('userData')
}

function celebrationAbsPath(): string | null {
  const rel = db.getMeta(CELEBRATION_META_KEY)
  if (!rel) return null
  const abs = join(userDataPath(), rel)
  return existsSync(abs) ? abs : null
}

function getCelebrationSettings(): { imagePath: string; hasCustomImage: boolean; imageUrl: string | null } {
  const abs = celebrationAbsPath()
  if (!abs) {
    return { imagePath: '', hasCustomImage: false, imageUrl: null }
  }
  return {
    imagePath: abs,
    hasCustomImage: true,
    imageUrl: pathToFileURL(abs).href
  }
}

async function openResourceLocation(
  kind: LocationKind,
  value: string
): Promise<OpenResourceResult> {
  const trimmed = value.trim()
  if (kind === 'none' || !trimmed) {
    return {
      ok: false,
      message: 'No resource is linked yet.',
      needsUpdateLocation: false
    }
  }

  if (kind === 'url') {
    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return {
          ok: false,
          message: 'Only http and https website links can be opened.',
          needsUpdateLocation: true
        }
      }
      await shell.openExternal(url.toString())
      return { ok: true }
    } catch {
      return {
        ok: false,
        message: 'That website address does not look valid. You can update it in resource details.',
        needsUpdateLocation: true
      }
    }
  }

  if (kind === 'app') {
    if (!existsSync(trimmed)) {
      return {
        ok: false,
        message:
          'That app could not be found. Browse to anki.exe (or another app) in resource details, or install Anki first.',
        needsUpdateLocation: true
      }
    }
    const err = await shell.openPath(trimmed)
    if (err) {
      return {
        ok: false,
        message: `Windows could not open that app (${err}). Try updating the location.`,
        needsUpdateLocation: true
      }
    }
    return { ok: true }
  }

  // file
  if (!existsSync(trimmed)) {
    return {
      ok: false,
      message: 'That file could not be found. It may have been moved or renamed. Update the location?',
      needsUpdateLocation: true
    }
  }
  const err = await shell.openPath(trimmed)
  if (err) {
    return {
      ok: false,
      message: `Windows could not open that file (${err}). Try updating the location.`,
      needsUpdateLocation: true
    }
  }
  return { ok: true }
}

function findAnkiExe(): string | null {
  for (const p of COMMON_ANKI_PATHS) {
    if (p && existsSync(p)) return p
  }
  return null
}

function registerIpc(): void {
  ipcMain.handle('app:getPaths', () => ({
    userData: userDataPath(),
    dbPath: db.getDbPath(),
    schemaVersion: SCHEMA_VERSION
  }))

  ipcMain.handle('projects:list', () => db.listProjects())
  ipcMain.handle(
    'projects:create',
    (_e, name: string, preset?: 'mcat' | 'custom') => db.createProject(name, preset ?? 'custom')
  )
  ipcMain.handle('projects:rename', (_e, id: string, name: string) => {
    db.renameProject(id, name)
    return db.listProjects()
  })
  ipcMain.handle('projects:archive', (_e, id: string) => {
    db.archiveProject(id)
    return db.listProjects()
  })
  ipcMain.handle('projects:ensureMcatCategories', (_e, projectId: string) =>
    db.ensureMcatCategories(projectId)
  )

  ipcMain.handle('areas:list', (_e, projectId: string) => db.listCategories(projectId))
  ipcMain.handle('areas:create', (_e, projectId: string, name: string) =>
    db.createCategory(projectId, name)
  )
  ipcMain.handle('areas:rename', (_e, id: string, name: string) => {
    db.renameCategory(id, name)
  })
  ipcMain.handle('areas:delete', (_e, id: string) => {
    db.deleteCategory(id)
  })
  ipcMain.handle('sections:names', (_e, projectId: string) => db.listSectionNames(projectId))

  ipcMain.handle('exams:list', (_e, projectId: string) => db.listPracticeExams(projectId))
  ipcMain.handle('exams:upsert', (_e, input) => db.upsertPracticeExam(input))
  ipcMain.handle('exams:delete', (_e, id: string) => {
    db.deletePracticeExam(id)
  })

  ipcMain.handle('missed:list', (_e, examId: string) => db.listMissedQuestions(examId))
  ipcMain.handle('missed:listForResource', (_e, resourceId: string) =>
    db.listMissedQuestionsForResource(resourceId)
  )
  ipcMain.handle('missed:listRotation', (_e, projectId: string) =>
    db.listMissedQuestionsInRotation(projectId)
  )
  ipcMain.handle('missed:upsert', (_e, input) => db.upsertMissedQuestion(input))
  ipcMain.handle('missed:setConfidence', (_e, id: string, confidence: number) =>
    db.updateMissedQuestionConfidence(id, confidence)
  )
  ipcMain.handle('missed:setRotation', (_e, id: string, inRotation: boolean) =>
    db.setMissedQuestionInRotation(id, inRotation)
  )
  ipcMain.handle('missed:delete', (_e, id: string) => {
    db.deleteMissedQuestion(id)
  })

  ipcMain.handle('testDate:get', (_e, projectId: string) => db.getProjectTestDate(projectId))
  ipcMain.handle('testDate:set', (_e, projectId: string, ymd: string | null) =>
    db.setProjectTestDate(projectId, ymd)
  )

  ipcMain.handle(
    'resources:list',
    (
      _e,
      projectId: string,
      opts?: {
        query?: string
        studyAreaId?: string | null
        categoryId?: string | null
        type?: ResourceType | null
        sectionName?: string | null
      }
    ) =>
      db.listResources(projectId, {
        ...opts,
        studyAreaId: opts?.categoryId ?? opts?.studyAreaId
      })
  )
  ipcMain.handle('resources:get', (_e, id: string) => db.getResource(id))
  ipcMain.handle('resources:create', (_e, input) => db.createResource(input))
  ipcMain.handle(
    'resources:update',
    (
      _e,
      id: string,
      patch,
      historySummary?: string,
      historyExtras?: import('../shared/types').HistoryExtras
    ) => db.updateResource(id, patch, historySummary, historyExtras)
  )
  ipcMain.handle('resources:open', async (_e, kind: LocationKind, value: string) =>
    openResourceLocation(kind, value)
  )
  ipcMain.handle('resources:findAnki', () => findAnkiExe())

  ipcMain.handle('sections:list', (_e, resourceId: string, studyAreaId?: string | null) =>
    db.listSections(resourceId, studyAreaId)
  )
  ipcMain.handle('sections:upsert', (_e, input) => db.upsertSection(input))
  ipcMain.handle('sections:delete', (_e, id: string) => db.deleteSection(id))

  ipcMain.handle('history:list', (_e, resourceId: string) => db.listHistory(resourceId))
  ipcMain.handle('history:listProject', (_e, projectId: string) => db.listProjectHistory(projectId))
  ipcMain.handle('history:delete', (_e, historyId: string) => {
    db.deleteHistoryEntry(historyId)
  })

  ipcMain.handle('queue:list', (_e, projectId: string) => db.listQueue(projectId))
  ipcMain.handle('queue:listTomorrow', (_e, projectId: string) => db.listTomorrowQueue(projectId))
  ipcMain.handle(
    'queue:listForDate',
    (_e, projectId: string, forDate: string, includeCompleted?: boolean) =>
      db.listQueueForDate(projectId, forDate, includeCompleted)
  )
  ipcMain.handle(
    'queue:listInRange',
    (_e, projectId: string, startYmd: string, endYmd: string) =>
      db.listQueueInRange(projectId, startYmd, endYmd)
  )
  ipcMain.handle('queue:add', (_e, input) => db.addQueueItem(input))
  ipcMain.handle('queue:addDates', (_e, input) => db.addQueueItemsForDates(input))
  ipcMain.handle('queue:update', (_e, id: string, patch) => {
    db.updateQueueItem(id, patch)
  })
  ipcMain.handle('queue:complete', (_e, id: string) => db.completeQueueItem(id))
  ipcMain.handle('queue:delete', (_e, id: string) => {
    db.deleteQueueItem(id)
  })
  ipcMain.handle('queue:reorder', (_e, projectId: string, orderedIds: string[]) => {
    db.reorderQueue(projectId, orderedIds)
  })

  ipcMain.handle('sample:status', (_e, projectId: string) => hasSampleData(projectId))
  ipcMain.handle('sample:load', (_e, projectId: string) => {
    if (!hasSampleData(projectId)) loadSampleData(projectId)
    return true
  })
  ipcMain.handle('sample:remove', (_e, projectId: string) => db.removeSampleData(projectId))

  ipcMain.handle('celebration:get', () => getCelebrationSettings())
  ipcMain.handle('celebration:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose a celebration image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return getCelebrationSettings()
    const src = result.filePaths[0]
    const dir = join(userDataPath(), CELEBRATION_DIR)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const destName = `celebrate${extname(src).toLowerCase() || '.png'}`
    const dest = join(dir, destName)
    // Replace previous custom image files in the folder.
    try {
      for (const old of ['celebrate.png', 'celebrate.jpg', 'celebrate.jpeg', 'celebrate.gif', 'celebrate.webp']) {
        const p = join(dir, old)
        if (existsSync(p) && p !== dest) unlinkSync(p)
      }
    } catch {
      /* ignore */
    }
    copyFileSync(src, dest)
    db.setMeta(CELEBRATION_META_KEY, join(CELEBRATION_DIR, destName))
    return getCelebrationSettings()
  })
  ipcMain.handle('celebration:clear', () => {
    const abs = celebrationAbsPath()
    if (abs && existsSync(abs)) {
      try {
        unlinkSync(abs)
      } catch {
        /* ignore */
      }
    }
    db.setMeta(CELEBRATION_META_KEY, '')
    return getCelebrationSettings()
  })

  ipcMain.handle('backup:export', async () => {
    const payload = db.exportBackup()
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Study Hub backup',
      defaultPath: `study-hub-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Study Hub backup', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('backup:restore', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Restore Study Hub backup',
      filters: [{ name: 'Study Hub backup', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
    } catch {
      return { ok: false, message: 'Could not read that backup file. It may be damaged.' }
    }

    const validated = db.validateBackup(parsed)
    if (!validated.ok) return { ok: false, message: validated.message }

    const confirm = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Replace my data'],
      defaultId: 0,
      cancelId: 0,
      title: 'Replace Study Hub data?',
      message: 'Restore will replace all current projects, resources, and history.',
      detail:
        'A recovery copy of your current data will be saved first. This cannot be undone except by restoring that recovery file or another backup.'
    })
    if (confirm.response !== 1) return { ok: false, canceled: true }

    const recoveryPath = db.restoreBackup(validated.data as BackupPayload, join(userDataPath(), 'recovery'))
    return { ok: true, recoveryPath }
  })

  ipcMain.handle('dialog:pickFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose a study file',
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:pickApp', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose an app to open (e.g. anki.exe)',
      properties: ['openFile'],
      filters: [
        { name: 'Applications', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
}

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
  try {
    const logPath = join(userDataPath(), 'startup-error.log')
    writeFileSync(logPath, `${new Date().toISOString()}\n${message}\n`, 'utf8')
    dialog.showErrorBox(
      'Study Hub could not start',
      `${message}\n\nA copy of this error was saved to:\n${logPath}`
    )
  } catch {
    dialog.showErrorBox('Study Hub could not start', message)
  }
}

app.whenReady().then(() => {
  try {
    openDatabaseSafe()
    registerIpc()
    createWindow()
  } catch (error) {
    showStartupError(error)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error) => {
  showStartupError(error)
  app.quit()
})

function openDatabaseSafe(): void {
  db.openDatabase(userDataPath())
  db.ensureDefaultProject()
  // First launch: do not auto-load sample data; user opts in from UI.
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
