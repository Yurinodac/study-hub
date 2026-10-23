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

/** Human-readable progress; never invent a misleading overall %. */
export function summarizeProgress(resource: Pick<Resource, 'type' | 'config'>): string {
  const { type, config } = resource

  if (isTextbook(config, type)) {
    const parts: string[] = []
    if (config.trackChapters && config.currentChapter) {
      parts.push(`Chapter ${config.currentChapter}`)
    }
    if (config.trackPages && config.currentPage != null) {
      if (config.totalPages != null && config.totalPages > 0) {
        parts.push(`page ${config.currentPage} of ${config.totalPages}`)
      } else {
        parts.push(`page ${config.currentPage}`)
      }
    }
    return parts.length ? parts.join(', ') : 'No reading progress yet'
  }

  if (isVideo(config, type)) {
    const parts: string[] = []
    if (config.currentLesson) parts.push(`Lesson ${config.currentLesson}`)
    if (config.timestampSeconds != null) {
      parts.push(`at ${formatTimestamp(config.timestampSeconds)}`)
    }
    if (config.totalLessons != null && config.totalLessons > 0) {
      const done = config.completedLessons ?? 0
      parts.push(`${done} of ${config.totalLessons} lessons done`)
    } else if (config.completedLessons != null && config.completedLessons > 0) {
      parts.push(`${config.completedLessons} lessons completed`)
    }
    return parts.length ? parts.join(' · ') : 'No playback progress yet'
  }

  if (isAnki(config, type)) {
    const sessions = config.reviewSessionsThisWeek ?? 0
    return sessions > 0
      ? `${sessions} review session${sessions === 1 ? '' : 's'} this week`
      : 'No review sessions recorded this week'
  }

  if (isQuestionBank(config, type)) {
    const attempted = config.questionsAttempted ?? 0
    if (attempted === 0) return 'No practice sessions yet'
    if (config.correctAnswers != null && attempted > 0) {
      const pct = Math.round((config.correctAnswers / attempted) * 100)
      return `${attempted} questions · ${pct}% correct`
    }
    return `${attempted} questions attempted`
  }

  if (isCustom(config, type)) {
    if (config.mode === 'units') {
      const label = config.unitLabel || 'units'
      const done = config.completedUnits ?? 0
      if (config.totalUnits != null && config.totalUnits > 0) {
        return `${done} of ${config.totalUnits} ${label}`
      }
      return `${done} ${label} completed`
    }
    if (config.mode === 'time') {
      const mins = config.timeSpentMinutes ?? 0
      return mins > 0 ? `${mins} minutes logged` : 'No time logged yet'
    }
    if (config.mode === 'checklist') {
      const items = config.checklist ?? []
      const done = items.filter((i) => i.done).length
      return items.length ? `${done} of ${items.length} checklist items` : 'Empty checklist'
    }
    if (config.mode === 'milestones') {
      const items = config.milestones ?? []
      const done = items.filter((i) => i.done).length
      return items.length ? `${done} of ${items.length} milestones` : 'No milestones yet'
    }
  }

  return 'No progress yet'
}

/** Optional completion % only when a meaningful total exists. */
export function completionPercent(resource: Pick<Resource, 'type' | 'config'>): number | null {
  const { type, config } = resource

  if (isTextbook(config, type) && config.trackPages && config.totalPages && config.totalPages > 0) {
    const page = config.currentPage ?? 0
    return Math.min(100, Math.round((page / config.totalPages) * 100))
  }

  if (isVideo(config, type) && config.totalLessons && config.totalLessons > 0) {
    const done = config.completedLessons ?? 0
    return Math.min(100, Math.round((done / config.totalLessons) * 100))
  }

  if (isCustom(config, type) && config.mode === 'units' && config.totalUnits && config.totalUnits > 0) {
    const done = config.completedUnits ?? 0
    return Math.min(100, Math.round((done / config.totalUnits) * 100))
  }

  if (isCustom(config, type) && config.mode === 'checklist') {
    const items = config.checklist ?? []
    if (!items.length) return null
    return Math.round((items.filter((i) => i.done).length / items.length) * 100)
  }

  if (isCustom(config, type) && config.mode === 'milestones') {
    const items = config.milestones ?? []
    if (!items.length) return null
    return Math.round((items.filter((i) => i.done).length / items.length) * 100)
  }

  return null
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

export function defaultConfigForType(type: ResourceType): ResourceConfig {
  switch (type) {
    case 'textbook':
      return { trackChapters: true, trackPages: true, currentChapter: '1', currentPage: 1, totalPages: null }
    case 'video':
      return { currentLesson: '1', timestampSeconds: 0, completedLessons: 0, totalLessons: null }
    case 'anki':
      return { reviewSessionsThisWeek: 0, lastSessionMinutes: undefined, lastNewCards: undefined }
    case 'question_bank':
      return { questionsAttempted: 0, correctAnswers: null, nextActionHint: '' }
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
