import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { setSchemeRows, setBaseSemesters, setActiveScheme } from './schemes'
import { GRADING, GRADE_RULES, SEMESTERS, SCHEME_INFO } from './gradesData'
import { getGrade, getMaxMarks, getThreshold, calcSGPA, calcCGPA } from './gradesEngine'

const AKTU_SEMS = [{ sem: 1, label: 'Semester 1', totalCredits: 4, subjects: [{ code: 'X1', name: 'AKTU Subj', credits: 4, type: 'Theory' }] }]

const GGSIPU_GRADING = [
  { min: 90, max: 100, grade: 'O', points: 10, cls: 'grade-O' },
  { min: 75, max: 89, grade: 'A+', points: 9, cls: 'grade-Ap' },
  { min: 65, max: 74, grade: 'A', points: 8, cls: 'grade-A' },
  { min: 55, max: 64, grade: 'B+', points: 7, cls: 'grade-Bp' },
  { min: 50, max: 54, grade: 'B', points: 6, cls: 'grade-B' },
  { min: 45, max: 49, grade: 'C', points: 5, cls: 'grade-C' },
  { min: 40, max: 44, grade: 'P', points: 4, cls: 'grade-E' },
  { min: 0, max: 39, grade: 'F', points: 0, cls: 'grade-F' },
]
const GGSIPU_RULES = {
  maxPoints: 10, passMarks: 40, grace: null,
  marks: { theory: { internal: 25, external: 75 }, practical: { internal: 40, external: 60 } },
  thresholds: { '4': 65, '3': 60, default: 55 },
}
const GGSIPU_SEMS = [{
  sem: 1, label: 'Semester 1', totalCredits: 4,
  subjects: [{ code: 'CIC-209', name: 'Data Structures', credits: 4, type: 'Theory' }],
}]

const ROWS = [
  { university_code: 'AKTU', label: 'AKTU B.Tech', branches: null, grading: null, rules: {}, semesters: null },
  { university_code: 'GGSIPU', label: 'GGSIPU B.Tech CSE', branches: ['CSE'], grading: GGSIPU_GRADING, rules: GGSIPU_RULES, semesters: GGSIPU_SEMS },
]

describe('per-university scheme switching', () => {
  beforeEach(() => {
    setBaseSemesters(AKTU_SEMS)
    setSchemeRows(ROWS)
  })

  it('defaults to AKTU scale/rules/semesters', () => {
    setActiveScheme('AKTU', 'CSE')
    expect(GRADING.map((g) => g.grade)).toEqual(['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F'])
    expect(GRADE_RULES.grace).toEqual({ externalBelow: 21, maxGrace: 7, passTotal: 40 })
    expect(SEMESTERS[0].subjects[0].code).toBe('X1')
    expect(getMaxMarks({ type: 'Theory' })).toEqual({ internal: 30, external: 70 })
    expect(getThreshold(4)).toBe(70)
  })

  it('switches to GGSIPU scale/rules/semesters and grace disappears', () => {
    setActiveScheme('GGSIPU', 'CSE')
    expect(GRADING.map((g) => g.grade)).toEqual(['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'])
    expect(GRADE_RULES.grace).toBeNull()
    expect(SEMESTERS[0].subjects[0].code).toBe('CIC-209')
    expect(getMaxMarks({ type: 'Theory' })).toEqual({ internal: 25, external: 75 })
    expect(getThreshold(4)).toBe(65)
    expect(SCHEME_INFO.universityCode).toBe('GGSIPU')
    expect(SCHEME_INFO.missing).toBe(false)
  })

  it('92 marks -> O/10 under GGSIPU but A+/10 under AKTU (different letters, same top point)', () => {
    setActiveScheme('GGSIPU', 'CSE')
    const gG = getGrade({ internal: 23, external: 69 }, { type: 'Theory' }) // 92/100
    expect(gG.grade).toBe('O')
    expect(gG.points).toBe(10)

    setActiveScheme('AKTU', 'CSE')
    const gA = getGrade({ internal: 28, external: 64 }, { type: 'Theory' }) // 92/100
    expect(gA.grade).toBe('A+')
    expect(gA.points).toBe(10)
  })

  it('AKTU grace-pass (E#) does not exist under GGSIPU: low external is a hard fail', () => {
    setActiveScheme('AKTU', 'CSE')
    const graced = getGrade({ internal: 20, external: 18 }, { type: 'Theory' }) // 38/100, ext<21
    expect(graced.grade).toBe('E#')

    setActiveScheme('GGSIPU', 'CSE')
    const failed = getGrade({ internal: 15, external: 18 }, { type: 'Theory' }) // 33/100
    expect(failed.grade).toBe('F')
  })

  it('SGPA/CGPA use the active scheme credits + grade points', () => {
    setActiveScheme('GGSIPU', 'CSE')
    const marksData = [[{ internal: 23, external: 69 }]] // 92 -> O -> 10 pts, 4 credits
    expect(calcSGPA(0, marksData)).toBeCloseTo(10, 5)
    expect(calcCGPA(marksData)).toBeCloseTo(10, 5)
  })

  it('falls back to the default scale and flags missing when a university has no scheme row', () => {
    setActiveScheme('NOWHERE_U', 'CSE')
    expect(SCHEME_INFO.missing).toBe(true)
    expect(GRADING.map((g) => g.grade)).toEqual(['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F']) // DEFAULT_GRADING
  })

  it('flags approximate when the branch has no dedicated scheme for that university', () => {
    setActiveScheme('GGSIPU', 'CSE/AIML')
    expect(SCHEME_INFO.approximate).toBe(true)
    expect(SCHEME_INFO.label).toBe('GGSIPU B.Tech CSE')
  })
})
