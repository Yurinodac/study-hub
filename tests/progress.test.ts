import { describe, expect, it } from 'vitest'
import {
  chapterCompletionFromSections,
  completionPercent,
  formatTimestamp,
  getCompletionBar,
  isChapterMarkedDone,
  mergeProgressConfig,
  parseTimestamp,
  progressFromQueueCompletion,
  readingMarkDoneValidation,
  summarizeProgress
} from '../src/shared/progress'

describe('summarizeProgress', () => {
  it('summarizes textbook chapter and page without inventing mastery', () => {
    expect(
      summarizeProgress({
        type: 'textbook',
        config: {
          trackChapters: true,
          trackPages: true,
          currentChapter: '4',
          currentPage: 87,
          totalPages: 420
        }
      })
    ).toContain('87 of 420')
  })

  it('handles video without total lessons', () => {
    expect(
      summarizeProgress({
        type: 'video',
        config: { currentLesson: '6', timestampSeconds: 760, completedLessons: 5 }
      })
    ).toContain('Lesson 6')
  })
})

describe('getCompletionBar', () => {
  it('returns null percent for reading when totals are unknown', () => {
    expect(
      completionPercent({
        type: 'textbook',
        config: { trackChapters: true, trackPages: true, currentPage: 10, totalPages: null }
      })
    ).toBeNull()
  })

  it('reading/video percent only with recorded totals', () => {
    expect(
      completionPercent({
        type: 'video',
        config: { completedLessons: 5, totalLessons: 20 }
      })
    ).toBe(25)
  })

  it('uses Chapters-tab completion (marked done ÷ total) for textbooks', () => {
    const bar = getCompletionBar(
      {
        type: 'textbook',
        config: {
          trackChapters: true,
          trackPages: true,
          currentPage: 10,
          totalPages: 400,
          totalChapters: 12
        }
      },
      { done: 3, total: 12 }
    )
    expect(bar.percent).toBe(25)
    expect(bar.label).toBe('Chapters')
    expect(bar.done).toBe(3)
    expect(bar.total).toBe(12)
  })

  it('Anki bar is correct ÷ attempted, not sessions this week', () => {
    const bar = getCompletionBar({
      type: 'anki',
      config: {
        reviewSessionsThisWeek: 3,
        weeklySessionGoal: 5,
        cardsAttempted: 40,
        cardsCorrect: 28
      }
    })
    expect(bar.percent).toBe(70)
    expect(bar.done).toBe(28)
    expect(bar.total).toBe(40)
    expect(bar.secondary).toContain('28 correct')
    expect(bar.activity).toContain('3 review session')
  })

  it('Anki without correct/attempted has no percent bar', () => {
    const bar = getCompletionBar({
      type: 'anki',
      config: { reviewSessionsThisWeek: 3, weeklySessionGoal: 5 }
    })
    expect(bar.percent).toBeNull()
  })

  it('question bank bar is correct ÷ attempted, not attempted ÷ bank size', () => {
    const bar = getCompletionBar({
      type: 'question_bank',
      config: { questionsAttempted: 40, totalQuestions: 100, correctAnswers: 28 }
    })
    expect(bar.percent).toBe(70)
    expect(bar.done).toBe(28)
    expect(bar.total).toBe(40)
    expect(bar.secondary).toContain('28 correct')
    expect(bar.activity).toContain('40 of 100')
  })
})

describe('chapterCompletionFromSections', () => {
  it('counts marked-done chapters and respects expected total', () => {
    expect(isChapterMarkedDone({ completedUnits: 1, totalUnits: 1 })).toBe(true)
    expect(isChapterMarkedDone({ completedUnits: 0, totalUnits: 1 })).toBe(false)
    expect(
      chapterCompletionFromSections(
        [
          { completedUnits: 1, totalUnits: 1 },
          { completedUnits: 0, totalUnits: 1 },
          { completedUnits: 1, totalUnits: 1 }
        ],
        10
      )
    ).toEqual({ done: 2, total: 10 })
  })

  it('uses listed count when no expected total', () => {
    expect(
      chapterCompletionFromSections([
        { completedUnits: 1, totalUnits: 1 },
        { completedUnits: 0, totalUnits: 1 }
      ])
    ).toEqual({ done: 1, total: 2 })
  })
})

describe('timestamps', () => {
  it('formats and parses timestamps', () => {
    expect(formatTimestamp(760)).toBe('12:40')
    expect(parseTimestamp('12:40')).toBe(760)
    expect(parseTimestamp('1:02:03')).toBe(3723)
  })
})

describe('progressFromQueueCompletion', () => {
  it('bumps anki sessions and records a clear summary', () => {
    const result = progressFromQueueCompletion(
      {
        name: 'Anki',
        type: 'anki',
        config: { reviewSessionsThisWeek: 2 },
        stoppingPointNote: '',
        nextAction: ''
      },
      'Finish Anki reviews',
      25
    )
    expect((result.config as { reviewSessionsThisWeek?: number }).reviewSessionsThisWeek).toBe(3)
    expect(result.summary).toContain('Completed queue')
    expect(result.details).toContain('Finish Anki reviews')
  })

  it('does not invent textbook page numbers', () => {
    const result = progressFromQueueCompletion(
      {
        name: 'Bio book',
        type: 'textbook',
        config: {
          trackChapters: true,
          trackPages: true,
          currentChapter: '4',
          currentPage: 87,
          totalPages: 420
        },
        stoppingPointNote: 'page 87',
        nextAction: 'Continue chapter 4'
      },
      'Continue Biology, Chapter 4'
    )
    expect((result.config as { currentPage?: number }).currentPage).toBe(87)
    expect(result.summary).toContain('Continue Biology')
  })
})

describe('mergeProgressConfig', () => {
  it('adds Anki session attempted/correct onto cumulative totals', () => {
    const next = mergeProgressConfig(
      {
        type: 'anki',
        config: {
          reviewSessionsThisWeek: 2,
          cardsAttempted: 40,
          cardsCorrect: 28
        }
      },
      {
        reviewSessionsThisWeek: 2,
        cardsAttempted: 10,
        cardsCorrect: 7,
        lastSessionMinutes: 20
      }
    ) as {
      cardsAttempted?: number
      cardsCorrect?: number
      reviewSessionsThisWeek?: number
    }
    expect(next.cardsAttempted).toBe(50)
    expect(next.cardsCorrect).toBe(35)
    expect(next.reviewSessionsThisWeek).toBe(3)
  })

  it('adds question-bank session attempted/correct onto cumulative totals', () => {
    const next = mergeProgressConfig(
      {
        type: 'question_bank',
        config: {
          questionsAttempted: 40,
          totalQuestions: 100,
          correctAnswers: 28,
          incorrectAnswers: 12
        }
      },
      {
        questionsAttempted: 10,
        totalQuestions: 100,
        correctAnswers: 6,
        incorrectAnswers: 4
      }
    ) as {
      questionsAttempted?: number
      correctAnswers?: number | null
      incorrectAnswers?: number | null
      totalQuestions?: number | null
    }
    expect(next.questionsAttempted).toBe(50)
    expect(next.correctAnswers).toBe(34)
    expect(next.incorrectAnswers).toBe(16)
    expect(next.totalQuestions).toBe(100)
  })

  it('does not overwrite textbook totalChapters from a Progress session', () => {
    const next = mergeProgressConfig(
      {
        type: 'textbook',
        config: {
          trackChapters: true,
          trackPages: true,
          currentChapter: '3',
          currentPage: 40,
          totalChapters: 12,
          totalPages: 400
        }
      },
      {
        trackChapters: true,
        trackPages: true,
        currentChapter: '4',
        currentPage: 87,
        totalChapters: 99,
        totalPages: 1
      }
    ) as {
      currentChapter?: string
      currentPage?: number
      totalChapters?: number | null
      totalPages?: number | null
    }
    expect(next.currentChapter).toBe('4')
    expect(next.currentPage).toBe(87)
    expect(next.totalChapters).toBe(12)
    expect(next.totalPages).toBe(400)
  })

  it('adds custom session units onto cumulative totals without rewriting totalUnits', () => {
    const next = mergeProgressConfig(
      {
        type: 'custom',
        config: {
          mode: 'units',
          unitLabel: 'modules',
          completedUnits: 3,
          totalUnits: 10
        }
      },
      {
        mode: 'units',
        unitLabel: 'modules',
        completedUnits: 2,
        totalUnits: 99
      }
    ) as {
      completedUnits?: number
      totalUnits?: number | null
    }
    expect(next.completedUnits).toBe(5)
    expect(next.totalUnits).toBe(10)
  })
})

describe('readingMarkDoneValidation', () => {
  it('allows stopping-point-only saves without marking done', () => {
    expect(readingMarkDoneValidation(false, [], [])).toBeNull()
  })

  it('blocks mark-done without chapters or without a linked selection', () => {
    expect(readingMarkDoneValidation(true, [], [])).toMatch(/Add chapters/)
    expect(readingMarkDoneValidation(true, [], [{ id: 'a' }])).toMatch(/Select at least one/)
  })

  it('allows mark-done when linked ids exist on the Chapters tab', () => {
    expect(readingMarkDoneValidation(true, ['a', 'b'], [{ id: 'a' }, { id: 'b' }])).toBeNull()
  })
})

describe('checklist/milestones bar from sections', () => {
  it('uses sectionProgress for checklist Overview bar', () => {
    const bar = getCompletionBar(
      {
        type: 'custom',
        config: { mode: 'checklist', checklist: [] }
      },
      { done: 2, total: 5 }
    )
    expect(bar.label).toBe('Checklist')
    expect(bar.percent).toBe(40)
    expect(bar.done).toBe(2)
    expect(bar.total).toBe(5)
  })
})
