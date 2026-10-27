import { describe, expect, it } from 'vitest'
import {
  calendarDayStatusCounts,
  eachDateInclusive,
  localYmdFromTimestamp,
  monthGridContaining,
  testCountdownMeterPercent,
  weekRangeContaining
} from '../src/shared/dates'

describe('eachDateInclusive', () => {
  it('expands a single day', () => {
    expect(eachDateInclusive('2026-10-26', '2026-10-26')).toEqual(['2026-10-26'])
  })

  it('expands a multi-day range inclusively', () => {
    expect(eachDateInclusive('2026-10-26', '2026-10-28')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28'
    ])
  })

  it('swaps inverted ranges', () => {
    expect(eachDateInclusive('2026-10-28', '2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28'
    ])
  })
})

describe('calendar grids', () => {
  it('builds a Sunday-start week', () => {
    const week = weekRangeContaining('2026-10-27') // Tuesday
    expect(week.days).toHaveLength(7)
    expect(week.start).toBe('2026-10-25')
    expect(week.end).toBe('2026-10-31')
  })

  it('builds a 6-week month grid', () => {
    const grid = monthGridContaining('2026-10-15')
    expect(grid.days).toHaveLength(42)
    expect(grid.monthIndex).toBe(9)
    expect(grid.days.some((d) => d.ymd === '2026-10-01' && d.inMonth)).toBe(true)
  })
})

describe('testCountdownMeterPercent', () => {
  it('fills more as the test approaches', () => {
    expect(testCountdownMeterPercent(90)).toBe(4)
    expect(testCountdownMeterPercent(45)).toBe(50)
    expect(testCountdownMeterPercent(0)).toBe(100)
  })
})

describe('localYmdFromTimestamp', () => {
  it('passes through YYYY-MM-DD and parses ISO to local calendar day', () => {
    expect(localYmdFromTimestamp('2026-10-27')).toBe('2026-10-27')
    expect(localYmdFromTimestamp('2026-10-27T18:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(localYmdFromTimestamp(null)).toBeNull()
  })
})

describe('calendarDayStatusCounts', () => {
  it('puts yellow on planned day and green only on completion day', () => {
    const map = calendarDayStatusCounts([
      { completed: false, forDate: '2026-11-01', completedAt: null },
      {
        completed: true,
        forDate: '2026-11-01',
        completedAt: '2026-11-03'
      }
    ])
    expect(map.get('2026-11-01')).toEqual({ planned: 1, done: 0 })
    expect(map.get('2026-11-03')).toEqual({ planned: 0, done: 1 })
  })
})
