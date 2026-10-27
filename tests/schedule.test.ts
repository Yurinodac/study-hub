import { describe, expect, it } from 'vitest'
import { expandRecurrence, resolveScheduleDates } from '../src/shared/schedule'
import { calendarDaysBetween, testDateCountdownLabel } from '../src/shared/dates'

describe('expandRecurrence', () => {
  it('expands daily for a count', () => {
    expect(
      expandRecurrence({
        startDate: '2026-10-01',
        freq: 'daily',
        endMode: 'count',
        count: 3
      })
    ).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('expands weekdays only', () => {
    const dates = expandRecurrence({
      startDate: '2026-10-02', // Friday
      freq: 'weekdays',
      endMode: 'count',
      count: 3
    })
    expect(dates).toEqual(['2026-10-02', '2026-10-05', '2026-10-06'])
  })

  it('expands every N days until a date', () => {
    expect(
      expandRecurrence({
        startDate: '2026-10-01',
        freq: 'every_n',
        interval: 3,
        endMode: 'until',
        untilDate: '2026-10-10'
      })
    ).toEqual(['2026-10-01', '2026-10-04', '2026-10-07', '2026-10-10'])
  })

  it('expands weekly on selected weekdays', () => {
    const dates = expandRecurrence({
      startDate: '2026-10-05', // Monday
      freq: 'weekly',
      weekdays: [1, 3], // Mon, Wed
      endMode: 'count',
      count: 4
    })
    expect(dates).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14'])
  })
})

describe('resolveScheduleDates', () => {
  it('resolves today and tomorrow', () => {
    expect(resolveScheduleDates({ mode: 'today' }, '2026-10-27')).toEqual(['2026-10-27'])
    expect(resolveScheduleDates({ mode: 'tomorrow' }, '2026-10-27')).toEqual(['2026-10-28'])
  })

  it('dedupes multi-select dates', () => {
    expect(
      resolveScheduleDates(
        { mode: 'dates', dates: ['2026-10-29', '2026-10-27', '2026-10-27'] },
        '2026-10-01'
      )
    ).toEqual(['2026-10-27', '2026-10-29'])
  })
})

describe('test date countdown', () => {
  it('counts whole calendar days', () => {
    expect(calendarDaysBetween('2026-10-27', '2026-10-30')).toBe(3)
    expect(testDateCountdownLabel('2026-10-30', '2026-10-27')).toBe('3 days until your test')
    expect(testDateCountdownLabel('2026-10-27', '2026-10-27')).toBe('Test day is today')
  })
})
