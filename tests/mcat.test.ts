import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as db from '../src/main/database'
import { MCAT_CATEGORY_NAMES, practiceExamTotal, clampPracticeScore } from '../src/shared/mcat'

describe('MCAT helpers', () => {
  it('sums practice exam section scores', () => {
    expect(practiceExamTotal({ cp: 128, cars: 125, bb: 130, ps: 127 })).toBe(510)
  })

  it('clamps section scores to 118–132', () => {
    expect(clampPracticeScore(100)).toBe(118)
    expect(clampPracticeScore(140)).toBe(132)
    expect(clampPracticeScore(125.4)).toBe(125)
  })
})

describe('MCAT categories and practice exams', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'study-hub-'))
    db.openDatabase(dir)
  })

  afterEach(() => {
    db.closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  it('seeds eight shared categories on an MCAT project', () => {
    const project = db.createProject('MCAT Prep', 'mcat')
    const cats = db.listCategories(project.id)
    expect(cats).toHaveLength(8)
    expect(cats.map((c) => c.name)).toEqual([...MCAT_CATEGORY_NAMES])
  })

  it('filters resources by category tag', () => {
    const project = db.createProject('MCAT', 'mcat')
    const cats = db.listCategories(project.id)
    const bio = cats.find((c) => c.name === 'Biology')!
    const psych = cats.find((c) => c.name === 'Psychology')!
    const book = db.createResource({
      projectId: project.id,
      studyAreaIds: [bio.id],
      name: 'Bio book',
      type: 'textbook',
      locationKind: 'none',
      config: { trackChapters: true, trackPages: true, currentChapter: '1', currentPage: 1 }
    })
    db.createResource({
      projectId: project.id,
      studyAreaIds: [psych.id],
      name: 'Psych deck',
      type: 'anki',
      locationKind: 'none',
      config: { reviewSessionsThisWeek: 0 }
    })
    const filtered = db.listResources(project.id, { studyAreaId: bio.id })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(book.id)
    expect(filtered[0].categoryNames).toContain('Biology')
  })

  it('stores practice exam with calculated total', () => {
    const project = db.createProject('MCAT', 'mcat')
    const exam = db.upsertPracticeExam({
      projectId: project.id,
      name: 'AAMC FL 1',
      takenOn: '2026-10-01',
      scoreCp: 128,
      scoreCars: 125,
      scoreBb: 130,
      scorePs: 127,
      reviewStatus: 'not_reviewed'
    })
    expect(exam.total).toBe(510)
    expect(db.listPracticeExams(project.id)).toHaveLength(1)
  })

  it('maps legacy study-area names when seeding MCAT categories', () => {
    const project = db.createProject('Custom first', 'custom')
    db.createCategory(project.id, 'Bio')
    db.createCategory(project.id, 'Psych')
    const seeded = db.ensureMcatCategories(project.id)
    expect(seeded.map((c) => c.name)).toEqual(expect.arrayContaining(['Biology', 'Psychology']))
    expect(seeded).toHaveLength(8)
  })
})
