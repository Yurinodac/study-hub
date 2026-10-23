/** Shared MCAT study categories (not the four official exam sections). */
export const MCAT_CATEGORY_NAMES = [
  'Biology',
  'Biochemistry',
  'General Chemistry',
  'Organic Chemistry',
  'Physics',
  'Psychology',
  'Sociology',
  'CARS'
] as const

export type McatCategoryName = (typeof MCAT_CATEGORY_NAMES)[number]

/** Official AAMC exam sections — reference only; not used to tag resources. */
export const MCAT_EXAM_SECTIONS = [
  {
    code: 'C/P',
    name: 'Chemical and Physical Foundations of Biological Systems',
    questions: 59,
    minutes: 95
  },
  {
    code: 'CARS',
    name: 'Critical Analysis and Reasoning Skills',
    questions: 53,
    minutes: 90
  },
  {
    code: 'B/B',
    name: 'Biological and Biochemical Foundations of Living Systems',
    questions: 59,
    minutes: 95
  },
  {
    code: 'P/S',
    name: 'Psychological, Social, and Biological Foundations of Behavior',
    questions: 59,
    minutes: 95
  }
] as const

export const PRACTICE_SCORE_MIN = 118
export const PRACTICE_SCORE_MAX = 132

export type PracticeSectionScores = {
  cp: number
  cars: number
  bb: number
  ps: number
}

/** Sum of four section scores (each 118–132). */
export function practiceExamTotal(scores: PracticeSectionScores): number {
  return scores.cp + scores.cars + scores.bb + scores.ps
}

export function clampPracticeScore(value: number): number {
  if (Number.isNaN(value)) return PRACTICE_SCORE_MIN
  return Math.min(PRACTICE_SCORE_MAX, Math.max(PRACTICE_SCORE_MIN, Math.round(value)))
}

/** Case-insensitive match against the MCAT category preset names. */
export function matchMcatCategoryName(name: string): McatCategoryName | null {
  const n = name.trim().toLowerCase()
  for (const c of MCAT_CATEGORY_NAMES) {
    if (c.toLowerCase() === n) return c
  }
  // Common aliases from older study-area names
  if (n === 'bio' || n === 'sample · biology') return 'Biology'
  if (n === 'biochem' || n === 'biochemistry') return 'Biochemistry'
  if (n === 'gen chem' || n === 'general chem' || n === 'gchem') return 'General Chemistry'
  if (n === 'orgo' || n === 'organic chem' || n === 'ochem') return 'Organic Chemistry'
  if (n === 'psych' || n === 'sample · psychology') return 'Psychology'
  if (n === 'soc' || n === 'sociology') return 'Sociology'
  if (n === 'cars') return 'CARS'
  if (n === 'physics') return 'Physics'
  return null
}
