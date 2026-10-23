import { describe, expect, it } from 'vitest'
import {
  completionPercent,
  formatTimestamp,
  parseTimestamp,
  progressFromQueueCompletion,
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
    ).toBe('Chapter 4, page 87 of 420')
  })

  it('handles video without total lessons', () => {
    expect(
      summarizeProgress({
        type: 'video',
        config: { currentLesson: '6', timestampSeconds: 760, completedLessons: 5 }
      })
    ).toContain('Lesson 6')
  })

  it('only computes accuracy when correct answers exist', () => {
    expect(
      summarizeProgress({
        type: 'question_bank',
        config: { questionsAttempted: 40, correctAnswers: 28 }
      })
    ).toBe('40 questions · 70% correct')

    expect(
      summarizeProgress({
        type: 'question_bank',
        config: { questionsAttempted: 40, correctAnswers: null }
      })
    ).toBe('40 questions attempted')
  })
})

describe('completionPercent', () => {
  it('returns null when totals are unknown', () => {
    expect(
      completionPercent({
        type: 'textbook',
        config: { trackChapters: true, trackPages: true, currentPage: 10, totalPages: null }
      })
    ).toBeNull()
  })

  it('returns percent only with meaningful totals', () => {
    expect(
      completionPercent({
        type: 'video',
        config: { completedLessons: 5, totalLessons: 20 }
      })
    ).toBe(25)
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
