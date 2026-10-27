import type BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import {
  SCHEMA_VERSION,
  type BackupPayload,
  type Category,
  type ExamSectionCode,
  type MissedQuestion,
  type PracticeExam,
  type PracticeReviewStatus,
  type Project,
  type ProjectPreset,
  type QueueItem,
  type Resource,
  type ResourceCard,
  type ResourceConfig,
  type ResourceSection,
  type ResourceType,
  type StudyArea,
  type StudyHistoryEntry,
  type TextbookConfig
} from '../shared/types'
import {
  chapterCompletionFromSections,
  progressFromQueueCompletion,
  summarizeProgress
} from '../shared/progress'
import { eachDateInclusive, localYmdFromTimestamp } from '../shared/dates'
import {
  MCAT_CATEGORY_NAMES,
  clampPracticeScore,
  matchMcatCategoryName,
  practiceExamTotal
} from '../shared/mcat'

type SqlDb = BetterSqlite3.Database

let db: SqlDb | null = null
let dbPath = ''

function loadSqlite(): typeof BetterSqlite3 {
  // Lazy-load so a bad/missing native build can show a startup dialog instead of a silent crash.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('better-sqlite3') as typeof BetterSqlite3
}

export function getDbPath(): string {
  return dbPath
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function openDatabase(userDataPath: string): SqlDb {
  if (db) closeDatabase()
  const dir = join(userDataPath, 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  dbPath = join(dir, 'study-hub.sqlite')
  const Database = loadSqlite()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  // After migrate, seed MCAT category lists for preset projects (idempotent).
  for (const p of listProjects(true)) {
    if (p.preset === 'mcat') ensureMcatCategories(p.id)
  }
  return db
}

export function getDb(): SqlDb {
  if (!db) throw new Error('Database not opened')
  return db
}

function migrate(database: SqlDb): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS study_areas (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      study_area_id TEXT REFERENCES study_areas(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      location_kind TEXT NOT NULL,
      location_value TEXT NOT NULL DEFAULT '',
      config_json TEXT NOT NULL,
      stopping_point_note TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      last_studied_at TEXT,
      confidence REAL,
      archived INTEGER NOT NULL DEFAULT 0,
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      total_units INTEGER,
      completed_units INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS study_history (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      estimated_minutes INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resource_study_areas (
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      study_area_id TEXT NOT NULL REFERENCES study_areas(id) ON DELETE CASCADE,
      PRIMARY KEY (resource_id, study_area_id)
    );
  `)

  ensureColumn(database, 'sections', 'study_area_id', 'TEXT')
  ensureColumn(database, 'queue_items', 'for_date', 'TEXT')
  ensureColumn(database, 'projects', 'preset', "TEXT NOT NULL DEFAULT 'custom'")
  database.exec(`
    CREATE TABLE IF NOT EXISTS practice_exams (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      taken_on TEXT NOT NULL,
      score_cp INTEGER NOT NULL,
      score_cars INTEGER NOT NULL,
      score_bb INTEGER NOT NULL,
      score_ps INTEGER NOT NULL,
      total INTEGER NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'not_reviewed',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as
    | { value: string }
    | undefined
  if (!row) {
    database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schemaVersion', String(SCHEMA_VERSION))
    database.exec(`UPDATE queue_items SET for_date = date('now', 'localtime') WHERE for_date IS NULL`)
  } else {
    const current = Number(row.value)
    if (current < 2) {
      database.exec(`
        INSERT OR IGNORE INTO resource_study_areas (resource_id, study_area_id)
        SELECT id, study_area_id FROM resources WHERE study_area_id IS NOT NULL
      `)
      database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('2', 'schemaVersion')
    }
    if (current < 3) {
      database.exec(`UPDATE queue_items SET for_date = date('now', 'localtime') WHERE for_date IS NULL`)
      database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('3', 'schemaVersion')
    }
    if (current < 4) {
      // Promote default / MCAT-named projects to the MCAT preset and seed categories.
      const projects = database.prepare('SELECT id, name, preset FROM projects').all() as Array<{
        id: string
        name: string
        preset?: string
      }>
      for (const p of projects) {
        const looksMcat =
          /mcat/i.test(p.name) ||
          p.name.trim().toLowerCase() === 'my studies' ||
          p.name.trim().toLowerCase() === 'my study'
        const preset = looksMcat ? 'mcat' : p.preset === 'mcat' ? 'mcat' : 'custom'
        database.prepare('UPDATE projects SET preset = ? WHERE id = ?').run(preset, p.id)
      }
      database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('4', 'schemaVersion')
    }
    if (current < 5) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS practice_missed_questions (
          id TEXT PRIMARY KEY,
          exam_id TEXT NOT NULL REFERENCES practice_exams(id) ON DELETE CASCADE,
          section_code TEXT NOT NULL,
          prompt TEXT NOT NULL,
          correct_answer TEXT NOT NULL DEFAULT '',
          commentary TEXT NOT NULL DEFAULT '',
          confidence INTEGER NOT NULL DEFAULT 1,
          in_rotation INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
      database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('5', 'schemaVersion')
    }
    if (current < 6) {
      migrateMissedQuestionsToV6(database)
      database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('6', 'schemaVersion')
    }
    if (current < 7) {
      ensureColumn(database, 'queue_items', 'completed_at', 'TEXT')
      // Best-effort backfill for older completed rows (no real completion stamp existed).
      database.exec(`
        UPDATE queue_items
        SET completed_at = for_date
        WHERE completed = 1 AND (completed_at IS NULL OR completed_at = '')
          AND for_date IS NOT NULL
      `)
      database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('7', 'schemaVersion')
    }
  }

  // Idempotent: ensure missed-questions table exists (v6 shape: exam_id and/or resource_id).
  ensureMissedQuestionsTable(database)
  ensureColumn(database, 'queue_items', 'completed_at', 'TEXT')
}

function ensureMissedQuestionsTable(database: SqlDb): void {
  const exists = database
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='practice_missed_questions'`)
    .get() as { name?: string } | undefined
  if (!exists) {
    database.exec(`
      CREATE TABLE practice_missed_questions (
        id TEXT PRIMARY KEY,
        exam_id TEXT REFERENCES practice_exams(id) ON DELETE CASCADE,
        resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
        section_code TEXT NOT NULL,
        prompt TEXT NOT NULL,
        correct_answer TEXT NOT NULL DEFAULT '',
        commentary TEXT NOT NULL DEFAULT '',
        confidence INTEGER NOT NULL DEFAULT 1,
        in_rotation INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    return
  }
  ensureColumn(database, 'practice_missed_questions', 'resource_id', 'TEXT')
}

function migrateMissedQuestionsToV6(database: SqlDb): void {
  const exists = database
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='practice_missed_questions'`)
    .get() as { name?: string } | undefined
  if (!exists) {
    ensureMissedQuestionsTable(database)
    return
  }
  const cols = database.prepare(`PRAGMA table_info(practice_missed_questions)`).all() as Array<{
    name: string
  }>
  if (cols.some((c) => c.name === 'resource_id')) {
    // Already has resource_id — leave rows as-is (exam_id may still be NOT NULL from v5).
    return
  }
  database.exec(`
    CREATE TABLE practice_missed_questions_v6 (
      id TEXT PRIMARY KEY,
      exam_id TEXT REFERENCES practice_exams(id) ON DELETE CASCADE,
      resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
      section_code TEXT NOT NULL,
      prompt TEXT NOT NULL,
      correct_answer TEXT NOT NULL DEFAULT '',
      commentary TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 1,
      in_rotation INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO practice_missed_questions_v6 (
      id, exam_id, resource_id, section_code, prompt, correct_answer, commentary,
      confidence, in_rotation, created_at, updated_at
    )
    SELECT
      id, exam_id, NULL, section_code, prompt, correct_answer, commentary,
      confidence, in_rotation, created_at, updated_at
    FROM practice_missed_questions;
    DROP TABLE practice_missed_questions;
    ALTER TABLE practice_missed_questions_v6 RENAME TO practice_missed_questions;
  `)
}

function ensureColumn(database: SqlDb, table: string, column: string, type: string): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

/** Local calendar date YYYY-MM-DD. */
export function localDateISO(offsetDays = 0): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseConfig(json: string): ResourceConfig {
  return JSON.parse(json) as ResourceConfig
}

function getResourceAreaIds(resourceId: string): string[] {
  const rows = getDb()
    .prepare('SELECT study_area_id FROM resource_study_areas WHERE resource_id = ?')
    .all(resourceId) as Array<{ study_area_id: string }>
  return rows.map((r) => String(r.study_area_id))
}

function getResourceAreaNames(resourceId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT a.name AS name
       FROM resource_study_areas rsa
       JOIN study_areas a ON a.id = rsa.study_area_id
       WHERE rsa.resource_id = ?
       ORDER BY a.sort_order ASC, a.name ASC`
    )
    .all(resourceId) as Array<{ name: string }>
  return rows.map((r) => String(r.name))
}

export function setResourceAreas(resourceId: string, areaIds: string[]): void {
  const unique = Array.from(new Set(areaIds.filter(Boolean)))
  const database = getDb()
  database.prepare('DELETE FROM resource_study_areas WHERE resource_id = ?').run(resourceId)
  const insert = database.prepare(
    'INSERT INTO resource_study_areas (resource_id, study_area_id) VALUES (?, ?)'
  )
  for (const areaId of unique) insert.run(resourceId, areaId)
  database
    .prepare('UPDATE resources SET study_area_id = ? WHERE id = ?')
    .run(unique[0] ?? null, resourceId)
}

function mapResource(row: Record<string, unknown>): Resource {
  const id = String(row.id)
  let studyAreaIds = getResourceAreaIds(id)
  if (!studyAreaIds.length && row.study_area_id) {
    studyAreaIds = [String(row.study_area_id)]
  }
  return {
    id,
    projectId: String(row.project_id),
    studyAreaId: studyAreaIds[0] ?? (row.study_area_id ? String(row.study_area_id) : null),
    studyAreaIds,
    name: String(row.name),
    type: row.type as ResourceType,
    locationKind: row.location_kind as Resource['locationKind'],
    locationValue: String(row.location_value ?? ''),
    config: parseConfig(String(row.config_json)),
    stoppingPointNote: String(row.stopping_point_note ?? ''),
    nextAction: String(row.next_action ?? ''),
    notes: String(row.notes ?? ''),
    lastStudiedAt: row.last_studied_at ? String(row.last_studied_at) : null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    archived: Boolean(row.archived),
    isSample: Boolean(row.is_sample),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapProject(r: Record<string, unknown>): Project {
  const presetRaw = String(r.preset ?? 'custom')
  const preset: ProjectPreset = presetRaw === 'mcat' ? 'mcat' : 'custom'
  return {
    id: String(r.id),
    name: String(r.name),
    createdAt: String(r.created_at),
    archived: Boolean(r.archived),
    preset
  }
}

export function listProjects(includeArchived = false): Project[] {
  const sql = includeArchived
    ? 'SELECT * FROM projects ORDER BY created_at ASC'
    : 'SELECT * FROM projects WHERE archived = 0 ORDER BY created_at ASC'
  const rows = getDb().prepare(sql).all() as Array<Record<string, unknown>>
  return rows.map(mapProject)
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? mapProject(row) : null
}

/**
 * Create a project. preset=mcat seeds the eight shared study categories.
 */
export function createProject(name: string, preset: ProjectPreset = 'custom'): Project {
  const project: Project = {
    id: randomUUID(),
    name: name.trim() || 'Untitled project',
    createdAt: nowIso(),
    archived: false,
    preset
  }
  getDb()
    .prepare('INSERT INTO projects (id, name, created_at, archived, preset) VALUES (?, ?, ?, 0, ?)')
    .run(project.id, project.name, project.createdAt, project.preset)
  if (preset === 'mcat') {
    ensureMcatCategories(project.id)
  }
  return project
}

/** Ensure the eight MCAT study categories exist (idempotent; maps aliases). */
export function ensureMcatCategories(projectId: string): Category[] {
  const existing = listCategories(projectId)
  const byNorm = new Map<string, Category>()
  for (const c of existing) {
    byNorm.set(c.name.trim().toLowerCase(), c)
    const matched = matchMcatCategoryName(c.name)
    if (matched) byNorm.set(matched.toLowerCase(), c)
  }

  MCAT_CATEGORY_NAMES.forEach((name, index) => {
    const key = name.toLowerCase()
    if (byNorm.has(key)) {
      // Rename alias rows to the canonical preset name when safe.
      const row = byNorm.get(key)!
      if (row.name !== name && matchMcatCategoryName(row.name) === name) {
        getDb().prepare('UPDATE study_areas SET name = ?, sort_order = ? WHERE id = ?').run(name, index, row.id)
      } else {
        getDb().prepare('UPDATE study_areas SET sort_order = ? WHERE id = ?').run(index, row.id)
      }
      return
    }
    // Prefer remapping an unused custom row that matches an alias
    const alias = existing.find((c) => matchMcatCategoryName(c.name) === name)
    if (alias) {
      getDb()
        .prepare('UPDATE study_areas SET name = ?, sort_order = ? WHERE id = ?')
        .run(name, index, alias.id)
      return
    }
    createCategory(projectId, name, index)
  })

  getDb().prepare('UPDATE projects SET preset = ? WHERE id = ?').run('mcat', projectId)
  return listCategories(projectId)
}

export function renameProject(id: string, name: string): void {
  getDb().prepare('UPDATE projects SET name = ? WHERE id = ?').run(name.trim() || 'Untitled project', id)
}

/** Soft-delete: hide project from selectors; data remains in the database. */
export function archiveProject(id: string): void {
  getDb().prepare('UPDATE projects SET archived = 1 WHERE id = ?').run(id)
}

export function listCategories(projectId: string): Category[] {
  const rows = getDb()
    .prepare('SELECT * FROM study_areas WHERE project_id = ? ORDER BY sort_order ASC, name ASC')
    .all(projectId) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    name: String(r.name),
    sortOrder: Number(r.sort_order)
  }))
}

/** @deprecated Prefer listCategories */
export const listStudyAreas = listCategories

export function createCategory(projectId: string, name: string, sortOrder?: number): Category {
  const max = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM study_areas WHERE project_id = ?')
    .get(projectId) as { m: number }
  const area: Category = {
    id: randomUUID(),
    projectId,
    name: name.trim() || 'Untitled category',
    sortOrder: sortOrder != null ? sortOrder : max.m + 1
  }
  getDb()
    .prepare('INSERT INTO study_areas (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)')
    .run(area.id, area.projectId, area.name, area.sortOrder)
  return area
}

/** @deprecated Prefer createCategory */
export function createStudyArea(projectId: string, name: string): StudyArea {
  return createCategory(projectId, name)
}

export function renameCategory(id: string, name: string): void {
  getDb().prepare('UPDATE study_areas SET name = ? WHERE id = ?').run(name.trim() || 'Untitled category', id)
}

/** @deprecated Prefer renameCategory */
export const renameStudyArea = renameCategory

/** Remove a category; resources keep their data but lose the tag. */
export function deleteCategory(id: string): void {
  getDb().prepare('DELETE FROM resource_study_areas WHERE study_area_id = ?').run(id)
  getDb().prepare('UPDATE resources SET study_area_id = NULL WHERE study_area_id = ?').run(id)
  getDb().prepare('DELETE FROM study_areas WHERE id = ?').run(id)
}

/** @deprecated Prefer deleteCategory */
export const deleteStudyArea = deleteCategory

/** Distinct section names for a project (for simple filters). */
export function listSectionNames(projectId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT s.name AS name
       FROM sections s
       JOIN resources r ON r.id = s.resource_id
       WHERE r.project_id = ? AND r.archived = 0
       ORDER BY s.name ASC`
    )
    .all(projectId) as Array<{ name: string }>
  return rows.map((r) => String(r.name))
}

export function listResources(projectId: string, opts?: {
  query?: string
  studyAreaId?: string | null
  type?: ResourceType | null
  sectionName?: string | null
  includeArchived?: boolean
}): ResourceCard[] {
  let sql = `
    SELECT r.*, p.name AS project_name, a.name AS study_area_name
    FROM resources r
    JOIN projects p ON p.id = r.project_id
    LEFT JOIN study_areas a ON a.id = r.study_area_id
    WHERE r.project_id = ?
  `
  const params: unknown[] = [projectId]
  if (!opts?.includeArchived) {
    sql += ' AND r.archived = 0'
  }
  if (opts?.studyAreaId) {
    sql += ` AND (
      EXISTS (
        SELECT 1 FROM resource_study_areas rsa
        WHERE rsa.resource_id = r.id AND rsa.study_area_id = ?
      )
      OR r.study_area_id = ?
    )`
    params.push(opts.studyAreaId, opts.studyAreaId)
  }
  if (opts?.type) {
    sql += ' AND r.type = ?'
    params.push(opts.type)
  }
  if (opts?.sectionName?.trim()) {
    sql += ` AND EXISTS (
      SELECT 1 FROM sections s
      WHERE s.resource_id = r.id AND s.name = ?
    )`
    params.push(opts.sectionName.trim())
  }
  if (opts?.query?.trim()) {
    sql += ' AND (r.name LIKE ? OR r.next_action LIKE ? OR r.stopping_point_note LIKE ?)'
    const q = `%${opts.query.trim()}%`
    params.push(q, q, q)
  }
  sql += ' ORDER BY r.is_sample ASC, COALESCE(r.last_studied_at, r.updated_at) DESC'

  const rows = getDb().prepare(sql).all(...params) as Array<Record<string, unknown>>
  return rows.map((row) => {
    const resource = mapResource(row)
    const names = getResourceAreaNames(resource.id)
    const sectionProgress = getSectionProgress(resource.id)
    return {
      ...resource,
      projectName: String(row.project_name),
      studyAreaName: names[0] ?? (row.study_area_name ? String(row.study_area_name) : null),
      studyAreaNames: names,
      categoryNames: names,
      sectionProgress,
      progressSummary: summarizeProgress(resource, sectionProgress)
    }
  })
}

/**
 * Chapter completion for Overview / cards: count of chapters marked done on the Chapters tab
 * vs optional totalChapters (or listed chapter count).
 */
export function getSectionProgress(resourceId: string): { done: number; total: number } | null {
  const sections = listSections(resourceId)
  const resource = getResource(resourceId)
  const totalChapters =
    resource?.type === 'textbook'
      ? (resource.config as TextbookConfig).totalChapters
      : null
  return chapterCompletionFromSections(sections, totalChapters)
}

export function getResource(id: string): Resource | null {
  const row = getDb().prepare('SELECT * FROM resources WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapResource(row) : null
}

export function createResource(input: {
  projectId: string
  studyAreaId?: string | null
  studyAreaIds?: string[]
  name: string
  type: ResourceType
  locationKind: Resource['locationKind']
  locationValue?: string
  config: ResourceConfig
  stoppingPointNote?: string
  nextAction?: string
  notes?: string
  isSample?: boolean
}): Resource {
  const stamp = nowIso()
  const areaIds =
    input.studyAreaIds && input.studyAreaIds.length
      ? Array.from(new Set(input.studyAreaIds.filter(Boolean)))
      : input.studyAreaId
        ? [input.studyAreaId]
        : []
  const resource: Resource = {
    id: randomUUID(),
    projectId: input.projectId,
    studyAreaId: areaIds[0] ?? null,
    studyAreaIds: areaIds,
    name: input.name.trim() || 'Untitled resource',
    type: input.type,
    locationKind: input.locationKind,
    locationValue: input.locationValue?.trim() ?? '',
    config: input.config,
    stoppingPointNote: input.stoppingPointNote ?? '',
    nextAction: input.nextAction ?? '',
    notes: input.notes ?? '',
    lastStudiedAt: null,
    confidence: null,
    archived: false,
    isSample: Boolean(input.isSample),
    createdAt: stamp,
    updatedAt: stamp
  }
  getDb()
    .prepare(
      `INSERT INTO resources (
        id, project_id, study_area_id, name, type, location_kind, location_value,
        config_json, stopping_point_note, next_action, notes, last_studied_at,
        confidence, archived, is_sample, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      resource.id,
      resource.projectId,
      resource.studyAreaId,
      resource.name,
      resource.type,
      resource.locationKind,
      resource.locationValue,
      JSON.stringify(resource.config),
      resource.stoppingPointNote,
      resource.nextAction,
      resource.notes,
      resource.lastStudiedAt,
      resource.confidence,
      resource.isSample ? 1 : 0,
      resource.createdAt,
      resource.updatedAt
    )
  setResourceAreas(resource.id, areaIds)
  return getResource(resource.id)!
}

export function updateResource(
  id: string,
  patch: Partial<{
    name: string
    studyAreaId: string | null
    studyAreaIds: string[]
    locationKind: Resource['locationKind']
    locationValue: string
    config: ResourceConfig
    stoppingPointNote: string
    nextAction: string
    notes: string
    confidence: number | null
    archived: boolean
    lastStudiedAt: string | null
  }>,
  historySummary?: string,
  historyExtras?: import('../shared/types').HistoryExtras
): Resource {
  const current = getResource(id)
  if (!current) throw new Error('Resource not found')

  const nextAreaIds =
    patch.studyAreaIds !== undefined
      ? Array.from(new Set(patch.studyAreaIds.filter(Boolean)))
      : patch.studyAreaId !== undefined
        ? patch.studyAreaId
          ? [patch.studyAreaId]
          : []
        : current.studyAreaIds

  const next: Resource = {
    ...current,
    name: patch.name?.trim() || current.name,
    studyAreaIds: nextAreaIds,
    studyAreaId: nextAreaIds[0] ?? null,
    locationKind: patch.locationKind ?? current.locationKind,
    locationValue: patch.locationValue !== undefined ? patch.locationValue : current.locationValue,
    config: patch.config ?? current.config,
    stoppingPointNote:
      patch.stoppingPointNote !== undefined ? patch.stoppingPointNote : current.stoppingPointNote,
    nextAction: patch.nextAction !== undefined ? patch.nextAction : current.nextAction,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    confidence: patch.confidence !== undefined ? patch.confidence : current.confidence,
    archived: patch.archived !== undefined ? patch.archived : current.archived,
    lastStudiedAt: patch.lastStudiedAt !== undefined ? patch.lastStudiedAt : current.lastStudiedAt,
    updatedAt: nowIso()
  }

  getDb()
    .prepare(
      `UPDATE resources SET
        name = ?, study_area_id = ?, location_kind = ?, location_value = ?,
        config_json = ?, stopping_point_note = ?, next_action = ?, notes = ?,
        confidence = ?, archived = ?, last_studied_at = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(
      next.name,
      next.studyAreaId,
      next.locationKind,
      next.locationValue,
      JSON.stringify(next.config),
      next.stoppingPointNote,
      next.nextAction,
      next.notes,
      next.confidence,
      next.archived ? 1 : 0,
      next.lastStudiedAt,
      next.updatedAt,
      id
    )

  if (patch.studyAreaIds !== undefined || patch.studyAreaId !== undefined) {
    setResourceAreas(id, nextAreaIds)
  }

  if (historySummary) {
    const areaIds = historyExtras?.studyAreaIds ?? next.studyAreaIds
    const areaNames = areaIds.length
      ? (getDb()
          .prepare(
            `SELECT name FROM study_areas WHERE id IN (${areaIds.map(() => '?').join(',')}) ORDER BY sort_order, name`
          )
          .all(...areaIds) as Array<{ name: string }>).map((r) => r.name)
      : []
    const allSections = listSections(id)
    const linkedIds = [
      ...(historyExtras?.sectionIds ?? []),
      ...(historyExtras?.sectionId ? [historyExtras.sectionId] : [])
    ].filter((sid, i, arr) => sid && arr.indexOf(sid) === i)
    const linked = linkedIds
      .map((sid) => allSections.find((s) => s.id === sid))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
    const sectionId = linked[0]?.id
    const sectionName = linked[0]?.name
    const sectionNames = linked.map((s) => s.name)
    addHistory(id, historySummary, {
      config: next.config,
      stoppingPointNote: next.stoppingPointNote,
      nextAction: next.nextAction,
      studiedPart:
        historyExtras?.studiedPart ??
        (sectionNames.length ? sectionNames.join(', ') : undefined),
      details: historyExtras?.details,
      studyAreaIds: areaIds,
      studyAreaNames: areaNames,
      sectionId,
      sectionName,
      sectionIds: linked.map((s) => s.id),
      sectionNames
    })
  }

  return getResource(id)!
}

export function addHistory(
  resourceId: string,
  summary: string,
  payload: import('../shared/types').StudyHistoryPayload
): StudyHistoryEntry {
  const entry: StudyHistoryEntry = {
    id: randomUUID(),
    resourceId,
    recordedAt: nowIso(),
    summary,
    payload
  }
  getDb()
    .prepare(
      'INSERT INTO study_history (id, resource_id, recorded_at, summary, payload_json) VALUES (?, ?, ?, ?, ?)'
    )
    .run(entry.id, entry.resourceId, entry.recordedAt, entry.summary, JSON.stringify(entry.payload))
  return entry
}

export function listHistory(resourceId: string): StudyHistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM study_history WHERE resource_id = ? ORDER BY recorded_at DESC LIMIT 50')
    .all(resourceId) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    resourceId: String(r.resource_id),
    recordedAt: String(r.recorded_at),
    summary: String(r.summary),
    payload: JSON.parse(String(r.payload_json)) as import('../shared/types').StudyHistoryPayload
  }))
}

/** All study history for a project, newest first. */
export function listProjectHistory(projectId: string): import('../shared/types').ProjectHistoryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT h.*, r.name AS resource_name
       FROM study_history h
       JOIN resources r ON r.id = h.resource_id
       WHERE r.project_id = ?
       ORDER BY h.recorded_at DESC
       LIMIT 100`
    )
    .all(projectId) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    resourceId: String(r.resource_id),
    resourceName: String(r.resource_name ?? 'Resource'),
    recordedAt: String(r.recorded_at),
    summary: String(r.summary),
    payload: JSON.parse(String(r.payload_json)) as import('../shared/types').StudyHistoryPayload
  }))
}

/** Remove a history entry the user does not want (simple correction). */
export function deleteHistoryEntry(historyId: string): void {
  getDb().prepare('DELETE FROM study_history WHERE id = ?').run(historyId)
}

export function listSections(resourceId: string, studyAreaId?: string | null): ResourceSection[] {
  let sql = 'SELECT * FROM sections WHERE resource_id = ?'
  const params: unknown[] = [resourceId]
  if (studyAreaId) {
    sql += ' AND study_area_id = ?'
    params.push(studyAreaId)
  }
  sql += ' ORDER BY sort_order ASC'
  const rows = getDb().prepare(sql).all(...params) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    resourceId: String(r.resource_id),
    studyAreaId: r.study_area_id ? String(r.study_area_id) : null,
    name: String(r.name),
    sortOrder: Number(r.sort_order),
    totalUnits: r.total_units == null ? null : Number(r.total_units),
    completedUnits: Number(r.completed_units),
    notes: String(r.notes ?? '')
  }))
}

export function upsertSection(input: {
  id?: string
  resourceId: string
  name: string
  studyAreaId?: string | null
  sortOrder?: number
  totalUnits?: number | null
  completedUnits?: number
  notes?: string
}): ResourceSection {
  if (input.id) {
    const existing = listSections(input.resourceId).find((s) => s.id === input.id)
    if (!existing) throw new Error('Section not found')
    const nextArea =
      input.studyAreaId !== undefined ? input.studyAreaId : existing.studyAreaId
    getDb()
      .prepare(
        `UPDATE sections SET name = ?, sort_order = COALESCE(?, sort_order),
         total_units = ?, completed_units = COALESCE(?, completed_units), notes = COALESCE(?, notes),
         study_area_id = ?
         WHERE id = ?`
      )
      .run(
        input.name.trim() || 'Section',
        input.sortOrder ?? null,
        input.totalUnits ?? null,
        input.completedUnits ?? null,
        input.notes ?? null,
        nextArea,
        input.id
      )
    return listSections(input.resourceId).find((s) => s.id === input.id)!
  }

  const max = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sections WHERE resource_id = ?')
    .get(input.resourceId) as { m: number }
  const section: ResourceSection = {
    id: randomUUID(),
    resourceId: input.resourceId,
    studyAreaId: input.studyAreaId ?? null,
    name: input.name.trim() || 'Section',
    sortOrder: input.sortOrder ?? max.m + 1,
    // Default 1 unit so Mark done / Mark not done maps cleanly to completed vs incomplete.
    totalUnits: input.totalUnits !== undefined ? input.totalUnits : 1,
    completedUnits: input.completedUnits ?? 0,
    notes: input.notes ?? ''
  }
  getDb()
    .prepare(
      `INSERT INTO sections (id, resource_id, name, sort_order, total_units, completed_units, notes, study_area_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      section.id,
      section.resourceId,
      section.name,
      section.sortOrder,
      section.totalUnits,
      section.completedUnits,
      section.notes,
      section.studyAreaId
    )
  return section
}

export function deleteSection(id: string): void {
  getDb().prepare('DELETE FROM sections WHERE id = ?').run(id)
}

function mapQueueRow(r: Record<string, unknown>): QueueItem {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    resourceId: r.resource_id ? String(r.resource_id) : null,
    description: String(r.description),
    estimatedMinutes: r.estimated_minutes == null ? null : Number(r.estimated_minutes),
    sortOrder: Number(r.sort_order),
    completed: Boolean(r.completed),
    forDate: r.for_date ? String(r.for_date) : localDateISO(0),
    completedAt: r.completed_at ? String(r.completed_at) : null,
    createdAt: String(r.created_at)
  }
}

/** Active items for today (for_date today or earlier). Tomorrow items appear here once their day arrives. */
export function listQueue(projectId: string, includeCompleted = false): QueueItem[] {
  const today = localDateISO(0)
  const sql = includeCompleted
    ? `SELECT * FROM queue_items WHERE project_id = ?
       ORDER BY completed ASC, sort_order ASC`
    : `SELECT * FROM queue_items
       WHERE project_id = ? AND completed = 0
         AND (for_date IS NULL OR for_date <= ?)
       ORDER BY sort_order ASC`
  const rows = (
    includeCompleted
      ? getDb().prepare(sql).all(projectId)
      : getDb().prepare(sql).all(projectId, today)
  ) as Array<Record<string, unknown>>
  return rows.map(mapQueueRow)
}

/** Items scheduled for tomorrow (not yet on Today). */
export function listTomorrowQueue(projectId: string): QueueItem[] {
  return listQueueForDate(projectId, localDateISO(1))
}

/**
 * Queue items for a calendar day.
 * - Open items: scheduled for that day (for_date).
 * - When includeCompleted: also completed items whose completion day (local YMD of completed_at) is that day.
 */
export function listQueueForDate(
  projectId: string,
  forDate: string,
  includeCompleted = false
): QueueItem[] {
  if (!includeCompleted) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM queue_items
         WHERE project_id = ? AND completed = 0 AND for_date = ?
         ORDER BY sort_order ASC`
      )
      .all(projectId, forDate) as Array<Record<string, unknown>>
    return rows.map(mapQueueRow)
  }
  // Pull a wider set and filter completion day in JS (completed_at is ISO; local YMD varies by TZ).
  const open = getDb()
    .prepare(
      `SELECT * FROM queue_items
       WHERE project_id = ? AND completed = 0 AND for_date = ?
       ORDER BY sort_order ASC`
    )
    .all(projectId, forDate) as Array<Record<string, unknown>>
  const doneCandidates = getDb()
    .prepare(
      `SELECT * FROM queue_items
       WHERE project_id = ? AND completed = 1 AND completed_at IS NOT NULL
       ORDER BY sort_order ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>
  const done = doneCandidates.filter((r) => localYmdFromTimestamp(String(r.completed_at)) === forDate)
  return [...open, ...done].map(mapQueueRow)
}

/**
 * Queue items relevant to a calendar range for markers:
 * - planned (yellow): incomplete, for_date in range
 * - done (green): completed, local completion day in range
 */
export function listQueueInRange(projectId: string, startYmd: string, endYmd: string): QueueItem[] {
  const planned = getDb()
    .prepare(
      `SELECT * FROM queue_items
       WHERE project_id = ? AND completed = 0
         AND for_date IS NOT NULL AND for_date >= ? AND for_date <= ?
       ORDER BY for_date ASC, sort_order ASC`
    )
    .all(projectId, startYmd, endYmd) as Array<Record<string, unknown>>
  // Completed rows: load those that might fall in range (ISO dates sort near YMD; pad a day for TZ).
  const doneCandidates = getDb()
    .prepare(
      `SELECT * FROM queue_items
       WHERE project_id = ? AND completed = 1 AND completed_at IS NOT NULL
         AND substr(completed_at, 1, 10) >= date(?, '-1 day')
         AND substr(completed_at, 1, 10) <= date(?, '+1 day')
       ORDER BY completed_at ASC, sort_order ASC`
    )
    .all(projectId, startYmd, endYmd) as Array<Record<string, unknown>>
  const done = doneCandidates.filter((r) => {
    const ymd = localYmdFromTimestamp(String(r.completed_at))
    return ymd != null && ymd >= startYmd && ymd <= endYmd
  })
  return [...planned, ...done].map(mapQueueRow)
}

export function addQueueItem(input: {
  projectId: string
  resourceId?: string | null
  description: string
  estimatedMinutes?: number | null
  /** 'today' | 'tomorrow' or explicit YYYY-MM-DD */
  when?: 'today' | 'tomorrow' | string
}): QueueItem {
  const forDate =
    input.when === 'tomorrow'
      ? localDateISO(1)
      : !input.when || input.when === 'today'
        ? localDateISO(0)
        : input.when
  return insertQueueItemForDate({
    projectId: input.projectId,
    resourceId: input.resourceId ?? null,
    description: input.description,
    estimatedMinutes: input.estimatedMinutes ?? null,
    forDate
  })
}

function insertQueueItemForDate(input: {
  projectId: string
  resourceId: string | null
  description: string
  estimatedMinutes: number | null
  forDate: string
}): QueueItem {
  const max = getDb()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM queue_items
       WHERE project_id = ? AND completed = 0 AND (for_date IS NULL OR for_date = ?)`
    )
    .get(input.projectId, input.forDate) as { m: number }
  const item: QueueItem = {
    id: randomUUID(),
    projectId: input.projectId,
    resourceId: input.resourceId,
    description: input.description.trim() || 'Study task',
    estimatedMinutes: input.estimatedMinutes,
    sortOrder: max.m + 1,
    completed: false,
    forDate: input.forDate,
    completedAt: null,
    createdAt: nowIso()
  }
  getDb()
    .prepare(
      `INSERT INTO queue_items (id, project_id, resource_id, description, estimated_minutes, sort_order, completed, created_at, for_date, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`
    )
    .run(
      item.id,
      item.projectId,
      item.resourceId,
      item.description,
      item.estimatedMinutes,
      item.sortOrder,
      item.createdAt,
      item.forDate
    )
  return item
}

/**
 * Add the same task to one day or many days (inclusive date range → one queue row per day).
 */
export function addQueueItemsForDates(input: {
  projectId: string
  resourceId?: string | null
  description: string
  estimatedMinutes?: number | null
  startDate: string
  endDate?: string
  /** Prefer this when scheduling multi-select or recurrence expansions. */
  dates?: string[]
}): QueueItem[] {
  const dates =
    input.dates?.length
      ? Array.from(new Set(input.dates.map((d) => d.trim()).filter(Boolean))).sort()
      : eachDateInclusive(input.startDate, input.endDate ?? input.startDate)
  if (!dates.length) {
    throw new Error('Pick at least one valid date.')
  }
  const created: QueueItem[] = []
  const tx = getDb().transaction(() => {
    for (const forDate of dates) {
      created.push(
        insertQueueItemForDate({
          projectId: input.projectId,
          resourceId: input.resourceId ?? null,
          description: input.description,
          estimatedMinutes: input.estimatedMinutes ?? null,
          forDate
        })
      )
    }
  })
  tx()
  return created
}

export function updateQueueItem(
  id: string,
  patch: Partial<{
    description: string
    estimatedMinutes: number | null
    completed: boolean
    completedAt: string | null
    sortOrder: number
    resourceId: string | null
  }>
): void {
  const row = getDb().prepare('SELECT * FROM queue_items WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) throw new Error('Queue item not found')
  const nextCompleted =
    patch.completed !== undefined ? (patch.completed ? 1 : 0) : row.completed
  let nextCompletedAt: string | null =
    patch.completedAt !== undefined
      ? patch.completedAt
      : row.completed_at
        ? String(row.completed_at)
        : null
  if (patch.completed === true && !nextCompletedAt) {
    nextCompletedAt = nowIso()
  }
  if (patch.completed === false) {
    nextCompletedAt = null
  }
  getDb()
    .prepare(
      `UPDATE queue_items SET
        description = ?,
        estimated_minutes = ?,
        completed = ?,
        completed_at = ?,
        sort_order = ?,
        resource_id = ?
      WHERE id = ?`
    )
    .run(
      patch.description !== undefined ? patch.description : row.description,
      patch.estimatedMinutes !== undefined ? patch.estimatedMinutes : row.estimated_minutes,
      nextCompleted,
      nextCompletedAt,
      patch.sortOrder !== undefined ? patch.sortOrder : row.sort_order,
      patch.resourceId !== undefined ? patch.resourceId : row.resource_id,
      id
    )
}

/**
 * Mark a queue item complete. If linked to a resource, also record a progress/history session.
 * Unlinked items only complete the queue row.
 */
export function completeQueueItem(id: string): {
  progressRecorded: boolean
  resourceId: string | null
} {
  const row = getDb().prepare('SELECT * FROM queue_items WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (!row) throw new Error('Queue item not found')

  updateQueueItem(id, { completed: true, completedAt: nowIso() })

  const resourceId = row.resource_id ? String(row.resource_id) : null
  if (!resourceId) {
    return { progressRecorded: false, resourceId: null }
  }

  const resource = getResource(resourceId)
  if (!resource) {
    return { progressRecorded: false, resourceId }
  }

  const bump = progressFromQueueCompletion(
    resource,
    String(row.description ?? ''),
    row.estimated_minutes != null ? Number(row.estimated_minutes) : null
  )

  updateResource(
    resource.id,
    {
      config: bump.config,
      lastStudiedAt: nowIso(),
      // Task done — clear lingering next action so Continue studying stays accurate.
      nextAction: ''
    },
    bump.summary,
    {
      studiedPart: bump.studiedPart,
      details: bump.details,
      studyAreaIds: resource.studyAreaIds
    }
  )

  return { progressRecorded: true, resourceId }
}

export function deleteQueueItem(id: string): void {
  getDb().prepare('DELETE FROM queue_items WHERE id = ?').run(id)
}

export function reorderQueue(projectId: string, orderedIds: string[]): void {
  const stmt = getDb().prepare('UPDATE queue_items SET sort_order = ? WHERE id = ? AND project_id = ?')
  const tx = getDb().transaction((ids: string[]) => {
    ids.forEach((id, index) => stmt.run(index, id, projectId))
  })
  tx(orderedIds)
}

export function removeSampleData(projectId?: string): number {
  const database = getDb()
  if (projectId) {
    const info = database.prepare('DELETE FROM resources WHERE is_sample = 1 AND project_id = ?').run(projectId)
    return info.changes
  }
  const info = database.prepare('DELETE FROM resources WHERE is_sample = 1').run()
  return info.changes
}

function mapPracticeExam(r: Record<string, unknown>): PracticeExam {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    name: String(r.name),
    takenOn: String(r.taken_on),
    scoreCp: Number(r.score_cp),
    scoreCars: Number(r.score_cars),
    scoreBb: Number(r.score_bb),
    scorePs: Number(r.score_ps),
    total: Number(r.total),
    reviewStatus: String(r.review_status) as PracticeReviewStatus,
    notes: String(r.notes ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

export function listPracticeExams(projectId: string): PracticeExam[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM practice_exams WHERE project_id = ? ORDER BY taken_on DESC, created_at DESC'
    )
    .all(projectId) as Array<Record<string, unknown>>
  return rows.map(mapPracticeExam)
}

export function upsertPracticeExam(input: {
  id?: string
  projectId: string
  name: string
  takenOn: string
  scoreCp: number
  scoreCars: number
  scoreBb: number
  scorePs: number
  reviewStatus?: PracticeReviewStatus
  notes?: string
}): PracticeExam {
  const scores = {
    cp: clampPracticeScore(input.scoreCp),
    cars: clampPracticeScore(input.scoreCars),
    bb: clampPracticeScore(input.scoreBb),
    ps: clampPracticeScore(input.scorePs)
  }
  const total = practiceExamTotal(scores)
  const stamp = nowIso()
  if (input.id) {
    getDb()
      .prepare(
        `UPDATE practice_exams SET
          name = ?, taken_on = ?, score_cp = ?, score_cars = ?, score_bb = ?, score_ps = ?,
          total = ?, review_status = ?, notes = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(
        input.name.trim() || 'Practice exam',
        input.takenOn || localDateISO(0),
        scores.cp,
        scores.cars,
        scores.bb,
        scores.ps,
        total,
        input.reviewStatus ?? 'not_reviewed',
        input.notes ?? '',
        stamp,
        input.id
      )
    const row = getDb().prepare('SELECT * FROM practice_exams WHERE id = ?').get(input.id) as Record<
      string,
      unknown
    >
    return mapPracticeExam(row)
  }

  const exam: PracticeExam = {
    id: randomUUID(),
    projectId: input.projectId,
    name: input.name.trim() || 'Practice exam',
    takenOn: input.takenOn || localDateISO(0),
    scoreCp: scores.cp,
    scoreCars: scores.cars,
    scoreBb: scores.bb,
    scorePs: scores.ps,
    total,
    reviewStatus: input.reviewStatus ?? 'not_reviewed',
    notes: input.notes ?? '',
    createdAt: stamp,
    updatedAt: stamp
  }
  getDb()
    .prepare(
      `INSERT INTO practice_exams (
        id, project_id, name, taken_on, score_cp, score_cars, score_bb, score_ps,
        total, review_status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exam.id,
      exam.projectId,
      exam.name,
      exam.takenOn,
      exam.scoreCp,
      exam.scoreCars,
      exam.scoreBb,
      exam.scorePs,
      exam.total,
      exam.reviewStatus,
      exam.notes,
      exam.createdAt,
      exam.updatedAt
    )
  return exam
}

export function deletePracticeExam(id: string): void {
  getDb().prepare('DELETE FROM practice_exams WHERE id = ?').run(id)
}

function mapMissedQuestion(r: Record<string, unknown>): MissedQuestion {
  return {
    id: String(r.id),
    examId: r.exam_id ? String(r.exam_id) : null,
    resourceId: r.resource_id ? String(r.resource_id) : null,
    sectionCode: String(r.section_code) as ExamSectionCode,
    prompt: String(r.prompt ?? ''),
    correctAnswer: String(r.correct_answer ?? ''),
    commentary: String(r.commentary ?? ''),
    confidence: Math.min(5, Math.max(1, Number(r.confidence) || 1)),
    inRotation: Boolean(r.in_rotation),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

export function listMissedQuestions(examId: string): MissedQuestion[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM practice_missed_questions WHERE exam_id = ?
       ORDER BY section_code ASC, created_at ASC`
    )
    .all(examId) as Array<Record<string, unknown>>
  return rows.map(mapMissedQuestion)
}

export function listMissedQuestionsForResource(resourceId: string): MissedQuestion[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM practice_missed_questions WHERE resource_id = ?
       ORDER BY section_code ASC, created_at ASC`
    )
    .all(resourceId) as Array<Record<string, unknown>>
  return rows.map(mapMissedQuestion)
}

export function listMissedQuestionsInRotation(projectId: string): MissedQuestion[] {
  const rows = getDb()
    .prepare(
      `SELECT mq.* FROM practice_missed_questions mq
       LEFT JOIN practice_exams e ON e.id = mq.exam_id
       LEFT JOIN resources r ON r.id = mq.resource_id
       WHERE mq.in_rotation = 1
         AND (
           (e.project_id IS NOT NULL AND e.project_id = ?)
           OR (r.project_id IS NOT NULL AND r.project_id = ?)
         )
       ORDER BY mq.confidence ASC, mq.updated_at ASC`
    )
    .all(projectId, projectId) as Array<Record<string, unknown>>
  return rows.map(mapMissedQuestion)
}

export function upsertMissedQuestion(input: {
  id?: string
  examId?: string | null
  resourceId?: string | null
  sectionCode: ExamSectionCode
  prompt: string
  correctAnswer?: string
  commentary?: string
  confidence?: number
  inRotation?: boolean
}): MissedQuestion {
  const stamp = nowIso()
  const confidence = Math.min(5, Math.max(1, Math.round(input.confidence ?? 1)))
  const examId = input.examId?.trim() || null
  const resourceId = input.resourceId?.trim() || null
  if (!input.id && !examId && !resourceId) {
    throw new Error('Missed questions need a practice exam or a question resource.')
  }
  if (input.id) {
    getDb()
      .prepare(
        `UPDATE practice_missed_questions SET
          section_code = ?, prompt = ?, correct_answer = ?, commentary = ?,
          confidence = ?, in_rotation = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.sectionCode,
        input.prompt.trim(),
        (input.correctAnswer ?? '').trim(),
        (input.commentary ?? '').trim(),
        confidence,
        input.inRotation === false ? 0 : 1,
        stamp,
        input.id
      )
    const row = getDb()
      .prepare('SELECT * FROM practice_missed_questions WHERE id = ?')
      .get(input.id) as Record<string, unknown>
    return mapMissedQuestion(row)
  }
  const q: MissedQuestion = {
    id: randomUUID(),
    examId,
    resourceId,
    sectionCode: input.sectionCode,
    prompt: input.prompt.trim(),
    correctAnswer: (input.correctAnswer ?? '').trim(),
    commentary: (input.commentary ?? '').trim(),
    confidence,
    inRotation: input.inRotation !== false,
    createdAt: stamp,
    updatedAt: stamp
  }
  getDb()
    .prepare(
      `INSERT INTO practice_missed_questions (
        id, exam_id, resource_id, section_code, prompt, correct_answer, commentary,
        confidence, in_rotation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      q.id,
      q.examId,
      q.resourceId,
      q.sectionCode,
      q.prompt,
      q.correctAnswer,
      q.commentary,
      q.confidence,
      q.inRotation ? 1 : 0,
      q.createdAt,
      q.updatedAt
    )
  return q
}

const TEST_DATE_META_PREFIX = 'testDate:'

export function getProjectTestDate(projectId: string): string | null {
  const v = getMeta(`${TEST_DATE_META_PREFIX}${projectId}`)
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

export function setProjectTestDate(projectId: string, ymd: string | null): string | null {
  const key = `${TEST_DATE_META_PREFIX}${projectId}`
  if (!ymd || !ymd.trim()) {
    getDb().prepare('DELETE FROM meta WHERE key = ?').run(key)
    return null
  }
  const trimmed = ymd.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Test date must look like YYYY-MM-DD.')
  }
  setMeta(key, trimmed)
  return trimmed
}

export function updateMissedQuestionConfidence(id: string, confidence: number): MissedQuestion {
  const stamp = nowIso()
  const c = Math.min(5, Math.max(1, Math.round(confidence)))
  getDb()
    .prepare('UPDATE practice_missed_questions SET confidence = ?, updated_at = ? WHERE id = ?')
    .run(c, stamp, id)
  const row = getDb()
    .prepare('SELECT * FROM practice_missed_questions WHERE id = ?')
    .get(id) as Record<string, unknown>
  if (!row) throw new Error('Missed question not found')
  return mapMissedQuestion(row)
}

export function setMissedQuestionInRotation(id: string, inRotation: boolean): MissedQuestion {
  const stamp = nowIso()
  getDb()
    .prepare('UPDATE practice_missed_questions SET in_rotation = ?, updated_at = ? WHERE id = ?')
    .run(inRotation ? 1 : 0, stamp, id)
  const row = getDb()
    .prepare('SELECT * FROM practice_missed_questions WHERE id = ?')
    .get(id) as Record<string, unknown>
  if (!row) throw new Error('Missed question not found')
  return mapMissedQuestion(row)
}

export function deleteMissedQuestion(id: string): void {
  getDb().prepare('DELETE FROM practice_missed_questions WHERE id = ?').run(id)
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

export function exportBackup(): BackupPayload {
  const projects = listProjects(true)
  const studyAreas: Category[] = []
  const resources: Resource[] = []
  const sections: ResourceSection[] = []
  const history: StudyHistoryEntry[] = []
  const queue: QueueItem[] = []
  const practiceExams: PracticeExam[] = []
  const missedQuestions: MissedQuestion[] = []

  for (const p of projects) {
    studyAreas.push(...listCategories(p.id))
    const exams = listPracticeExams(p.id)
    practiceExams.push(...exams)
    for (const exam of exams) {
      missedQuestions.push(...listMissedQuestions(exam.id))
    }
    const resRows = getDb()
      .prepare('SELECT * FROM resources WHERE project_id = ?')
      .all(p.id) as Array<Record<string, unknown>>
    for (const row of resRows) {
      const resource = mapResource(row)
      resources.push(resource)
      sections.push(...listSections(resource.id))
      history.push(...listHistory(resource.id))
      if (resource.type === 'question_bank' || resource.type === 'anki') {
        missedQuestions.push(...listMissedQuestionsForResource(resource.id))
      }
    }
    queue.push(...listQueue(p.id, true))
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    appName: 'Study Hub',
    projects,
    studyAreas,
    resources,
    sections,
    history,
    queue,
    practiceExams,
    missedQuestions
  }
}

export function validateBackup(payload: unknown): { ok: true; data: BackupPayload } | { ok: false; message: string } {
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

export function restoreBackup(payload: BackupPayload, recoveryDir: string): string {
  const validated = validateBackup(payload)
  if (!validated.ok) throw new Error(validated.message)

  if (!existsSync(recoveryDir)) mkdirSync(recoveryDir, { recursive: true })
  const recoveryPath = join(recoveryDir, `pre-restore-${Date.now()}.sqlite`)
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, recoveryPath)
  }

  const database = getDb()
  const tx = database.transaction(() => {
    database.exec(`
      DELETE FROM queue_items;
      DELETE FROM study_history;
      DELETE FROM sections;
      DELETE FROM resource_study_areas;
      DELETE FROM resources;
      DELETE FROM study_areas;
      DELETE FROM practice_missed_questions;
      DELETE FROM practice_exams;
      DELETE FROM projects;
    `)

    const insertProject = database.prepare(
      'INSERT INTO projects (id, name, created_at, archived, preset) VALUES (?, ?, ?, ?, ?)'
    )
    for (const p of payload.projects) {
      const preset = p.preset === 'mcat' || /mcat/i.test(p.name) ? 'mcat' : 'custom'
      insertProject.run(p.id, p.name, p.createdAt, p.archived ? 1 : 0, preset)
    }

    const insertArea = database.prepare(
      'INSERT INTO study_areas (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)'
    )
    for (const a of payload.studyAreas) {
      insertArea.run(a.id, a.projectId, a.name, a.sortOrder)
    }

    const insertResource = database.prepare(
      `INSERT INTO resources (
        id, project_id, study_area_id, name, type, location_kind, location_value,
        config_json, stopping_point_note, next_action, notes, last_studied_at,
        confidence, archived, is_sample, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertLink = database.prepare(
      'INSERT OR IGNORE INTO resource_study_areas (resource_id, study_area_id) VALUES (?, ?)'
    )
    for (const r of payload.resources) {
      const areaIds =
        r.studyAreaIds && r.studyAreaIds.length
          ? r.studyAreaIds
          : r.studyAreaId
            ? [r.studyAreaId]
            : []
      insertResource.run(
        r.id,
        r.projectId,
        areaIds[0] ?? null,
        r.name,
        r.type,
        r.locationKind,
        r.locationValue,
        JSON.stringify(r.config),
        r.stoppingPointNote,
        r.nextAction,
        r.notes,
        r.lastStudiedAt,
        r.confidence,
        r.archived ? 1 : 0,
        r.isSample ? 1 : 0,
        r.createdAt,
        r.updatedAt
      )
      for (const areaId of areaIds) insertLink.run(r.id, areaId)
    }

    const insertSection = database.prepare(
      `INSERT INTO sections (id, resource_id, name, sort_order, total_units, completed_units, notes, study_area_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const s of payload.sections ?? []) {
      insertSection.run(
        s.id,
        s.resourceId,
        s.name,
        s.sortOrder,
        s.totalUnits,
        s.completedUnits,
        s.notes,
        s.studyAreaId ?? null
      )
    }

    const insertHistory = database.prepare(
      'INSERT INTO study_history (id, resource_id, recorded_at, summary, payload_json) VALUES (?, ?, ?, ?, ?)'
    )
    for (const h of payload.history ?? []) {
      insertHistory.run(h.id, h.resourceId, h.recordedAt, h.summary, JSON.stringify(h.payload))
    }

    const insertQueue = database.prepare(
      `INSERT INTO queue_items (id, project_id, resource_id, description, estimated_minutes, sort_order, completed, created_at, for_date, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const q of payload.queue ?? []) {
      insertQueue.run(
        q.id,
        q.projectId,
        q.resourceId,
        q.description,
        q.estimatedMinutes,
        q.sortOrder,
        q.completed ? 1 : 0,
        q.createdAt,
        q.forDate || localDateISO(0),
        q.completedAt ?? (q.completed ? q.forDate || null : null)
      )
    }

    const insertExam = database.prepare(
      `INSERT INTO practice_exams (
        id, project_id, name, taken_on, score_cp, score_cars, score_bb, score_ps,
        total, review_status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const e of payload.practiceExams ?? []) {
      insertExam.run(
        e.id,
        e.projectId,
        e.name,
        e.takenOn,
        e.scoreCp,
        e.scoreCars,
        e.scoreBb,
        e.scorePs,
        e.total,
        e.reviewStatus,
        e.notes ?? '',
        e.createdAt,
        e.updatedAt
      )
    }

    const insertMissed = database.prepare(
      `INSERT INTO practice_missed_questions (
        id, exam_id, resource_id, section_code, prompt, correct_answer, commentary,
        confidence, in_rotation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const q of payload.missedQuestions ?? []) {
      insertMissed.run(
        q.id,
        q.examId ?? null,
        q.resourceId ?? null,
        q.sectionCode,
        q.prompt,
        q.correctAnswer ?? '',
        q.commentary ?? '',
        Math.min(5, Math.max(1, q.confidence || 1)),
        q.inRotation === false ? 0 : 1,
        q.createdAt,
        q.updatedAt
      )
    }
  })

  tx()
  for (const p of listProjects(true)) {
    if (p.preset === 'mcat') ensureMcatCategories(p.id)
  }
  return recoveryPath
}

export function ensureDefaultProject(): Project {
  const existing = listProjects()
  if (existing.length) {
    const first = existing[0]
    if (first.preset === 'mcat') ensureMcatCategories(first.id)
    return first
  }
  return createProject('MCAT', 'mcat')
}
