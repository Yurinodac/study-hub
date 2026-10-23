import * as db from './database'

/** Optional demo records — clearly labeled and removable. Uses project categories. */
export function loadSampleData(projectId: string): void {
  const project = db.getProject(projectId)
  if (project?.preset === 'mcat') {
    db.ensureMcatCategories(projectId)
  }
  const categories = db.listCategories(projectId)
  const byName = (name: string) => categories.find((c) => c.name === name)
  const biology =
    byName('Biology') ?? db.createCategory(projectId, 'Sample · Biology')
  const psych =
    byName('Psychology') ?? db.createCategory(projectId, 'Sample · Psychology')
  const orgo = byName('Organic Chemistry') ?? biology

  const textbook = db.createResource({
    projectId,
    studyAreaIds: [biology.id],
    name: 'SAMPLE: Biology Textbook',
    type: 'textbook',
    locationKind: 'none',
    locationValue: '',
    config: {
      trackChapters: true,
      trackPages: true,
      currentChapter: '4',
      currentPage: 87,
      totalPages: 420
    },
    stoppingPointNote: 'Chapter 4, page 87 — finished cell membranes intro',
    nextAction: 'Continue Biology, Chapter 4, page 87.',
    notes: 'Sample textbook. Remove sample data anytime from Settings.',
    isSample: true
  })
  db.upsertSection({
    resourceId: textbook.id,
    name: 'Chapter 4 — Cell membranes',
    totalUnits: 28,
    completedUnits: 12
  })
  db.upsertSection({
    resourceId: textbook.id,
    name: 'Chapter 5 — Metabolism',
    totalUnits: 34,
    completedUnits: 0
  })
  db.addHistory(textbook.id, 'Sample: stopped at Chapter 4, page 87', {
    config: textbook.config,
    stoppingPointNote: textbook.stoppingPointNote,
    nextAction: textbook.nextAction
  })

  const video = db.createResource({
    projectId,
    studyAreaIds: [orgo.id],
    name: 'SAMPLE: Organic Chemistry Video Course',
    type: 'video',
    locationKind: 'none',
    config: {
      currentLesson: '6',
      timestampSeconds: 760,
      completedLessons: 5,
      totalLessons: 40
    },
    stoppingPointNote: 'Lesson 6 at 12:40',
    nextAction: 'Resume Lesson 6 at 12:40.',
    isSample: true
  })
  db.addHistory(video.id, 'Sample: video at Lesson 6', {
    config: video.config,
    nextAction: video.nextAction
  })

  const anki = db.createResource({
    projectId,
    studyAreaIds: [psych.id],
    name: 'SAMPLE: Psychology Anki Deck',
    type: 'anki',
    locationKind: 'none',
    config: { reviewSessionsThisWeek: 3 },
    stoppingPointNote: 'Finished morning reviews',
    nextAction: "Complete today's Anki reviews.",
    isSample: true
  })
  db.addHistory(anki.id, 'Sample: Anki session logged', {
    config: anki.config,
    nextAction: anki.nextAction
  })

  const bank = db.createResource({
    projectId,
    studyAreaIds: [psych.id],
    name: 'SAMPLE: P/S Question Bank',
    type: 'question_bank',
    locationKind: 'none',
    config: {
      questionsAttempted: 40,
      correctAnswers: 28,
      nextActionHint: 'Review missed questions from Set B'
    },
    nextAction: 'Review missed questions from Set B.',
    isSample: true
  })
  db.addHistory(bank.id, 'Sample: practice questions', {
    config: bank.config,
    nextAction: bank.nextAction
  })

  db.updateResource(textbook.id, { lastStudiedAt: new Date().toISOString() })
  db.updateResource(video.id, { lastStudiedAt: new Date(Date.now() - 86400000).toISOString() })
  db.updateResource(anki.id, { lastStudiedAt: new Date(Date.now() - 3600000).toISOString() })
  db.updateResource(bank.id, { lastStudiedAt: new Date(Date.now() - 172800000).toISOString() })
}

export function hasSampleData(projectId: string): boolean {
  return db.listResources(projectId, { includeArchived: true }).some((r) => r.isSample)
}
