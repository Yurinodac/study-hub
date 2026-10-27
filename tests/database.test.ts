import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as db from '../src/main/database'
import { loadSampleData, hasSampleData } from '../src/main/sample-data'
import { summarizeProgress } from '../src/shared/progress'

describe('database persistence', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'study-hub-'))
    db.openDatabase(dir)
  })

  afterEach(() => {
    db.closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a default project and persists resources', () => {
    const project = db.ensureDefaultProject()
    const resource = db.createResource({
      projectId: project.id,
      name: 'Bio book',
      type: 'textbook',
      locationKind: 'none',
      config: {
        trackChapters: true,
        trackPages: true,
        currentChapter: '2',
        currentPage: 40,
        totalPages: null
      }
    })
    expect(db.getResource(resource.id)?.name).toBe('Bio book')
    expect(summarizeProgress(resource)).toContain('Chapter 2')
  })

  it('exports and restores backup with recovery copy', () => {
    const project = db.ensureDefaultProject()
    db.createResource({
      projectId: project.id,
      name: 'Keep me',
      type: 'anki',
      locationKind: 'none',
      config: { reviewSessionsThisWeek: 1 }
    })
    const backup = db.exportBackup()
    expect(backup.resources).toHaveLength(1)

    db.createResource({
      projectId: project.id,
      name: 'Will be replaced',
      type: 'custom',
      locationKind: 'none',
      config: { mode: 'time', timeSpentMinutes: 5 }
    })
    expect(db.exportBackup().resources).toHaveLength(2)

    const recovery = db.restoreBackup(backup, join(dir, 'recovery'))
    expect(recovery).toContain('pre-restore-')
    expect(db.exportBackup().resources).toHaveLength(1)
    expect(db.exportBackup().resources[0].name).toBe('Keep me')
  })

  it('loads and removes sample data separately from real records', () => {
    const project = db.ensureDefaultProject()
    db.createResource({
      projectId: project.id,
      name: 'Real notes',
      type: 'custom',
      locationKind: 'none',
      config: { mode: 'units', unitLabel: 'pages', completedUnits: 1, totalUnits: 10 }
    })
    loadSampleData(project.id)
    expect(hasSampleData(project.id)).toBe(true)
    const removed = db.removeSampleData(project.id)
    expect(removed).toBeGreaterThanOrEqual(4)
    const remaining = db.listResources(project.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('Real notes')
  })

  it('deletes history entries the user does not want', () => {
    const project = db.ensureDefaultProject()
    const resource = db.createResource({
      projectId: project.id,
      name: 'Video',
      type: 'video',
      locationKind: 'url',
      locationValue: 'https://example.com',
      config: { currentLesson: '1', timestampSeconds: 0, completedLessons: 0 }
    })
    db.updateResource(
      resource.id,
      { config: { currentLesson: '1', timestampSeconds: 100, completedLessons: 0 } },
      'First stop',
      { studiedPart: 'Lesson 1 at 1:40', details: 'Paused video' }
    )
    db.updateResource(
      resource.id,
      { config: { currentLesson: '2', timestampSeconds: 0, completedLessons: 1 } },
      'Accidental jump',
      { studiedPart: 'Lesson 2' }
    )
    const history = db.listHistory(resource.id)
    expect(history.length).toBeGreaterThanOrEqual(2)
    const bad = history.find((h) => h.summary === 'Accidental jump')!
    db.deleteHistoryEntry(bad.id)
    const after = db.listHistory(resource.id)
    expect(after.find((h) => h.summary === 'Accidental jump')).toBeUndefined()
    expect(after.find((h) => h.summary === 'First stop')?.payload.studiedPart).toContain('Lesson 1')
  })

  it('associates a resource with multiple study areas', () => {
    const project = db.ensureDefaultProject()
    const a = db.createStudyArea(project.id, 'Bio')
    const b = db.createStudyArea(project.id, 'Chem')
    const resource = db.createResource({
      projectId: project.id,
      studyAreaIds: [a.id, b.id],
      name: 'Combined notes',
      type: 'custom',
      locationKind: 'none',
      config: { mode: 'units', unitLabel: 'pages', completedUnits: 0, totalUnits: null }
    })
    expect(resource.studyAreaIds.sort()).toEqual([a.id, b.id].sort())
    const filtered = db.listResources(project.id, { studyAreaId: b.id })
    expect(filtered.some((r) => r.id === resource.id)).toBe(true)
  })

  it('keeps tomorrow queue items off today until their day', () => {
    const project = db.ensureDefaultProject()
    db.addQueueItem({
      projectId: project.id,
      description: 'Do tomorrow',
      when: 'tomorrow'
    })
    db.addQueueItem({
      projectId: project.id,
      description: 'Do today',
      when: 'today'
    })
    const today = db.listQueue(project.id)
    const tomorrow = db.listTomorrowQueue(project.id)
    expect(today.some((q) => q.description === 'Do today')).toBe(true)
    expect(today.some((q) => q.description === 'Do tomorrow')).toBe(false)
    expect(tomorrow.some((q) => q.description === 'Do tomorrow')).toBe(true)
  })

  it('links chapters to study areas', () => {
    const project = db.ensureDefaultProject()
    const bio = db.createStudyArea(project.id, 'Bio')
    const resource = db.createResource({
      projectId: project.id,
      studyAreaIds: [bio.id],
      name: 'Book',
      type: 'textbook',
      locationKind: 'none',
      config: { trackChapters: true, trackPages: true, currentChapter: '1', currentPage: 1 }
    })
    const section = db.upsertSection({
      resourceId: resource.id,
      name: 'Chapter 1',
      studyAreaId: bio.id
    })
    expect(section.studyAreaId).toBe(bio.id)
    expect(db.listSections(resource.id, bio.id)).toHaveLength(1)
  })

  it('records resource progress when completing a linked queue item', () => {
    const project = db.ensureDefaultProject()
    const resource = db.createResource({
      projectId: project.id,
      name: 'Anki deck',
      type: 'anki',
      locationKind: 'none',
      config: { reviewSessionsThisWeek: 1 },
      nextAction: "Complete today's Anki reviews."
    })
    expect(resource.nextAction).toContain('Anki')
    const item = db.addQueueItem({
      projectId: project.id,
      resourceId: resource.id,
      description: 'Do Anki',
      estimatedMinutes: 20,
      when: 'today'
    })
    const result = db.completeQueueItem(item.id)
    expect(result.progressRecorded).toBe(true)
    expect(db.listQueue(project.id).some((q) => q.id === item.id)).toBe(false)
    const updated = db.getResource(resource.id)!
    expect((updated.config as { reviewSessionsThisWeek?: number }).reviewSessionsThisWeek).toBe(2)
    expect(updated.nextAction).toBe('')
    expect(db.listHistory(resource.id)[0]?.summary).toContain('Completed queue')
  })

  it('lists project-wide history with resource names', () => {
    const project = db.ensureDefaultProject()
    const a = db.createResource({
      projectId: project.id,
      name: 'Book A',
      type: 'textbook',
      locationKind: 'none',
      config: { trackChapters: true, trackPages: true, currentChapter: '1', currentPage: 1 }
    })
    const b = db.createResource({
      projectId: project.id,
      name: 'Book B',
      type: 'anki',
      locationKind: 'none',
      config: { reviewSessionsThisWeek: 0 }
    })
    db.updateResource(a.id, { lastStudiedAt: new Date().toISOString() }, 'First session', {
      studiedPart: 'Chapter 1'
    })
    db.updateResource(b.id, { lastStudiedAt: new Date().toISOString() }, 'Second session', {
      studiedPart: 'Anki'
    })
    const history = db.listProjectHistory(project.id)
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history.map((h) => h.summary)).toEqual(expect.arrayContaining(['First session', 'Second session']))
    expect(history.some((h) => h.resourceName === 'Book A')).toBe(true)
    expect(history.some((h) => h.resourceName === 'Book B')).toBe(true)
  })

  it('completes unlinked queue items without inventing progress', () => {
    const project = db.ensureDefaultProject()
    const item = db.addQueueItem({
      projectId: project.id,
      description: 'Stretch break',
      when: 'today'
    })
    const result = db.completeQueueItem(item.id)
    expect(result.progressRecorded).toBe(false)
    expect(db.listQueue(project.id).some((q) => q.id === item.id)).toBe(false)
  })

  it('stores subject and chapter on progress history', () => {
    const project = db.ensureDefaultProject()
    const bio = db.createStudyArea(project.id, 'Bio')
    const resource = db.createResource({
      projectId: project.id,
      studyAreaIds: [bio.id],
      name: 'Book',
      type: 'textbook',
      locationKind: 'none',
      config: { trackChapters: true, trackPages: true, currentChapter: '1', currentPage: 1 }
    })
    const section = db.upsertSection({
      resourceId: resource.id,
      name: 'Chapter 4',
      studyAreaId: bio.id
    })
    db.updateResource(
      resource.id,
      {
        config: {
          trackChapters: true,
          trackPages: true,
          currentChapter: '4',
          currentPage: 87
        },
        lastStudiedAt: new Date().toISOString()
      },
      'Updated reading — Chapter 4',
      { studiedPart: 'Chapter 4', studyAreaIds: [bio.id], sectionId: section.id }
    )
    const history = db.listHistory(resource.id)
    expect(history[0]?.payload.sectionId).toBe(section.id)
    expect(history[0]?.payload.sectionName).toBe('Chapter 4')
    expect(history[0]?.payload.studyAreaNames).toContain('Bio')
    // Progress history does not mark chapters done — only the Chapters tab does.
    expect(db.listSections(resource.id)[0]?.completedUnits).toBe(0)
  })

  it('schedules the same task across multiple calendar days', () => {
    const project = db.ensureDefaultProject()
    const items = db.addQueueItemsForDates({
      projectId: project.id,
      description: 'Review CARS',
      startDate: '2026-11-01',
      endDate: '2026-11-03'
    })
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.forDate)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(db.listQueueForDate(project.id, '2026-11-02')).toHaveLength(1)
  })

  it('stores missed practice questions and flashcard rotation flags', () => {
    const project = db.ensureDefaultProject()
    const exam = db.upsertPracticeExam({
      projectId: project.id,
      name: 'FL1',
      takenOn: '2026-10-01',
      scoreCp: 125,
      scoreCars: 126,
      scoreBb: 124,
      scorePs: 127,
      reviewStatus: 'in_progress'
    })
    const q = db.upsertMissedQuestion({
      examId: exam.id,
      sectionCode: 'CARS',
      prompt: 'Passage 2 Q4',
      correctAnswer: 'B',
      commentary: 'Main idea',
      confidence: 2
    })
    expect(db.listMissedQuestions(exam.id)).toHaveLength(1)
    expect(db.listMissedQuestionsInRotation(project.id)).toHaveLength(1)
    db.setMissedQuestionInRotation(q.id, false)
    expect(db.listMissedQuestionsInRotation(project.id)).toHaveLength(0)
    db.updateMissedQuestionConfidence(q.id, 4)
    expect(db.listMissedQuestions(exam.id)[0].confidence).toBe(4)

    const backup = db.exportBackup()
    expect(backup.missedQuestions?.length).toBe(1)
    expect(backup.schemaVersion).toBeGreaterThanOrEqual(5)
  })

  it('does not mark chapters done from progress history (Chapters tab is source of truth)', () => {
    const project = db.ensureDefaultProject()
    const resource = db.createResource({
      projectId: project.id,
      name: 'Book',
      type: 'textbook',
      locationKind: 'none',
      config: { trackChapters: true, trackPages: true, currentChapter: '1', totalChapters: 10 }
    })
    const section = db.upsertSection({
      resourceId: resource.id,
      name: 'Chapter 4',
      totalUnits: 1,
      completedUnits: 0
    })
    db.updateResource(
      resource.id,
      {
        config: {
          trackChapters: true,
          trackPages: true,
          currentChapter: '4',
          totalChapters: 10
        }
      },
      'Read chapter 4',
      { studiedPart: 'Chapter 4', sectionId: section.id }
    )
    expect(db.listSections(resource.id)[0].completedUnits).toBe(0)
    expect(db.getSectionProgress(resource.id)).toEqual({ done: 0, total: 10 })
  })

  it('chapter completion rises and falls when marking chapters done/undone', () => {
    const project = db.ensureDefaultProject()
    const resource = db.createResource({
      projectId: project.id,
      name: 'Book',
      type: 'textbook',
      locationKind: 'none',
      config: { trackChapters: true, trackPages: true, currentChapter: '1', totalChapters: 5 }
    })
    const a = db.upsertSection({
      resourceId: resource.id,
      name: 'Ch 1',
      totalUnits: 1,
      completedUnits: 0
    })
    const b = db.upsertSection({
      resourceId: resource.id,
      name: 'Ch 2',
      totalUnits: 1,
      completedUnits: 0
    })
    expect(db.getSectionProgress(resource.id)).toEqual({ done: 0, total: 5 })

    db.upsertSection({
      id: a.id,
      resourceId: resource.id,
      name: a.name,
      totalUnits: 1,
      completedUnits: 1
    })
    expect(db.getSectionProgress(resource.id)).toEqual({ done: 1, total: 5 })

    db.upsertSection({
      id: b.id,
      resourceId: resource.id,
      name: b.name,
      totalUnits: 1,
      completedUnits: 1
    })
    expect(db.getSectionProgress(resource.id)).toEqual({ done: 2, total: 5 })

    db.upsertSection({
      id: a.id,
      resourceId: resource.id,
      name: a.name,
      totalUnits: 1,
      completedUnits: 0
    })
    expect(db.getSectionProgress(resource.id)).toEqual({ done: 1, total: 5 })

    const cards = db.listResources(project.id)
    expect(cards[0].sectionProgress).toEqual({ done: 1, total: 5 })
    expect(cards[0].progressSummary).toContain('1 of 5')
  })
})
