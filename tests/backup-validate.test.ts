import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, type BackupPayload } from '../src/shared/types'

/** Mirror of validateBackup rules for unit testing without native sqlite. */
function validateBackup(payload: unknown): { ok: true; data: BackupPayload } | { ok: false; message: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Backup file is not valid JSON data.' }
  }
  const data = payload as Partial<BackupPayload>
  if (data.appName !== 'Study Hub') {
    return { ok: false, message: 'This file does not look like a Study Hub backup.' }
  }
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, message: 'Backup schema version is missing or newer than this app supports.' }
  }
  if (!Array.isArray(data.projects) || !Array.isArray(data.resources)) {
    return { ok: false, message: 'Backup is missing required project or resource lists.' }
  }
  return { ok: true, data: data as BackupPayload }
}

describe('backup validation', () => {
  it('accepts a minimal valid backup', () => {
    const result = validateBackup({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appName: 'Study Hub',
      projects: [],
      studyAreas: [],
      resources: [],
      sections: [],
      history: [],
      queue: []
    })
    expect(result.ok).toBe(true)
  })

  it('rejects foreign or incomplete files', () => {
    expect(validateBackup({ appName: 'Other', schemaVersion: 1, projects: [], resources: [] }).ok).toBe(false)
    expect(validateBackup({ appName: 'Study Hub', schemaVersion: 99, projects: [], resources: [] }).ok).toBe(false)
    expect(validateBackup({ appName: 'Study Hub', schemaVersion: 1 }).ok).toBe(false)
  })
})
