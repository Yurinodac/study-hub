import { useEffect, useMemo, useState } from 'react'
import type {
  ExamSectionCode,
  MissedQuestion,
  PracticeExam,
  PracticeReviewStatus,
  Project
} from '../../shared/types'
import { EXAM_SECTION_CODES, PRACTICE_REVIEW_LABELS } from '../../shared/types'
import {
  MCAT_EXAM_SECTIONS,
  PRACTICE_SCORE_MAX,
  PRACTICE_SCORE_MIN,
  practiceExamTotal
} from '../../shared/mcat'

export default function SettingsPanel({
  projectId,
  projects,
  onProjectsChanged,
  onChanged,
  showStatus,
  onSelectProject
}: {
  projectId: string
  projects: Project[]
  onProjectsChanged: () => Promise<void> | void
  onChanged: () => void
  showStatus: (message: string, tone?: 'ok' | 'warn') => void
  onSelectProject: (id: string) => void
}) {
  const [hasSample, setHasSample] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectPreset, setNewProjectPreset] = useState<'mcat' | 'custom'>('custom')
  const [renameValue, setRenameValue] = useState('')
  const [paths, setPaths] = useState<{ userData: string; dbPath: string } | null>(null)
  const [exams, setExams] = useState<PracticeExam[]>([])
  const [examName, setExamName] = useState('')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [scoreCp, setScoreCp] = useState('125')
  const [scoreCars, setScoreCars] = useState('125')
  const [scoreBb, setScoreBb] = useState('125')
  const [scorePs, setScorePs] = useState('125')
  const [reviewStatus, setReviewStatus] = useState<PracticeReviewStatus>('not_reviewed')
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null)
  const [missedByExam, setMissedByExam] = useState<Record<string, MissedQuestion[]>>({})
  const [rotation, setRotation] = useState<MissedQuestion[]>([])
  const [flashIndex, setFlashIndex] = useState(0)
  const [flashRevealed, setFlashRevealed] = useState(false)
  const [celeb, setCeleb] = useState<{ hasCustomImage: boolean; imageUrl: string | null }>({
    hasCustomImage: false,
    imageUrl: null
  })
  const [testDate, setTestDate] = useState<string>('')
  const [testDateDraft, setTestDateDraft] = useState('')

  // Missed-question draft
  const [mqSection, setMqSection] = useState<ExamSectionCode>('C/P')
  const [mqPrompt, setMqPrompt] = useState('')
  const [mqAnswer, setMqAnswer] = useState('')
  const [mqNotes, setMqNotes] = useState('')

  const current = projects.find((p) => p.id === projectId)
  const previewTotal = useMemo(() => {
    return practiceExamTotal({
      cp: Number(scoreCp) || PRACTICE_SCORE_MIN,
      cars: Number(scoreCars) || PRACTICE_SCORE_MIN,
      bb: Number(scoreBb) || PRACTICE_SCORE_MIN,
      ps: Number(scorePs) || PRACTICE_SCORE_MIN
    })
  }, [scoreCp, scoreCars, scoreBb, scorePs])

  const reloadExams = async () => {
    const list = await window.studyHub.listPracticeExams(projectId)
    setExams(list)
    setRotation(await window.studyHub.listMissedQuestionsInRotation(projectId))
  }

  const loadMissed = async (examId: string) => {
    const list = await window.studyHub.listMissedQuestions(examId)
    setMissedByExam((prev) => ({ ...prev, [examId]: list }))
  }

  useEffect(() => {
    void (async () => {
      setHasSample(await window.studyHub.sampleStatus(projectId))
      setPaths(await window.studyHub.getPaths())
      setRenameValue(current?.name ?? '')
      setCeleb(await window.studyHub.getCelebration())
      const td = (await window.studyHub.getProjectTestDate(projectId)) ?? ''
      setTestDate(td)
      setTestDateDraft(td)
      await reloadExams()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projects])

  const flashCard = rotation[flashIndex] ?? null

  return (
    <div>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Backup & restore</h2>
            <p>Your progress is saved automatically on this computer. Export a backup before big changes.</p>
          </div>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const result = await window.studyHub.exportBackup()
              if (result.canceled) return
              if (result.ok) showStatus(`Backup saved to ${result.path}`)
              else showStatus(result.message || 'Backup failed.', 'warn')
            }}
          >
            Export backup
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const result = await window.studyHub.restoreBackup()
              if (result.canceled) return
              if (result.ok) {
                showStatus(`Data restored. Recovery copy: ${result.recoveryPath}`)
                onChanged()
                await onProjectsChanged()
              } else {
                showStatus(result.message || 'Restore failed.', 'warn')
              }
            }}
          >
            Restore backup
          </button>
        </div>
        {paths && (
          <p className="meta" style={{ marginTop: '1rem' }}>
            Data folder: {paths.userData}
            <br />
            Database file: {paths.dbPath}
          </p>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Completion celebration</h2>
            <p>
              When you mark a Today queue task complete, Study Hub shows a short celebration. Optionally add your own
              picture (stored only on this PC).
            </p>
          </div>
        </div>
        {celeb.imageUrl ? (
          <img className="celebration-image preview" src={celeb.imageUrl} alt="Current celebration picture" />
        ) : (
          <p className="meta">No custom picture yet — celebrations show a simple default graphic.</p>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const next = await window.studyHub.pickCelebrationImage()
              setCeleb(next)
              showStatus(next.hasCustomImage ? 'Celebration picture saved.' : 'No picture chosen.')
            }}
          >
            Choose celebration picture
          </button>
          {celeb.hasCustomImage && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                setCeleb(await window.studyHub.clearCelebrationImage())
                showStatus('Celebration picture cleared.')
              }}
            >
              Remove picture
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Official MCAT exam sections</h2>
            <p>
              Reference only — not used to tag resources. Everyday organization uses the eight study categories
              (Biology, CARS, and so on).
            </p>
          </div>
        </div>
        <ul className="history-list">
          {MCAT_EXAM_SECTIONS.map((s) => (
            <li key={s.code}>
              <strong>
                {s.code}: {s.name}
              </strong>
              <p className="meta">
                {s.questions} questions · {s.minutes} minutes
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Practice exams</h2>
            <p>
              Score log (118–132 per section) plus missed questions and a simple flashcard review. Confidence marks are
              for review priority — not a mastery score.
            </p>
          </div>
        </div>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!examName.trim()) return
            await window.studyHub.upsertPracticeExam({
              projectId,
              name: examName.trim(),
              takenOn: examDate,
              scoreCp: Number(scoreCp),
              scoreCars: Number(scoreCars),
              scoreBb: Number(scoreBb),
              scorePs: Number(scorePs),
              reviewStatus
            })
            setExamName('')
            setReviewStatus('not_reviewed')
            showStatus('Practice exam saved.')
            await reloadExams()
            onChanged()
          }}
        >
          <label>
            Exam name
            <input
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="e.g. AAMC FL 1"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Date taken
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
          </label>
          <div className="filters">
            <label className="field-inline">
              <span>C/P</span>
              <input
                type="number"
                min={PRACTICE_SCORE_MIN}
                max={PRACTICE_SCORE_MAX}
                value={scoreCp}
                onChange={(e) => setScoreCp(e.target.value)}
              />
            </label>
            <label className="field-inline">
              <span>CARS</span>
              <input
                type="number"
                min={PRACTICE_SCORE_MIN}
                max={PRACTICE_SCORE_MAX}
                value={scoreCars}
                onChange={(e) => setScoreCars(e.target.value)}
              />
            </label>
            <label className="field-inline">
              <span>B/B</span>
              <input
                type="number"
                min={PRACTICE_SCORE_MIN}
                max={PRACTICE_SCORE_MAX}
                value={scoreBb}
                onChange={(e) => setScoreBb(e.target.value)}
              />
            </label>
            <label className="field-inline">
              <span>P/S</span>
              <input
                type="number"
                min={PRACTICE_SCORE_MIN}
                max={PRACTICE_SCORE_MAX}
                value={scorePs}
                onChange={(e) => setScorePs(e.target.value)}
              />
            </label>
          </div>
          <p className="meta">
            Calculated total: <strong>{previewTotal}</strong>
          </p>
          <label>
            Review status
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as PracticeReviewStatus)}
            >
              {(Object.keys(PRACTICE_REVIEW_LABELS) as PracticeReviewStatus[]).map((k) => (
                <option key={k} value={k}>
                  {PRACTICE_REVIEW_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Save practice exam
          </button>
        </form>

        {exams.length === 0 ? (
          <p className="meta" style={{ marginTop: '1rem' }}>
            No practice exams logged yet.
          </p>
        ) : (
          <ul className="history-list" style={{ marginTop: '1rem' }}>
            {exams.map((exam) => {
              const open = expandedExamId === exam.id
              const missed = missedByExam[exam.id] ?? []
              return (
                <li key={exam.id}>
                  <strong>{exam.name}</strong>
                  <p className="meta">
                    {exam.takenOn} · Total {exam.total} · C/P {exam.scoreCp} · CARS {exam.scoreCars} · B/B{' '}
                    {exam.scoreBb} · P/S {exam.scorePs}
                  </p>
                  <p className="meta">{PRACTICE_REVIEW_LABELS[exam.reviewStatus]}</p>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={async () => {
                        if (open) {
                          setExpandedExamId(null)
                          return
                        }
                        setExpandedExamId(exam.id)
                        await loadMissed(exam.id)
                      }}
                    >
                      {open ? 'Hide missed questions' : 'Missed questions'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={async () => {
                        if (!window.confirm(`Delete practice exam “${exam.name}”?`)) return
                        await window.studyHub.deletePracticeExam(exam.id)
                        showStatus('Practice exam deleted.')
                        await reloadExams()
                        onChanged()
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  {open && (
                    <div className="missed-block">
                      <h3>Log a missed question</h3>
                      <form
                        className="form-grid"
                        onSubmit={async (e) => {
                          e.preventDefault()
                          if (!mqPrompt.trim()) return
                          await window.studyHub.upsertMissedQuestion({
                            examId: exam.id,
                            sectionCode: mqSection,
                            prompt: mqPrompt.trim(),
                            correctAnswer: mqAnswer.trim(),
                            commentary: mqNotes.trim(),
                            confidence: 2,
                            inRotation: true
                          })
                          setMqPrompt('')
                          setMqAnswer('')
                          setMqNotes('')
                          showStatus('Missed question saved.')
                          await loadMissed(exam.id)
                          setRotation(await window.studyHub.listMissedQuestionsInRotation(projectId))
                          onChanged()
                        }}
                      >
                        <label>
                          Exam section
                          <select
                            value={mqSection}
                            onChange={(e) => setMqSection(e.target.value as ExamSectionCode)}
                          >
                            {EXAM_SECTION_CODES.map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Question text or ID
                          <input
                            value={mqPrompt}
                            onChange={(e) => setMqPrompt(e.target.value)}
                            required
                            autoComplete="off"
                            placeholder="Q14 or short prompt"
                          />
                        </label>
                        <label>
                          Correct answer
                          <input
                            value={mqAnswer}
                            onChange={(e) => setMqAnswer(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          Commentary / notes
                          <textarea value={mqNotes} onChange={(e) => setMqNotes(e.target.value)} rows={2} />
                        </label>
                        <button type="submit" className="btn btn-primary">
                          Add missed question
                        </button>
                      </form>

                      {missed.length === 0 ? (
                        <p className="meta">No missed questions for this exam yet.</p>
                      ) : (
                        <ul className="history-list">
                          {missed.map((q) => (
                            <li key={q.id}>
                              <strong>
                                {q.sectionCode}: {q.prompt}
                              </strong>
                              <p className="meta">
                                Answer: {q.correctAnswer || '—'} · Confidence {q.confidence}/5
                                {q.inRotation ? '' : ' · removed from rotation'}
                              </p>
                              {q.commentary ? <p className="meta">{q.commentary}</p> : null}
                              <div className="btn-row">
                                {q.inRotation ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={async () => {
                                      await window.studyHub.setMissedQuestionInRotation(q.id, false)
                                      await loadMissed(exam.id)
                                      setRotation(
                                        await window.studyHub.listMissedQuestionsInRotation(projectId)
                                      )
                                      showStatus('Removed from flashcard rotation.')
                                    }}
                                  >
                                    Remove from flashcards
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={async () => {
                                      await window.studyHub.setMissedQuestionInRotation(q.id, true)
                                      await loadMissed(exam.id)
                                      setRotation(
                                        await window.studyHub.listMissedQuestionsInRotation(projectId)
                                      )
                                      showStatus('Added back to flashcard rotation.')
                                    }}
                                  >
                                    Add to flashcards
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={async () => {
                                    if (!window.confirm('Delete this missed question?')) return
                                    await window.studyHub.deleteMissedQuestion(q.id)
                                    await loadMissed(exam.id)
                                    setRotation(
                                      await window.studyHub.listMissedQuestionsInRotation(projectId)
                                    )
                                    showStatus('Missed question deleted.')
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Missed questions review</h2>
            <p>Flashcard-style review for questions still in rotation. Mark confidence, or remove from rotation.</p>
          </div>
        </div>
        {!flashCard ? (
          <p className="meta">
            No missed questions in rotation yet. Add some under a practice exam or on a question bank / Anki resource’s
            Missed Q tab.
          </p>
        ) : (
          <div className="flashcard">
            <p className="meta">
              {flashIndex + 1} of {rotation.length} · {flashCard.sectionCode}
            </p>
            <p className="queue-desc">{flashCard.prompt}</p>
            {flashRevealed ? (
              <>
                <p>
                  <strong>Answer:</strong> {flashCard.correctAnswer || '—'}
                </p>
                {flashCard.commentary ? <p className="meta">{flashCard.commentary}</p> : null}
                <p className="field-label">Confidence (1 shaky → 5 solid)</p>
                <div className="btn-row">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`btn ${flashCard.confidence === n ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={async () => {
                        await window.studyHub.setMissedQuestionConfidence(flashCard.id, n)
                        setRotation(await window.studyHub.listMissedQuestionsInRotation(projectId))
                        showStatus(`Confidence set to ${n}.`)
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setFlashRevealed(true)}>
                Show answer
              </button>
            )}
            <div className="btn-row" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={flashIndex <= 0}
                onClick={() => {
                  setFlashIndex((i) => Math.max(0, i - 1))
                  setFlashRevealed(false)
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={flashIndex >= rotation.length - 1}
                onClick={() => {
                  setFlashIndex((i) => Math.min(rotation.length - 1, i + 1))
                  setFlashRevealed(false)
                }}
              >
                Next
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await window.studyHub.setMissedQuestionInRotation(flashCard.id, false)
                  const next = await window.studyHub.listMissedQuestionsInRotation(projectId)
                  setRotation(next)
                  setFlashIndex((i) => Math.min(i, Math.max(0, next.length - 1)))
                  setFlashRevealed(false)
                  showStatus('Removed from flashcard rotation.')
                }}
              >
                Remove from flashcards
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Study projects</h2>
            <p>
              Create an <strong>MCAT</strong> project to get the eight shared study categories, or a custom project with
              your own category list.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Test date (optional — countdown lives on Today)
            <input
              type="date"
              value={testDateDraft}
              onChange={(e) => setTestDateDraft(e.target.value)}
            />
          </label>
          <p className="meta" style={{ margin: 0 }}>
            {testDate ? `Saved: ${testDate}. Primary countdown is on the Today page.` : 'Not set yet.'}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                const saved = await window.studyHub.setProjectTestDate(
                  projectId,
                  testDateDraft.trim() || null
                )
                setTestDate(saved ?? '')
                setTestDateDraft(saved ?? '')
                showStatus(saved ? `Test date saved: ${saved}` : 'Test date cleared.')
              }}
            >
              Save test date
            </button>
          </div>
          <label>
            Rename current project
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </label>
          <p className="meta" style={{ margin: 0 }}>
            Current preset: {current?.preset === 'mcat' ? 'MCAT (shared categories)' : 'Custom categories'}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                await window.studyHub.renameProject(projectId, renameValue)
                showStatus('Project renamed.')
                await onProjectsChanged()
              }}
            >
              Save project name
            </button>
            {current?.preset !== 'mcat' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await window.studyHub.ensureMcatCategories(projectId)
                  showStatus('MCAT study categories added to this project.')
                  await onProjectsChanged()
                  onChanged()
                }}
              >
                Add MCAT categories
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const name = current?.name ?? 'this project'
                const ok = window.confirm(
                  `Remove project “${name}” from your list?\n\nThis archives the project (soft delete). Export a backup first if you might need the data.`
                )
                if (!ok) return
                if (projects.length <= 1) {
                  showStatus('Create another project before removing the last one.', 'warn')
                  return
                }
                const remaining = await window.studyHub.archiveProject(projectId)
                const next = remaining[0]
                if (next) onSelectProject(next.id)
                showStatus(`Archived “${name}”.`)
                await onProjectsChanged()
              }}
            >
              Remove current project
            </button>
          </div>
          <label>
            New project name
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. MCAT or Spring semester"
              autoComplete="off"
            />
          </label>
          <label>
            Project type
            <select
              value={newProjectPreset}
              onChange={(e) => setNewProjectPreset(e.target.value as 'mcat' | 'custom')}
            >
              <option value="mcat">MCAT (seed 8 study categories)</option>
              <option value="custom">Custom (your own categories)</option>
            </select>
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!newProjectName.trim()) return
                const created = await window.studyHub.createProject(
                  newProjectName.trim(),
                  newProjectPreset
                )
                setNewProjectName('')
                showStatus(
                  newProjectPreset === 'mcat'
                    ? 'MCAT project created with shared categories.'
                    : 'Project created.'
                )
                onSelectProject(created.id)
                await onProjectsChanged()
              }}
            >
              Create project
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Sample data</h2>
            <p>
              Optional examples (textbook, video, Anki, question bank). Clearly labeled SAMPLE and separate from your
              real records.
            </p>
          </div>
        </div>
        <div className="btn-row">
          {!hasSample ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                await window.studyHub.loadSample(projectId)
                setHasSample(true)
                showStatus('Sample data added. Look for SAMPLE labels.')
                onChanged()
              }}
            >
              Add sample data
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const n = await window.studyHub.removeSample(projectId)
                setHasSample(false)
                showStatus(`Removed ${n} sample resource${n === 1 ? '' : 's'}.`)
                onChanged()
              }}
            >
              Remove all sample data
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
