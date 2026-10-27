import { contextBridge, ipcRenderer } from 'electron'
import type { LocationKind, ResourceType } from '../shared/types'

const api = {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),

  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name: string, preset?: 'mcat' | 'custom') =>
    ipcRenderer.invoke('projects:create', name, preset),
  renameProject: (id: string, name: string) => ipcRenderer.invoke('projects:rename', id, name),
  archiveProject: (id: string) => ipcRenderer.invoke('projects:archive', id),
  ensureMcatCategories: (projectId: string) =>
    ipcRenderer.invoke('projects:ensureMcatCategories', projectId),

  listAreas: (projectId: string) => ipcRenderer.invoke('areas:list', projectId),
  listCategories: (projectId: string) => ipcRenderer.invoke('areas:list', projectId),
  createArea: (projectId: string, name: string) => ipcRenderer.invoke('areas:create', projectId, name),
  renameArea: (id: string, name: string) => ipcRenderer.invoke('areas:rename', id, name),
  deleteArea: (id: string) => ipcRenderer.invoke('areas:delete', id),
  listSectionNames: (projectId: string) => ipcRenderer.invoke('sections:names', projectId),

  listPracticeExams: (projectId: string) => ipcRenderer.invoke('exams:list', projectId),
  upsertPracticeExam: (input: unknown) => ipcRenderer.invoke('exams:upsert', input),
  deletePracticeExam: (id: string) => ipcRenderer.invoke('exams:delete', id),

  listMissedQuestions: (examId: string) => ipcRenderer.invoke('missed:list', examId),
  listMissedQuestionsForResource: (resourceId: string) =>
    ipcRenderer.invoke('missed:listForResource', resourceId),
  listMissedQuestionsInRotation: (projectId: string) =>
    ipcRenderer.invoke('missed:listRotation', projectId),
  upsertMissedQuestion: (input: unknown) => ipcRenderer.invoke('missed:upsert', input),
  setMissedQuestionConfidence: (id: string, confidence: number) =>
    ipcRenderer.invoke('missed:setConfidence', id, confidence),
  setMissedQuestionInRotation: (id: string, inRotation: boolean) =>
    ipcRenderer.invoke('missed:setRotation', id, inRotation),
  deleteMissedQuestion: (id: string) => ipcRenderer.invoke('missed:delete', id),

  getProjectTestDate: (projectId: string) =>
    ipcRenderer.invoke('testDate:get', projectId) as Promise<string | null>,
  setProjectTestDate: (projectId: string, ymd: string | null) =>
    ipcRenderer.invoke('testDate:set', projectId, ymd) as Promise<string | null>,

  listResources: (
    projectId: string,
    opts?: {
      query?: string
      studyAreaId?: string | null
      categoryId?: string | null
      type?: ResourceType | null
      sectionName?: string | null
    }
  ) => ipcRenderer.invoke('resources:list', projectId, opts),
  getResource: (id: string) => ipcRenderer.invoke('resources:get', id),
  createResource: (input: unknown) => ipcRenderer.invoke('resources:create', input),
  updateResource: (
    id: string,
    patch: unknown,
    historySummary?: string,
    historyExtras?: import('../shared/types').HistoryExtras
  ) => ipcRenderer.invoke('resources:update', id, patch, historySummary, historyExtras),
  openResource: (kind: LocationKind, value: string) =>
    ipcRenderer.invoke('resources:open', kind, value),
  findAnkiExe: () => ipcRenderer.invoke('resources:findAnki') as Promise<string | null>,

  listSections: (resourceId: string, studyAreaId?: string | null) =>
    ipcRenderer.invoke('sections:list', resourceId, studyAreaId),
  upsertSection: (input: unknown) => ipcRenderer.invoke('sections:upsert', input),
  deleteSection: (id: string) => ipcRenderer.invoke('sections:delete', id),

  listHistory: (resourceId: string) => ipcRenderer.invoke('history:list', resourceId),
  listProjectHistory: (projectId: string) => ipcRenderer.invoke('history:listProject', projectId),
  deleteHistory: (historyId: string) => ipcRenderer.invoke('history:delete', historyId),

  listQueue: (projectId: string) => ipcRenderer.invoke('queue:list', projectId),
  listTomorrowQueue: (projectId: string) => ipcRenderer.invoke('queue:listTomorrow', projectId),
  listQueueForDate: (projectId: string, forDate: string, includeCompleted?: boolean) =>
    ipcRenderer.invoke('queue:listForDate', projectId, forDate, includeCompleted),
  listQueueInRange: (projectId: string, startYmd: string, endYmd: string) =>
    ipcRenderer.invoke('queue:listInRange', projectId, startYmd, endYmd),
  addQueueItem: (input: unknown) => ipcRenderer.invoke('queue:add', input),
  addQueueItemsForDates: (input: unknown) => ipcRenderer.invoke('queue:addDates', input),
  updateQueueItem: (id: string, patch: unknown) => ipcRenderer.invoke('queue:update', id, patch),
  completeQueueItem: (id: string) => ipcRenderer.invoke('queue:complete', id) as Promise<{
    progressRecorded: boolean
    resourceId: string | null
  }>,
  deleteQueueItem: (id: string) => ipcRenderer.invoke('queue:delete', id),
  reorderQueue: (projectId: string, orderedIds: string[]) =>
    ipcRenderer.invoke('queue:reorder', projectId, orderedIds),

  sampleStatus: (projectId: string) => ipcRenderer.invoke('sample:status', projectId),
  loadSample: (projectId: string) => ipcRenderer.invoke('sample:load', projectId),
  removeSample: (projectId: string) => ipcRenderer.invoke('sample:remove', projectId),

  getCelebration: () =>
    ipcRenderer.invoke('celebration:get') as Promise<{
      imagePath: string
      hasCustomImage: boolean
      imageUrl: string | null
    }>,
  pickCelebrationImage: () =>
    ipcRenderer.invoke('celebration:pick') as Promise<{
      imagePath: string
      hasCustomImage: boolean
      imageUrl: string | null
    }>,
  clearCelebrationImage: () =>
    ipcRenderer.invoke('celebration:clear') as Promise<{
      imagePath: string
      hasCustomImage: boolean
      imageUrl: string | null
    }>,

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  pickFile: () => ipcRenderer.invoke('dialog:pickFile'),
  pickApp: () => ipcRenderer.invoke('dialog:pickApp')
}

contextBridge.exposeInMainWorld('studyHub', api)

export type StudyHubApi = typeof api
