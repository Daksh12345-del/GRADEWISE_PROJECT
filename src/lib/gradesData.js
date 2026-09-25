// ============================================================
// Grading system + curriculum holders.
//
// Everything here is the *live, active* scheme. It starts as the AKTU
// defaults and is swapped in place at runtime by src/lib/schemes.js to match
// the signed-in student's university (GGSIPU, AKTU, ...), using rows from the
// Supabase `university_schemes` table (grading scale, credit/marks rules,
// semesters). Consumers just keep importing these exports — they always
// reflect the active scheme.
// ============================================================

// Built-in DEFAULT scale (AKTU). Used when a scheme row has no `grading`, and
// by unit tests. Supabase rows override it per university.
const AKTU_GRADING = [
  { min: 90, max: 100, grade: 'A+', points: 10, cls: 'grade-O' },
  { min: 80, max: 89, grade: 'A', points: 9, cls: 'grade-Ap' },
  { min: 70, max: 79, grade: 'B+', points: 8, cls: 'grade-A' },
  { min: 60, max: 69, grade: 'B', points: 7, cls: 'grade-Bp' },
  { min: 50, max: 59, grade: 'C', points: 6, cls: 'grade-B' },
  { min: 45, max: 49, grade: 'D', points: 5, cls: 'grade-C' },
  { min: 40, max: 44, grade: 'E', points: 4, cls: 'grade-E' },
  { min: 0, max: 39, grade: 'F', points: 0, cls: 'grade-F' },
];

export const DEFAULT_GRADING = AKTU_GRADING.map((g) => ({ ...g }));

// ACTIVE grade scale (highest band first). Mutated in place by schemes.js.
export const GRADING = AKTU_GRADING.map((g) => ({ ...g }));

// Sentinel for E# (Grace Pass) — only used by schemes with `rules.grace` (AKTU)
export const GRADE_EH = { grade: 'E#', points: 0, cls: 'grade-EH', gracePass: true };

// Default credit/marks rules (AKTU). Every field can be overridden per
// university via university_schemes.rules.
export const DEFAULT_RULES = {
  maxPoints: 10,
  passMarks: 40,
  // AKTU grace marks: external < externalBelow -> up to maxGrace marks may be
  // added; if the graced total reaches passTotal it is an E# grace pass.
  // `null` = the university has no grace-marks rule (e.g. GGSIPU).
  grace: { externalBelow: 21, maxGrace: 7, passTotal: 40 },
  marks: {
    theory: { internal: 30, external: 70 },
    practical: { internal: 50, external: 50 },
    audit: { internal: 100, external: 0 },
    internalOnly: { internal: 100, external: 0 },
  },
  // Analyser: minimum marks to aim for, by subject credits
  thresholds: { '4': 70, '3': 65, default: 60 },
  features: { scan: true },
  summary: '',
};

// ACTIVE rules. Mutated in place by schemes.js.
export const GRADE_RULES = JSON.parse(JSON.stringify(DEFAULT_RULES));

// Which scheme is active right now (for labels / notices in the UI).
export const SCHEME_INFO = {
  universityCode: '',
  universityName: '',
  label: '',
  branch: '',
  approximate: false, // scheme belongs to a different branch of the same university
  missing: false,     // university has no scheme row; default scheme shown
};

// All active rows from `university_schemes` (filled by liveContent.js).
export const UNIVERSITY_SCHEMES = [];

export const SEMESTERS = [];
// ^ Intentionally empty at build time — populated at runtime by
// src/lib/schemes.js: from the active university_schemes row's `semesters`, or
// (AKTU) from the `site_content` key SEMESTERS. No bundled fallback.
