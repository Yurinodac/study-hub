import { describe, expect, it } from 'vitest'
import { shouldApplyServerSnapshot } from '../src/shared/draft-sync'

describe('shouldApplyServerSnapshot', () => {
  it('blocks server refresh while a form draft is dirty (typing in progress)', () => {
    expect(shouldApplyServerSnapshot(true)).toBe(false)
  })

  it('allows server refresh when the form is clean', () => {
    expect(shouldApplyServerSnapshot(false)).toBe(true)
  })
})
