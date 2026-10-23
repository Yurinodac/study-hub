export type ResourceType =
  | 'textbook'
  | 'video'
  | 'anki'
  | 'question_bank'
  | 'custom'

export type LocationKind = 'url' | 'file' | 'none'

export type ProjectPreset = 'mcat' | 'custom'

export interface Project {
  id: string
  name: string
  createdAt: string
  archived: boolean
  /** mcat = seeded shared study categories; custom = user-editable category list. */
  preset: ProjectPreset
}

/** Shared study category tag for a project (DB table: study_areas). */
export interface Category {
  id: string
  projectId: string
  name: string
  sortOrder: number
}

/** @deprecated Prefer Category — kept for older imports. */
export type StudyArea = Category

export interface TextbookConfig {
  trackChapters: boolean
  trackPages: boolean
  currentChapter?: string
  currentPage?: number
  totalPages?: number | null
}

export interface VideoConfig {
  currentLesson?: string
  timestampSeconds?: number
  completedLessons?: number
  totalLessons?: number | null
}

export interface AnkiConfig {
  reviewSessionsThisWeek?: number
  lastSessionMinutes?: number
  lastNewCards?: number
  note?: string
}

export interface QuestionBankConfig {
  questionsAttempted?: number
  correctAnswers?: number | null
  nextActionHint?: string
}

export interface CustomConfig {
  mode: 'checklist' | 'units' | 'time' | 'milestones'
  unitLabel?: string
  completedUnits?: number
  totalUnits?: number | null
  timeSpentMinutes?: number
  checklist?: Array<{ id: string; label: string; done: boolean }>
  milestones?: Array<{ id: string; label: string; done: boolean }>
}

export type ResourceConfig =
  | TextbookConfig
  | VideoConfig
  | AnkiConfig
  | QuestionBankConfig
  | CustomConfig

export interface ResourceSection {
  id: string
  resourceId: string
  /** Legacy; chapter-level category tags are not used in v1 UI. */
  studyAreaId: string | null
  name: string
  sortOrder: number
  totalUnits: number | null
  completedUnits: number
  notes: string
}

export interface Resource {
  id: string
  projectId: string
  /** @deprecated Prefer categoryIds / studyAreaIds[0]. */
  studyAreaId: string | null
  /** Category tag ids (whole-resource). Same as categoryIds. */
  studyAreaIds: string[]
  name: string
  type: ResourceType
  locationKind: LocationKind
  locationValue: string
  config: ResourceConfig
  stoppingPointNote: string
  nextAction: string
  notes: string
  lastStudiedAt: string | null
  confidence: number | null
  archived: boolean
  isSample: boolean
  createdAt: string
  updatedAt: string
}

export interface StudyHistoryPayload {
  config?: ResourceConfig
  stoppingPointNote?: string
  nextAction?: string
  studiedPart?: string
  studyAreaIds?: string[]
  studyAreaNames?: string[]
  sectionId?: string
  sectionName?: string
  details?: string
  [key: string]: unknown
}

export type HistoryExtras = {
  studiedPart?: string
  details?: string
  studyAreaIds?: string[]
  sectionId?: string
}

export interface StudyHistoryEntry {
  id: string
  resourceId: string
  recordedAt: string
  summary: string
  payload: StudyHistoryPayload
}

export interface ProjectHistoryEntry extends StudyHistoryEntry {
  resourceName: string
}

export interface QueueItem {
  id: string
  projectId: string
  resourceId: string | null
  description: string
  estimatedMinutes: number | null
  sortOrder: number
  completed: boolean
  forDate: string
  createdAt: string
}

export type PracticeReviewStatus = 'not_reviewed' | 'in_progress' | 'reviewed'

export interface PracticeExam {
  id: string
  projectId: string
  name: string
  takenOn: string
  scoreCp: number
  scoreCars: number
  scoreBb: number
  scorePs: number
  total: number
  reviewStatus: PracticeReviewStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ResourceCard extends Resource {
  projectName: string
  studyAreaName: string | null
  studyAreaNames: string[]
  /** Alias of studyAreaNames for UI. */
  categoryNames: string[]
  progressSummary: string
}

export interface BackupPayload {
  schemaVersion: number
  exportedAt: string
  appName: string
  projects: Project[]
  /** Categories (legacy key studyAreas kept for backup compat). */
  studyAreas: Category[]
  resources: Resource[]
  sections: ResourceSection[]
  history: StudyHistoryEntry[]
  queue: QueueItem[]
  practiceExams?: PracticeExam[]
}

export interface OpenResourceResult {
  ok: boolean
  message?: string
  needsUpdateLocation?: boolean
}

export const SCHEMA_VERSION = 4

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  textbook: 'Textbook / reading',
  video: 'Video / audio',
  anki: 'Anki / flashcards',
  question_bank: 'Question bank / practice',
  custom: 'Custom'
}

export const PRACTICE_REVIEW_LABELS: Record<PracticeReviewStatus, string> = {
  not_reviewed: 'Not reviewed yet',
  in_progress: 'Review in progress',
  reviewed: 'Reviewed'
}
