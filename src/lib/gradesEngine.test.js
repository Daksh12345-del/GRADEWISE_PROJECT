import { describe, it, expect, beforeEach } from 'vitest'
import { SEMESTERS } from './gradesData'
import {
  getTotal,
  isFilled,
  getMaxMarks,
  getGrade,
  getGradeNoGrace,
  getEffectivePoints,
  getEffectiveCredits,
  getBackGrade,
  isBackEligible,
  calcSGPA,
  calcCGPA,
  getThreshold,
} from './gradesEngine'

// ── getTotal ──────────────────────────────────────────────────────────
describe('getTotal', () => {
  it('sums internal + external when entry is an object', () => {
    expect(getTotal({ internal: 25, external: 60 })).toBe(85)
  })

  it('treats a missing half as 0, not NaN', () => {
    expect(getTotal({ internal: 25, external: '' })).toBe(25)
  })

  it('returns null when both halves are empty', () => {
    expect(getTotal({ internal: '', external: '' })).toBeNull()
  })

  it('parses a legacy plain-number entry directly', () => {
    expect(getTotal('78')).toBe(78)
  })

  it('returns null for empty/undefined/null input', () => {
    expect(getTotal('')).toBeNull()
    expect(getTotal(null)).toBeNull()
    expect(getTotal(undefined)).toBeNull()
  })
})

// ── isFilled ──────────────────────────────────────────────────────────
describe('isFilled', () => {
  it('is true if either half of an object entry has a value', () => {
    expect(isFilled({ internal: '20', external: '' })).toBe(true)
    expect(isFilled({ internal: '', external: '' })).toBe(false)
  })

  it('handles plain-value entries', () => {
    expect(isFilled('50')).toBe(true)
    expect(isFilled('')).toBe(false)
  })
})

// ── getMaxMarks ───────────────────────────────────────────────────────
describe('getMaxMarks', () => {
  it('gives 30/70 split for a normal Theory subject', () => {
    expect(getMaxMarks({ type: 'Theory' })).toEqual({ internal: 30, external: 70 })
  })

  it('gives 50/50 split for Practical', () => {
    expect(getMaxMarks({ type: 'Practical' })).toEqual({ internal: 50, external: 50 })
  })

  it('gives 100/0 split for Audit', () => {
    expect(getMaxMarks({ type: 'Audit' })).toEqual({ internal: 100, external: 0 })
  })

  it('special-cases Project-II (BCS851) at 100/350', () => {
    expect(getMaxMarks({ internalOnly: true, code: 'BCS851' })).toEqual({ internal: 100, external: 350 })
  })
})

// ── getGrade — boundaries + grace marks ─────────────────────────────────
describe('getGrade', () => {
  it('maps marks to the correct letter grade at each boundary', () => {
    expect(getGrade(90, {}).grade).toBe('A+')
    expect(getGrade(89, {}).grade).toBe('A')
    expect(getGrade(70, {}).grade).toBe('B+')
    expect(getGrade(40, {}).grade).toBe('E')
    expect(getGrade(39, {}).grade).toBe('F')
  })

  it('returns null for out-of-range marks', () => {
    expect(getGrade(-1, {})).toBeNull()
    expect(getGrade(101, {})).toBeNull()
    expect(getGrade('', {})).toBeNull()
  })

  it('applies grace marks for Theory when external < 21 and grace lifts total to 40+', () => {
    // internal 20 + external 15 = 35 total; external < 21 so grace applies.
    // deficit = 40 - 35 = 5 (<=7), graced total = 40 -> Grace Pass (E#)
    const subj = { type: 'Theory' }
    const grade = getGrade({ internal: 20, external: 15 }, subj)
    expect(grade.grade).toBe('E#')
  })

  it('fails (F) when even the max 7 grace marks are not enough', () => {
    // internal 5 + external 5 = 10; deficit = 30, capped grace = 7 -> still F
    const subj = { type: 'Theory' }
    const grade = getGrade({ internal: 5, external: 5 }, subj)
    expect(grade.grade).toBe('F')
  })

  it('does NOT apply grace marks to Practical subjects', () => {
    // Same low total as a Theory case that would grace-pass, but type is Practical.
    const subj = { type: 'Practical' }
    const grade = getGrade({ internal: 20, external: 15 }, subj)
    expect(grade.grade).toBe('F') // 35 total -> plain F, no grace
  })
})

// ── getGradeNoGrace (used for back-paper results) ───────────────────────
describe('getGradeNoGrace', () => {
  it('never grants E# even for a near-miss total', () => {
    // A total that WOULD grace-pass under getGrade must plainly fail here.
    const grade = getGradeNoGrace(38)
    expect(grade.grade).toBe('F')
  })

  it('grades a passing back-paper attempt normally', () => {
    expect(getGradeNoGrace(75).grade).toBe('B+')
  })
})

// ── getEffectivePoints / getEffectiveCredits ─────────────────────────────
describe('getEffectivePoints', () => {
  it('F and E# both contribute 0 points', () => {
    expect(getEffectivePoints({ grade: 'F', points: 0 })).toBe(0)
    expect(getEffectivePoints({ grade: 'E#', points: 0 })).toBe(0)
  })

  it('a passing grade contributes its real points', () => {
    expect(getEffectivePoints({ grade: 'B+', points: 8 })).toBe(8)
  })
})

describe('getEffectiveCredits', () => {
  it('F/E# still carry full credits in the denominator (AKTU rule)', () => {
    expect(getEffectiveCredits({ credits: 4 })).toBe(4)
  })

  it('audit subjects contribute their (usually 0) credits as-is', () => {
    expect(getEffectiveCredits({ credits: 0, audit: true })).toBe(0)
  })
})

// ── Back-paper eligibility + grading ─────────────────────────────────────
describe('isBackEligible / getBackGrade', () => {
  const theorySubj = { type: 'Theory', credits: 4 }

  it('is eligible only when the original grade is F or E#', () => {
    expect(isBackEligible({ internal: 5, external: 5 }, theorySubj)).toBe(true) // F
    expect(isBackEligible({ internal: 28, external: 60 }, theorySubj)).toBe(false) // passing
  })

  it('back-paper uses the ORIGINAL internal mark + the new external mark, no grace', () => {
    const entry = { internal: 28, external: 5 } // original F
    const backGrade = getBackGrade(entry, theorySubj, 45) // re-attempt external = 45
    // combined = 28 (kept internal) + 45 (new external) = 73 -> B+, no grace applied
    expect(backGrade.grade).toBe('B+')
  })

  it('returns null for a blank/invalid back-paper value', () => {
    expect(getBackGrade({ internal: 28, external: 5 }, theorySubj, '')).toBeNull()
    expect(getBackGrade({ internal: 28, external: 5 }, theorySubj, 'abc')).toBeNull()
  })
})

// ── SGPA / CGPA — the actual formula, exercised end-to-end ──────────────
describe('calcSGPA / calcCGPA', () => {
  beforeEach(() => {
    // SEMESTERS is populated at runtime from Supabase in the real app
    // (see gradesData.js). For these tests we stub it in-place with a
    // tiny, fully-controlled curriculum so the SGPA/CGPA math can be
    // verified against hand-calculated expected values.
    SEMESTERS.length = 0
    SEMESTERS.push(
      {
        subjects: [
          { name: 'Maths', type: 'Theory', credits: 4 },
          { name: 'Physics', type: 'Theory', credits: 3 },
        ],
      },
      {
        subjects: [
          { name: 'DSA', type: 'Theory', credits: 4 },
          { name: 'Yoga', type: 'Audit', credits: 0, audit: true },
        ],
      }
    )
  })

  it('computes SGPA as the credit-weighted average of grade points', () => {
    // Sem 0: Maths 85 marks -> A (9 pts) * 4 credits = 36
    //        Physics 65 marks -> B (7 pts) * 3 credits = 21
    // SGPA = (36 + 21) / (4 + 3) = 57 / 7 = 8.142857...
    const marksData = { 0: { 0: 85, 1: 65 } }
    expect(calcSGPA(0, marksData)).toBeCloseTo(57 / 7, 5)
  })

  it('skips audit subjects entirely in the SGPA calculation', () => {
    // Sem 1: DSA 90 marks -> A+ (10 pts) * 4 credits = 40; Yoga is audit (ignored)
    const marksData = { 1: { 0: 90, 1: 100 } }
    expect(calcSGPA(1, marksData)).toBeCloseTo(10, 5)
  })

  it('only counts a semester toward CGPA once every non-audit subject is filled', () => {
    const marksData = { 0: { 0: 85 } } // Physics missing -> sem 0 incomplete
    expect(calcCGPA(marksData)).toBe(0)
  })

  it('averages across multiple completed semesters, weighted by credits', () => {
    const marksData = {
      0: { 0: 85, 1: 65 }, // 36 + 21 = 57 pts, 7 credits
      1: { 0: 90, 1: 100 }, // 40 pts, 4 credits (Yoga audit-skipped)
    }
    // CGPA = (57 + 40) / (7 + 4) = 97 / 11
    expect(calcCGPA(marksData)).toBeCloseTo(97 / 11, 5)
  })

  it('an F still counts its full credits in the CGPA denominator with 0 points', () => {
    const marksData = { 0: { 0: 20, 1: 65 } } // Maths fails (F), Physics passes
    // Maths: F -> 0 pts * 4 credits = 0; Physics: B -> 7 pts * 3 = 21
    // SGPA = (0 + 21) / (4 + 3) = 21/7 = 3
    expect(calcSGPA(0, marksData)).toBeCloseTo(3, 5)
  })
})

// ── getThreshold ──────────────────────────────────────────────────────
describe('getThreshold', () => {
  it('returns the correct AKTU minimum-marks threshold by credit weight', () => {
    expect(getThreshold(4)).toBe(70)
    expect(getThreshold(3)).toBe(65)
    expect(getThreshold(2)).toBe(60)
    expect(getThreshold(0)).toBe(60)
  })
})
