// ============================================================
// AKTU Grades Calculation Engine
// Ported from the original vanilla-JS app's verified logic
// (grace marks, SGPA/CGPA formula match real AKTU result PDFs).
//
// Fixed vs original:
//  - Removed a hardcoded "si===4 && ji===7" special case that
//    forced one specific student's back-paper lab result onto
//    every user. Replaced with a GENERIC rule: back-paper marks
//    can now be entered for ANY non-audit subject (not just
//    Theory/Elective) — if the original grade was F or E#,
//    entering a back mark recalculates that subject properly.
// ============================================================

import { GRADING, GRADE_EH, SEMESTERS } from './gradesData';

// ── Marks helpers ────────────────────────────────────────────
// entry shape: { internal: '', external: '' } (or legacy plain number/string = total)

export function getTotal(entry) {
  if (entry === null || entry === undefined || entry === '') return null;
  if (typeof entry === 'object') {
    const i = parseFloat(entry.internal);
    const e = parseFloat(entry.external);
    if (isNaN(i) && isNaN(e)) return null;
    return (isNaN(i) ? 0 : i) + (isNaN(e) ? 0 : e);
  }
  const m = parseFloat(entry);
  return isNaN(m) ? null : m;
}

export function isFilled(entry) {
  if (entry === null || entry === undefined || entry === '') return false;
  if (typeof entry === 'object') return entry.internal !== '' || entry.external !== '';
  return entry !== '';
}

// Max marks per subject type (used for grading & for normalizing back marks)
export function getMaxMarks(subj) {
  if (subj.internalOnly) {
    if (subj.code === 'BCS851') return { internal: 100, external: 350 }; // Project-II
    if (subj.code === 'BCS753') return { internal: 150, external: 0 };   // Project-I
    return { internal: 100, external: 0 };
  }
  if (subj.type === 'Practical') return { internal: 50, external: 50 };
  if (subj.type === 'Audit') return { internal: 100, external: 0 };
  return { internal: 30, external: 70 }; // Theory, Elective
}

// ── GRACE MARKS LOGIC (AKTU rules, Theory/Elective only) ───────────────────
// If external < 21, up to 7 grace marks can be added to external.
// If graced total >= 40 → E# (Grace Pass, 0 pts, full credits in denominator)
// else → F.
export function getGrade(marks, subj) {
  let external_val = null;
  let m;

  if (typeof marks === 'object' && marks !== null) {
    const t = getTotal(marks);
    if (t === null) return null;
    external_val = parseFloat(marks.external);
    m = t;
  } else {
    if (marks === '' || marks === null || marks === undefined) return null;
    m = parseFloat(marks);
  }
  if (isNaN(m) || m < 0 || m > 100) return null;

  if (subj && (subj.type === 'Theory' || subj.type === 'Elective')
      && external_val !== null && !isNaN(external_val) && external_val < 21) {
    const deficit = 40 - m;
    if (deficit <= 0) return GRADE_EH;
    const grace = Math.min(deficit, 7);
    const gracedTotal = m + grace;
    if (gracedTotal >= 40) return GRADE_EH;
    return GRADING[GRADING.length - 1]; // F
  }

  return GRADING.find(g => m >= g.min && m <= g.max) || GRADING[GRADING.length - 1];
}

// Grade lookup with NO grace — used for back paper results (fresh attempt)
export function getGradeNoGrace(marksOrPct) {
  let m;
  if (typeof marksOrPct === 'object' && marksOrPct !== null) {
    const t = getTotal(marksOrPct);
    if (t === null) return null;
    m = t;
  } else {
    if (marksOrPct === '' || marksOrPct === null || marksOrPct === undefined) return null;
    m = parseFloat(marksOrPct);
  }
  if (isNaN(m) || m < 0) return null;
  return GRADING.find(g => m >= g.min && m <= g.max) || GRADING[GRADING.length - 1];
}

export function getEffectivePoints(grade) {
  if (!grade) return 0;
  if (grade.grade === 'F' || grade.grade === 'E#') return 0;
  return grade.points;
}

export function getEffectiveCredits(subj) {
  if (!subj || subj.audit || subj.credits === 0) return subj ? subj.credits : 0;
  return subj.credits; // both E# and F carry full credits, 0 grade points
}

// Grade for internalOnly subjects (Internship, Mini Project, Project, etc.)
export function getGradeForInternalOnly(entry, subj) {
  if (!entry || typeof entry !== 'object') return null;
  if (subj && subj.code === 'BCS851') {
    const intV = parseFloat(entry.internal);
    const extV = parseFloat(entry.external);
    if (isNaN(intV) && isNaN(extV)) return null;
    const total = (isNaN(intV) ? 0 : intV) + (isNaN(extV) ? 0 : extV);
    const pct = (total / 450) * 100;
    return GRADING.find(g => pct >= g.min && pct <= g.max) || GRADING[GRADING.length - 1];
  }
  if (subj && subj.code === 'BCS753') {
    const val = parseFloat(entry.internal);
    if (isNaN(val) || val < 0 || val > 150) return null;
    const pct = (val / 150) * 100;
    return GRADING.find(g => pct >= g.min && pct <= g.max) || GRADING[GRADING.length - 1];
  }
  const val = parseFloat(entry.internal);
  if (isNaN(val) || val < 0 || val > 100) return null;
  return GRADING.find(g => val >= g.min && val <= g.max) || GRADING[GRADING.length - 1];
}

function gradeOf(entry, subj) {
  return subj.internalOnly ? getGradeForInternalOnly(entry, subj) : getGrade(entry, subj);
}

// ── GENERIC BACK-PAPER RESULT ───────────────────────────────────────────────
// backValue = a single re-attempt mark the student enters for ANY non-audit
// subject (Theory, Elective, Practical, or internalOnly), entered ONLY when
// the original grade was F or E#.
//
// - Theory/Elective: backValue is the new external mark; combined with the
//   existing internal mark (matches how AKTU back-paper actually works —
//   only the external/end-semester exam is re-attempted).
// - Practical/internalOnly: backValue is treated as the new total mark for
//   that subject, normalized against its max marks to get a grade.
// No grace marks apply to any back-paper attempt (fresh attempt rule).
export function getBackGrade(entry, subj, backValue) {
  const backNum = parseFloat(backValue);
  if (backValue === '' || backValue === undefined || isNaN(backNum)) return null;

  if (subj.type === 'Theory' || subj.type === 'Elective') {
    const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
    return getGradeNoGrace({
      internal: isNaN(internal) ? '' : String(internal),
      external: String(backNum),
    });
  }

  // Practical / internalOnly: normalize backNum (treated as new total) against subject max
  const max = getMaxMarks(subj);
  const maxTotal = (max.internal || 0) + (max.external || 0);
  if (maxTotal <= 0) return null;
  const pct = (backNum / maxTotal) * 100;
  return getGradeNoGrace(pct);
}

// Whether a subject is eligible to even show a back-paper input
// (original grade must be Fail or Grace-Pass)
export function isBackEligible(entry, subj) {
  if (!subj || subj.audit || subj.credits === 0) return false;
  const orig = gradeOf(entry, subj);
  return !!orig && (orig.grade === 'F' || orig.grade === 'E#');
}

// ── SGPA / CGPA ──────────────────────────────────────────────────────────

export function isSemComplete(si, marksData) {
  const sem = SEMESTERS[si];
  return sem.subjects.every((subj, ji) => {
    if (subj.audit || subj.credits === 0) return true;
    return isFilled(marksData[si]?.[ji]);
  });
}

export function calcSGPA(si, marksData) {
  const sem = SEMESTERS[si];
  let totalPoints = 0, totalCredits = 0;
  sem.subjects.forEach((subj, ji) => {
    if (subj.audit || subj.credits === 0) return;
    const entry = marksData[si]?.[ji];
    const grade = gradeOf(entry, subj);
    if (grade === null) return;
    const cr = getEffectiveCredits(subj);
    totalPoints += getEffectivePoints(grade) * cr;
    totalCredits += cr;
  });
  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}

// Calculates SGPA using back-paper marks where available — generic across
// every non-audit subject type (Theory/Elective/Practical/internalOnly).
export function calcSGPAWithBack(si, marksData, backData) {
  const sem = SEMESTERS[si];
  let totalPoints = 0, totalCredits = 0, hasAnyBack = false;

  sem.subjects.forEach((subj, ji) => {
    if (subj.audit || subj.credits === 0) return;
    const entry = marksData[si]?.[ji];
    const backVal = backData[si]?.[ji];
    const origGrade = gradeOf(entry, subj);

    let gradeToUse = origGrade;
    let creditsToUse = getEffectiveCredits(subj);

    if (isBackEligible(entry, subj) && backVal !== undefined && backVal !== '') {
      const backGrade = getBackGrade(entry, subj, backVal);
      if (backGrade !== null) {
        hasAnyBack = true;
        gradeToUse = backGrade; // full credits regardless of pass/fail in back attempt
      }
    }

    if (gradeToUse !== null) {
      totalPoints += getEffectivePoints(gradeToUse) * creditsToUse;
      totalCredits += creditsToUse;
    }
  });

  return { sgpa: totalCredits > 0 ? totalPoints / totalCredits : 0, hasAnyBack };
}

export function semHasBackData(si, marksData, backData) {
  const sem = SEMESTERS[si];
  return sem.subjects.some((subj, ji) => {
    if (subj.audit || subj.credits === 0) return false;
    const b = backData[si]?.[ji];
    if (b === '' || b === undefined || isNaN(parseFloat(b))) return false;
    const entry = marksData[si]?.[ji];
    return isBackEligible(entry, subj);
  });
}

export function calcCGPAWithBack(marksData, backData) {
  let totalPoints = 0, totalCredits = 0, hasAnyBack = false;
  SEMESTERS.forEach((sem, si) => {
    if (!isSemComplete(si, marksData)) return;
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit || subj.credits === 0) return;
      const entry = marksData[si]?.[ji];
      const backVal = backData[si]?.[ji];
      let gradeToUse = gradeOf(entry, subj);
      const creditsToUse = getEffectiveCredits(subj);

      if (isBackEligible(entry, subj) && backVal !== undefined && backVal !== '') {
        const backGrade = getBackGrade(entry, subj, backVal);
        if (backGrade !== null) {
          hasAnyBack = true;
          gradeToUse = backGrade;
        }
      }

      if (gradeToUse !== null) {
        totalPoints += getEffectivePoints(gradeToUse) * creditsToUse;
        totalCredits += creditsToUse;
      }
    });
  });
  return { cgpa: totalCredits > 0 ? totalPoints / totalCredits : 0, hasAnyBack };
}

export function calcAllSGPAs(marksData) {
  return SEMESTERS.map((_, si) => calcSGPA(si, marksData));
}

// Real (non-averaged) total credits for one semester — sums every
// non-audit, non-zero-credit subject in that semester. Used by the
// future-CGPA what-if simulator so remaining semesters use their actual
// credit load instead of an averaged estimate.
export function getSemCredits(si) {
  const sem = SEMESTERS[si];
  if (!sem) return 0;
  return sem.subjects.reduce((sum, subj) => {
    if (subj.audit || subj.credits === 0) return sum;
    return sum + getEffectiveCredits(subj);
  }, 0);
}


export function calcCGPA(marksData) {
  // AKTU formula: CGPA = Σ(grade_points × credits) / Σ(credits), F & E# = 0 pts, full credits.
  let totalPoints = 0, totalCredits = 0;
  SEMESTERS.forEach((sem, si) => {
    if (!isSemComplete(si, marksData)) return;
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit || subj.credits === 0) return;
      const entry = marksData[si]?.[ji];
      const grade = gradeOf(entry, subj);
      if (grade === null) return;
      const cr = getEffectiveCredits(subj);
      totalPoints += getEffectivePoints(grade) * cr;
      totalCredits += cr;
    });
  });
  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}
