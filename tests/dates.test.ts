import { describe, expect, it } from 'vitest'
import { eachDateInclusive } from '../src/shared/dates'

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
