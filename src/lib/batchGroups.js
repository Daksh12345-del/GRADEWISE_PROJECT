// ============================================================
// Batch-group (Physics-first "A" / Chemistry-first "B") subject
// swap tables — single source of truth, shared by ResourcesPage
// (to resolve "your actual subject" per semester) and pdfScan
// (to auto-detect which group a scanned result sheet belongs to).
// ============================================================
//
// Every AKTU subject pair that officially alternates between the two
// halves of a batch (same two subjects, opposite order in the paired
// semester) swaps together based on the student's Sem I choice:
// Physics-first (A): Sem I -> Physics, Electrical, Programming, Environment | Sem III -> Cyber Security, UHV
// Chemistry-first (B): Sem I -> Chemistry, Electronics, Mechanical, Soft Skills | Sem III -> Python, Tech. Communication
// ...and each one's mirror in the paired semester (II<->I, IV<->III).
// NOT touched: BAS303/BAS404 (same Maths-IV content either way, no alternation),
// and the BCS.../BCDS..., BCS701/BAI701 pairs — those are CSE vs CSE-DS branch
// variants, an entirely different axis from the Physics/Chemistry batch choice.
export const BATCH_SWAP_COMBINED_CODES = {
  0: ['BAS101/BAS102', 'BEE101/BEC101', 'BCS101/BME101', 'BAS104/BAS105'],
  1: ['BAS202/BAS201', 'BEC201/BEE201', 'BME201/BCS201', 'BAS205/BAS204'],
  2: ['BVE301/BAS301', 'BCC301/BCC302'],
  3: ['BAS401/BVE401', 'BCC402/BCC401'],
}

export const BATCH_SWAP_OVERRIDE = {
  0: {
    'BAS101/BAS102': {
      A: { code: 'BAS101', name: 'Engineering Physics' },
      B: { code: 'BAS102', name: 'Engineering Chemistry' },
    },
    'BEE101/BEC101': {
      A: { code: 'BEE101', name: 'Fundamentals of Electrical Engineering' },
      B: { code: 'BEC101', name: 'Fundamentals of Electronics Engineering' },
    },
    'BCS101/BME101': {
      A: { code: 'BCS101', name: 'Programming for Problem Solving' },
      B: { code: 'BME101', name: 'Fundamentals of Mechanical Engineering' },
    },
    'BAS104/BAS105': {
      A: { code: 'BAS104', name: 'Environment and Ecology' },
      B: { code: 'BAS105', name: 'Soft Skills' },
    },
  },
  1: {
    'BAS202/BAS201': {
      A: { code: 'BAS202', name: 'Engineering Chemistry' },
      B: { code: 'BAS201', name: 'Engineering Physics' },
    },
    'BEC201/BEE201': {
      A: { code: 'BEC201', name: 'Fundamentals of Electronics Engineering' },
      B: { code: 'BEE201', name: 'Fundamentals of Electrical Engineering' },
    },
    'BME201/BCS201': {
      A: { code: 'BME201', name: 'Fundamentals of Mechanical Engineering' },
      B: { code: 'BCS201', name: 'Programming for Problem Solving' },
    },
    'BAS205/BAS204': {
      A: { code: 'BAS205', name: 'Soft Skills' },
      B: { code: 'BAS204', name: 'Environment and Ecology' },
    },
  },
  2: {
    'BVE301/BAS301': {
      A: { code: 'BAS301', name: 'Technical Communication' },
      B: { code: 'BVE301', name: 'Universal Human Values' },
    },
    'BCC301/BCC302': {
      A: { code: 'BCC301', name: 'Cyber Security' },
      B: { code: 'BCC302', name: 'Python Programming' },
    },
  },
  3: {
    'BAS401/BVE401': {
      A: { code: 'BVE401', name: 'Universal Human Values' },
      B: { code: 'BAS401', name: 'Technical Communication' },
    },
    'BCC402/BCC401': {
      A: { code: 'BCC402', name: 'Python Programming' },
      B: { code: 'BCC401', name: 'Cyber Security' },
    },
  },
}

// Flat lookup: individual subject code -> group letter, built once from
// BATCH_SWAP_OVERRIDE above. e.g. 'BAS101' -> 'A', 'BAS102' -> 'B'.
// Used by the PDF scanner to figure out, from the specific codes that
// actually appear on a student's result sheet, which group they're in —
// no need to ask, and no risk of trusting a stale/blank stored value.
export const CODE_TO_GROUP = (() => {
  const map = {}
  Object.values(BATCH_SWAP_OVERRIDE).forEach((semOverrides) => {
    Object.values(semOverrides).forEach((pick) => {
      map[pick.A.code] = 'A'
      map[pick.B.code] = 'B'
    })
  })
  return map
})()
