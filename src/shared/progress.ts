import type {
  AnkiConfig,
  CustomConfig,
  QuestionBankConfig,
  Resource,
  ResourceConfig,
  ResourceType,
  TextbookConfig,
  VideoConfig
} from './types'

function isTextbook(c: ResourceConfig, type: ResourceType): c is TextbookConfig {
  return type === 'textbook'
}

function isVideo(c: ResourceConfig, type: ResourceType): c is VideoConfig {
  return type === 'video'
}

function isAnki(c: ResourceConfig, type: ResourceType): c is AnkiConfig {
  return type === 'anki'
}

function isQuestionBank(c: ResourceConfig, type: ResourceType): c is QuestionBankConfig {
  return type === 'question_bank'
}

function isCustom(c: ResourceConfig, type: ResourceType): c is CustomConfig {
  return type === 'custom'
}

export type CompletionBar = {
  /** Short label for the bar (completion/activity — never “mastery”). */
  label: string
  done: number
  total: number | null
  /** Only set when a meaningful total exists. */
  percent: number | null
  /** Extra activity line (e.g. Anki sessions without a goal). */
  activity?: string
  /** Separate completion-adjacent readout (e.g. correct vs incorrect). */
  secondary?: string
}

function clampPct(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

/**
 * Completion / activity bar for a resource.
 * Never invents an overall % across resources. Never frames Anki or Q-bank accuracy as “knowledge mastery.”
 */
export function getCompletionBar(
  resource: Pick<Resource, 'type' | 'config'>,
  sectionProgress?: { done: number; total: number } | null
): CompletionBar {
  const { type, config } = resource

  if (isTextbook(config, type)) {
    const pageNote =
      config.trackPages && config.currentPage != null
        ? config.totalPages
          ? `Page ${config.currentPage} of ${config.totalPages}`
          : `Page ${config.currentPage}`
        : undefined
    const chapterLabel =
      config.trackChapters && config.currentChapter ? `Current: chapter ${config.currentChapter}` : undefined

    // Aggregate completion from Chapters tab (marked done ÷ total).
    if (sectionProgress && sectionProgress.total > 0) {
      return {
        label: 'Chapters',
        done: sectionProgress.done,
        total: sectionProgress.total,
        percent: clampPct(sectionProgress.done, sectionProgress.total),
        activity: [chapterLabel, pageNote].filter(Boolean).join(' · ') || undefined
      }
    }
    // Optional page totals when the user prefers a page-based bar.
    if (config.trackPages && config.totalPages != null && config.totalPages > 0) {
      const page = config.currentPage ?? 0
      return {
        label: 'Pages',
        done: page,
        total: config.totalPages,
        percent: clampPct(page, config.totalPages),
        activity: chapterLabel
      }
    }
    const parts: string[] = []
    if (config.trackChapters && config.currentChapter) parts.push(`Chapter ${config.currentChapter}`)
    if (config.trackPages && config.currentPage != null) parts.push(`page ${config.currentPage}`)
    return {
      label: 'Reading',
      done: 0,
      total: null,
      percent: null,
      activity: parts.length ? parts.join(', ') : 'No reading progress yet — mark chapters done on the Chapters tab'
    }
  }

  if (isVideo(config, type)) {
    if (config.totalLessons != null && config.totalLessons > 0) {
      const done = config.completedLessons ?? 0
      return {
        label: 'Lessons',
        done,
        total: config.totalLessons,
        percent: clampPct(done, config.totalLessons),
        activity: config.currentLesson ? `Current: lesson ${config.currentLesson}` : undefined
      }
    }
    const parts: string[] = []
    if (config.currentLesson) parts.push(`Lesson ${config.currentLesson}`)
    if (config.timestampSeconds != null) parts.push(`at ${formatTimestamp(config.timestampSeconds)}`)
    if (config.completedLessons != null && config.completedLessons > 0) {
      parts.push(`${config.completedLessons} lessons completed`)
    }
    return {
      label: 'Lessons',
      done: config.completedLessons ?? 0,
      total: null,
      percent: null,
      activity: parts.length ? parts.join(' · ') : 'No playback progress yet'
    }
  }

  if (isAnki(config, type)) {
    const attempted = config.cardsAttempted ?? 0
    const correct = config.cardsCorrect
    const sessions = config.reviewSessionsThisWeek ?? 0
    const sessionNote =
      sessions > 0
        ? `${sessions} review session${sessions === 1 ? '' : 's'} this week`
        : undefined

    // Bar = % correct over cards attempted (not sessions).
    if (correct != null && attempted > 0) {
      return {
        label: 'Correct of attempted',
        done: correct,
        total: attempted,
        percent: clampPct(correct, attempted),
        activity: sessionNote,
        secondary: `${correct} correct · ${attempted} attempted`
      }
    }
    return {
      label: 'Anki reviews',
      done: attempted,
      total: null,
      percent: null,
      activity:
        attempted > 0
          ? `${attempted} cards attempted (add correct count for a % bar)`
          : sessionNote || 'No review cards logged yet — record correct and attempted for a % bar'
    }
  }

  if (isQuestionBank(config, type)) {
    const attempted = config.questionsAttempted ?? 0
    const correct = config.correctAnswers
    const incorrect =
      config.incorrectAnswers != null
        ? config.incorrectAnswers
        : correct != null && attempted > 0
          ? Math.max(0, attempted - correct)
          : null
    const bankNote =
      config.totalQuestions != null && config.totalQuestions > 0
        ? `${attempted} of ${config.totalQuestions} in set attempted`
        : attempted > 0
          ? `${attempted} questions attempted`
          : undefined

    // Bar = % correct over total attempted (not attempted÷bank size).
    if (correct != null && attempted > 0) {
      return {
        label: 'Correct of attempted',
        done: correct,
        total: attempted,
        percent: clampPct(correct, attempted),
        activity: bankNote,
        secondary:
          incorrect != null
            ? `${correct} correct · ${incorrect} incorrect · ${attempted} attempted`
            : `${correct} correct · ${attempted} attempted`
      }
    }
    return {
      label: 'Questions',
      done: attempted,
      total: null,
      percent: null,
      activity: bankNote || 'No practice sessions yet — record correct and attempted for a % bar'
    }
  }

  if (isCustom(config, type)) {
    if (config.mode === 'units') {
      const label = config.unitLabel || 'units'
      const done = config.completedUnits ?? 0
      if (config.totalUnits != null && config.totalUnits > 0) {
        return {
          label,
          done,
          total: config.totalUnits,
          percent: clampPct(done, config.totalUnits)
        }
      }
      return { label, done, total: null, percent: null, activity: `${done} ${label} completed` }
    }
    if (config.mode === 'checklist' || config.mode === 'milestones') {
      const label = config.mode === 'checklist' ? 'Checklist' : 'Milestones'
      // Prefer sections (Checklist / Milestones tab) as source of truth for the Overview bar.
      if (sectionProgress && sectionProgress.total > 0) {
        return {
          label,
          done: sectionProgress.done,
          total: sectionProgress.total,
          percent: clampPct(sectionProgress.done, sectionProgress.total)
        }
      }
      const items =
        config.mode === 'checklist' ? (config.checklist ?? []) : (config.milestones ?? [])
      const done = items.filter((i) => i.done).length
      if (!items.length) {
        return {
          label,
          done: 0,
          total: null,
          percent: null,
          activity:
            config.mode === 'checklist'
              ? 'Empty checklist — add items on the Checklist tab'
              : 'No milestones yet — add them on the Milestones tab'
        }
      }
      return {
        label,
        done,
        total: items.length,
        percent: clampPct(done, items.length)
      }
    }
    if (config.mode === 'time') {
      const mins = config.timeSpentMinutes ?? 0
      return {
        label: 'Time',
        done: mins,
        total: null,
        percent: null,
        activity: mins > 0 ? `${mins} minutes logged` : 'No time logged yet'
      }
    }
  }

  return { label: 'Progress', done: 0, total: null, percent: null, activity: 'No progress yet' }
}

/** Human-readable progress; never invent a misleading overall %. */
export function summarizeProgress(
  resource: Pick<Resource, 'type' | 'config'>,
  sectionProgress?: { done: number; total: number } | null
): string {
  const bar = getCompletionBar(resource, sectionProgress)
  if (bar.percent != null && bar.total != null) {
    const base = `${bar.done} of ${bar.total} ${bar.label.toLowerCase()} (${bar.percent}%)`
    if (bar.secondary) return `${base} · ${bar.secondary}`
    if (bar.activity) return `${base} · ${bar.activity}`
    return base
  }
  if (bar.activity) {
    return bar.secondary ? `${bar.activity} · ${bar.secondary}` : bar.activity
  }
  if (bar.secondary) return bar.secondary
  return 'No progress yet'
}

/** Optional completion % only when a meaningful total exists. */
export function completionPercent(
  resource: Pick<Resource, 'type' | 'config'>,
  sectionProgress?: { done: number; total: number } | null
): number | null {
  return getCompletionBar(resource, sectionProgress).percent
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return null
  if (parts.length === 1) return Math.floor(parts[0])
  if (parts.length === 2) return Math.floor(parts[0] * 60 + parts[1])
  if (parts.length === 3) return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2])
  return null
}

export function continueStudyingLabel(resource: Pick<Resource, 'name' | 'type' | 'config' | 'stoppingPointNote' | 'nextAction'>): string {
  if (resource.nextAction?.trim()) return resource.nextAction.trim()
  if (resource.stoppingPointNote?.trim()) {
    return `Continue ${resource.name}: ${resource.stoppingPointNote.trim()}`
  }
  const summary = summarizeProgress(resource)
  return `Continue ${resource.name} — ${summary}`
}

/** Chapter / lesson / module (or similar) for history entries. */
export function studiedPartLabel(resource: Pick<Resource, 'type' | 'config'>): string {
  const { type, config } = resource
  if (isTextbook(config, type)) {
    const parts: string[] = []
    if (config.trackChapters && config.currentChapter) parts.push(`Chapter ${config.currentChapter}`)
    if (config.trackPages && config.currentPage != null) parts.push(`page ${config.currentPage}`)
    return parts.join(', ') || 'Reading'
  }
  if (isVideo(config, type)) {
    const lesson = config.currentLesson ? `Lesson ${config.currentLesson}` : 'Lesson'
    if (config.timestampSeconds != null) {
      return `${lesson} at ${formatTimestamp(config.timestampSeconds)}`
    }
    return lesson
  }
  if (isAnki(config, type)) return 'Anki review session'
  if (isQuestionBank(config, type)) return 'Practice questions'
  if (isCustom(config, type)) {
    if (config.mode === 'units') return config.unitLabel || 'Units'
    if (config.mode === 'checklist') return 'Checklist items'
    if (config.mode === 'milestones') return 'Milestones'
    return 'Study time'
  }
  return 'Study session'
}

/** Whether a Chapters-tab row counts as completed. */
export function isChapterMarkedDone(section: {
  completedUnits: number
  totalUnits: number | null
}): boolean {
  if (section.totalUnits != null && section.totalUnits > 0) {
    return section.completedUnits >= section.totalUnits
  }
  return section.completedUnits > 0
}

/**
 * Aggregate chapter completion for Overview / progress bars.
 * done = chapters marked complete; total = optional expected totalChapters or listed chapter count.
 */
export function chapterCompletionFromSections(
  sections: Array<{ completedUnits: number; totalUnits: number | null }>,
  totalChapters?: number | null
): { done: number; total: number } | null {
  if (!sections.length && !(totalChapters != null && totalChapters > 0)) return null
  const done = sections.filter(isChapterMarkedDone).length
  const listed = sections.length
  const total =
    totalChapters != null && totalChapters > 0 ? Math.max(totalChapters, listed) : listed
  if (total <= 0) return null
  return { done, total }
}

/** Normalize chapter labels for matching Progress text to Chapters-tab rows. */
export function normalizeChapterKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^chapter\s+/i, '')
    .replace(/\s+/g, ' ')
}

/**
 * Whether Progress should warn that chapter entries need linking/marking on the Chapters tab.
 * - no-chapters: logging a chapter with an empty Chapters list
 * - unmatched: typed chapter doesn’t match any listed chapter (and none selected)
 */
export function chapterProgressLinkWarning(
  currentChapter: string | undefined,
  sectionId: string | undefined,
  sections: Array<{ id: string; name: string }>
): 'none' | 'no-chapters' | 'unmatched' {
  const typed = currentChapter?.trim() ?? ''
  const selected = sectionId?.trim() ?? ''
  if (!typed && !selected) return 'none'
  if (!sections.length) return 'no-chapters'
  if (selected && sections.some((s) => s.id === selected)) return 'none'
  if (typed) {
    const key = normalizeChapterKey(typed)
    if (sections.some((s) => normalizeChapterKey(s.name) === key)) return 'none'
    return 'unmatched'
  }
  return 'none'
}

/** Custom modes that use the Chapters-style tab (sections) as the item list. */
export function customUsesItemsTab(config: CustomConfig): boolean {
  return config.mode === 'checklist' || config.mode === 'milestones'
}

/** Whether this resource shows the Chapters / Checklist / Milestones tab. */
export function resourceHasItemsTab(resource: Pick<Resource, 'type' | 'config'>): boolean {
  if (resource.type === 'textbook' || resource.type === 'video') return true
  if (resource.type === 'custom') return customUsesItemsTab(resource.config as CustomConfig)
  return false
}

export function itemsTabLabel(resource: Pick<Resource, 'type' | 'config'>): string {
  if (resource.type === 'custom') {
    const mode = (resource.config as CustomConfig).mode
    if (mode === 'checklist') return 'Checklist'
    if (mode === 'milestones') return 'Milestones'
  }
  return 'Chapters'
}

export function itemsTabNoun(resource: Pick<Resource, 'type' | 'config'>): {
  singular: string
  plural: string
  addButton: string
} {
  if (resource.type === 'custom') {
    const mode = (resource.config as CustomConfig).mode
    if (mode === 'checklist') {
      return { singular: 'checklist item', plural: 'checklist items', addButton: 'Add item' }
    }
    if (mode === 'milestones') {
      return { singular: 'milestone', plural: 'milestones', addButton: 'Add milestone' }
    }
  }
  return { singular: 'chapter', plural: 'chapters', addButton: 'Add chapter' }
}

/**
 * Validate marking reading chapters complete from Progress.
 * Completion count may only rise when one or more existing Chapters-tab rows are linked.
 */
export function readingMarkDoneValidation(
  markDone: boolean,
  selectedSectionIds: string[],
  sections: Array<{ id: string }>
): string | null {
  if (!markDone) return null
  if (!sections.length) {
    return 'Add chapters on the Chapters tab before you can increase the completion count.'
  }
  if (!selectedSectionIds.length) {
    return 'Select at least one chapter from the list to mark complete. Completion only increases for linked chapters.'
  }
  const allowed = new Set(sections.map((s) => s.id))
  if (selectedSectionIds.some((id) => !allowed.has(id))) {
    return 'Only chapters listed on the Chapters tab can be marked complete.'
  }
  return null
}

/** Embedded checklist/milestone rows to seed into the sections (items) table. */
export function embeddedCustomItems(
  config: CustomConfig
): Array<{ label: string; done: boolean }> {
  if (config.mode === 'checklist') {
    return (config.checklist ?? []).map((i) => ({ label: i.label, done: i.done }))
  }
  if (config.mode === 'milestones') {
    return (config.milestones ?? []).map((i) => ({ label: i.label, done: i.done }))
  }
  return []
}

/**
 * Merge a Progress-tab session draft into the resource’s stored config.
 * Textbook: session position only (chapter totals stay on the Chapters tab).
 * Anki / question bank / custom units: session counts are **added** to cumulative totals.
 */
export function mergeProgressConfig(
  resource: Pick<Resource, 'type' | 'config'>,
  draft: ResourceConfig
): ResourceConfig {
  const prev = resource.config
  if (resource.type === 'textbook') {
    const d = draft as TextbookConfig
    const p = prev as TextbookConfig
    return {
      ...p,
      ...d,
      currentChapter: d.currentChapter?.trim() ? d.currentChapter : p.currentChapter,
      currentPage: d.currentPage != null && !Number.isNaN(d.currentPage) ? d.currentPage : p.currentPage,
      // Aggregate chapter completion is owned by the Chapters tab — never rewrite totals here.
      totalChapters: p.totalChapters,
      totalPages: p.totalPages
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
    const sessionAttempted = d.cardsAttempted
    const sessionCorrect = d.cardsCorrect
    return {
      ...p,
      lastSessionMinutes: d.lastSessionMinutes,
      lastNewCards: d.lastNewCards,
      weeklySessionGoal: d.weeklySessionGoal ?? p.weeklySessionGoal,
      reviewSessionsThisWeek: (p.reviewSessionsThisWeek ?? 0) + 1,
      cardsAttempted:
        sessionAttempted != null && !Number.isNaN(Number(sessionAttempted))
          ? (p.cardsAttempted ?? 0) + Number(sessionAttempted)
          : p.cardsAttempted,
      cardsCorrect:
        sessionCorrect != null && !Number.isNaN(Number(sessionCorrect))
          ? (p.cardsCorrect ?? 0) + Number(sessionCorrect)
          : p.cardsCorrect
    }
  }
  if (resource.type === 'question_bank') {
    const d = draft as QuestionBankConfig
    const p = prev as QuestionBankConfig
    const sessionAttempted = d.questionsAttempted
    const sessionCorrect = d.correctAnswers
    const sessionIncorrect = d.incorrectAnswers
    const nextAttempted =
      sessionAttempted != null && !Number.isNaN(Number(sessionAttempted))
        ? (p.questionsAttempted ?? 0) + Number(sessionAttempted)
        : p.questionsAttempted
    const nextCorrect =
      sessionCorrect != null && !Number.isNaN(Number(sessionCorrect))
        ? (p.correctAnswers ?? 0) + Number(sessionCorrect)
        : p.correctAnswers
    const nextIncorrect =
      sessionIncorrect != null && !Number.isNaN(Number(sessionIncorrect))
        ? (p.incorrectAnswers ?? 0) + Number(sessionIncorrect)
        : nextCorrect != null && nextAttempted != null
          ? Math.max(0, nextAttempted - nextCorrect)
          : p.incorrectAnswers
    return {
      ...p,
      totalQuestions: p.totalQuestions,
      nextActionHint: d.nextActionHint ?? p.nextActionHint,
      questionsAttempted: nextAttempted,
      correctAnswers: nextCorrect ?? null,
      incorrectAnswers: nextIncorrect ?? null
    }
  }
  if (resource.type === 'custom') {
    const d = draft as CustomConfig
    const p = prev as CustomConfig
    if (d.mode === 'units' || p.mode === 'units') {
      const sessionUnits = d.completedUnits
      const nextCompleted =
        sessionUnits != null && !Number.isNaN(Number(sessionUnits))
          ? (p.completedUnits ?? 0) + Number(sessionUnits)
          : p.completedUnits
      return {
        ...p,
        mode: 'units',
        unitLabel: d.unitLabel?.trim() ? d.unitLabel : p.unitLabel,
        completedUnits: nextCompleted,
        // Total units are owned by Overview / create dialog — Progress never rewrites them.
        totalUnits: p.totalUnits
      }
    }
    if (d.mode === 'time') {
      const mins = d.timeSpentMinutes
      if (mins == null || Number.isNaN(Number(mins))) {
        return { ...p, ...d, timeSpentMinutes: p.timeSpentMinutes }
      }
      return {
        ...p,
        ...d,
        timeSpentMinutes: (p.timeSpentMinutes ?? 0) + Number(mins)
      }
    }
    return { ...p, ...d }
  }
  return draft
}

export function defaultConfigForType(type: ResourceType): ResourceConfig {
  switch (type) {
    case 'textbook':
      return {
        trackChapters: true,
        trackPages: true,
        currentChapter: '1',
        currentPage: 1,
        totalChapters: null,
        totalPages: null
      }
    case 'video':
      return { currentLesson: '1', timestampSeconds: 0, completedLessons: 0, totalLessons: null }
    case 'anki':
      return {
        reviewSessionsThisWeek: 0,
        weeklySessionGoal: null,
        cardsAttempted: 0,
        cardsCorrect: undefined,
        lastSessionMinutes: undefined,
        lastNewCards: undefined
      }
    case 'question_bank':
      return { questionsAttempted: 0, totalQuestions: null, correctAnswers: null, incorrectAnswers: null, nextActionHint: '' }
    case 'custom':
      return { mode: 'units', unitLabel: 'modules', completedUnits: 0, totalUnits: null }
  }
}

/**
 * Sensible, reversible progress bump when a queue item linked to a resource is marked complete.
 * Does not invent textbook pages or practice scores — records a clear history session instead.
 */
export function progressFromQueueCompletion(
  resource: Pick<Resource, 'type' | 'config' | 'stoppingPointNote' | 'nextAction' | 'name'>,
  queueDescription: string,
  estimatedMinutes?: number | null
): {
  config: ResourceConfig
  summary: string
  studiedPart: string
  details: string
} {
  const studied = studiedPartLabel(resource)
  const details =
    queueDescription.trim() ||
    resource.nextAction?.trim() ||
    resource.stoppingPointNote?.trim() ||
    `Completed study for ${resource.name}`
  const summary = `Completed queue: ${queueDescription.trim() || resource.name}`
  const { type, config } = resource

  if (isAnki(config, type)) {
    return {
      config: {
        ...config,
        reviewSessionsThisWeek: (config.reviewSessionsThisWeek ?? 0) + 1,
        lastSessionMinutes: estimatedMinutes ?? config.lastSessionMinutes
      },
      summary,
      studiedPart: studied,
      details
    }
  }

  if (isVideo(config, type)) {
    return {
      config: {
        ...config,
        completedLessons: (config.completedLessons ?? 0) + 1
      },
      summary,
      studiedPart: studied,
      details
    }
  }

  if (isCustom(config, type)) {
    if (config.mode === 'units') {
      return {
        config: { ...config, completedUnits: (config.completedUnits ?? 0) + 1 },
        summary,
        studiedPart: studied,
        details
      }
    }
    if (config.mode === 'time') {
      const add = estimatedMinutes && estimatedMinutes > 0 ? estimatedMinutes : 15
      return {
        config: { ...config, timeSpentMinutes: (config.timeSpentMinutes ?? 0) + add },
        summary,
        studiedPart: studied,
        details
      }
    }
  }

  // Textbook, question bank, checklist/milestones: record session without inventing counts.
  return {
    config,
    summary,
    studiedPart: studied,
    details
  }
}
