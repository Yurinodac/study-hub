export type ResourceType =
  | 'textbook'
  | 'video'
  | 'anki'
  | 'question_bank'
  | 'custom'

/** url / file / app (Windows .exe) / none */
export type LocationKind = 'url' | 'file' | 'app' | 'none'

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
  /** Where you are now (session / stopping point) — not aggregate completion. */
  currentChapter?: string
  currentPage?: number
  /**
   * Optional expected chapter count for the Overview bar when not every chapter is listed yet.
   * Aggregate completed count comes from the Chapters tab (marked done), not this field.
   */
  totalChapters?: number | null
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
  /** Optional weekly session goal — activity note only (not the progress bar). */
  weeklySessionGoal?: number | null
  lastSessionMinutes?: number
  lastNewCards?: number
  /**
   * Cumulative cards attempted (Overview / progress bar).
   * Progress tab session values are added onto these totals on save.
   */
  cardsAttempted?: number
  /** Cumulative cards correct — bar uses correct ÷ attempted. */
  cardsCorrect?: number
  note?: string
}

export interface QuestionBankConfig {
  /**
   * Cumulative questions attempted (Overview / progress bar).
   * Progress tab session values are added onto these totals on save.
   */
  questionsAttempted?: number
  /** Total questions in the bank/set when known — activity note only (bar uses correct ÷ attempted). */
  totalQuestions?: number | null
  /** Cumulative correct answers — bar uses correct ÷ attempted. */
  correctAnswers?: number | null
  /** Optional cumulative incorrect; if omitted, derived as max(0, attempted - correct). */
  incorrectAnswers?: number | null
  nextActionHint?: string
}

export interface CustomConfig {
  mode: 'checklist' | 'units' | 'time' | 'milestones'
  unitLabel?: string
  /**
   * Cumulative completed units (Overview / progress bar).
   * Progress tab session values are added onto this total on save.
   */
  completedUnits?: number
  /** Expected total units — enables done÷total progress bar. Set on Overview (or when adding). */
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
  sectionIds?: string[]
  sectionNames?: string[]
  details?: string
  [key: string]: unknown
}

export type HistoryExtras = {
  studiedPart?: string
  details?: string
  studyAreaIds?: string[]
  sectionId?: string
  /** Multiple Chapters-tab rows linked in one Progress save (reading / checklist). */
  sectionIds?: string[]
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

/** Official exam section codes for missed-question logging. */
export type ExamSectionCode = 'C/P' | 'CARS' | 'B/B' | 'P/S'

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

/** Missed question logged under a practice exam section (flashcard review). */
export interface MissedQuestion {
  id: string
  examId: string
  sectionCode: ExamSectionCode
  prompt: string
  correctAnswer: string
  commentary: string
  /** 1 (shaky) … 5 (solid) — confidence for flashcard review, not a mastery claim. */
  confidence: number
  inRotation: boolean
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
  /** Chapter/section completion when units are set on sections. */
  sectionProgress?: { done: number; total: number } | null
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
  missedQuestions?: MissedQuestion[]
}

export interface OpenResourceResult {
  ok: boolean
  message?: string
  needsUpdateLocation?: boolean
}

export interface CelebrationSettings {
  /** Absolute path under userData, or empty for default/message-only. */
  imagePath: string
  hasCustomImage: boolean
}

export const SCHEMA_VERSION = 5

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

export const EXAM_SECTION_CODES: ExamSectionCode[] = ['C/P', 'CARS', 'B/B', 'P/S']
