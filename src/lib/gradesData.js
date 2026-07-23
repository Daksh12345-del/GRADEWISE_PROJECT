// ============================================================
// AKTU Grading System — Subject & Semester Data
// Ported from original vanilla-JS app, unchanged (this is real
// curriculum data, not something to "improve").
// ============================================================

export const GRADING = [
  { min: 90, max: 100, grade: 'A+', points: 10, cls: 'grade-O' },
  { min: 80, max: 89, grade: 'A', points: 9, cls: 'grade-Ap' },
  { min: 70, max: 79, grade: 'B+', points: 8, cls: 'grade-A' },
  { min: 60, max: 69, grade: 'B', points: 7, cls: 'grade-Bp' },
  { min: 50, max: 59, grade: 'C', points: 6, cls: 'grade-B' },
  { min: 45, max: 49, grade: 'D', points: 5, cls: 'grade-C' },
  { min: 40, max: 44, grade: 'E', points: 4, cls: 'grade-E' },
  { min: 0, max: 39, grade: 'F', points: 0, cls: 'grade-F' },
];

// Sentinel for E# (Grace Pass) — not part of the normal range table
export const GRADE_EH = { grade: 'E#', points: 0, cls: 'grade-EH', gracePass: true };

export const SEMESTERS = [];
// ^ Intentionally empty at build time — populated at runtime from the
// `site_content` table in Supabase (key: SEMESTERS) by src/lib/liveContent.js.
// No bundled fallback; DB is the only source of truth for curriculum data.
// GRADING and GRADE_EH above stay hardcoded on purpose — they're the fixed
// AKTU grading scale (business logic), not editable content.
