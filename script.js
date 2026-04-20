// ── STEP 4: Replace these with your actual keys from Supabase → Project Settings → API ──
  const SUPABASE_URL  = 'https://nwwjlfcibqlmilocqfmt.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53d2psZmNpYnFsbWlsb2NxZm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MDUzNTYsImV4cCI6MjA5MjA4MTM1Nn0.E7dFGikfXeTyJPskth79p5W-Qw8tQpsb-KhwIr8zEpI';
  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ===== next script block ===== */

// ========================
// DATA
// ========================
const GRADING = [
  { min: 90, max: 100, grade: 'A+', points: 10, cls: 'grade-O'  },
  { min: 80, max: 89,  grade: 'A',  points: 9,  cls: 'grade-Ap' },
  { min: 70, max: 79,  grade: 'B+', points: 8,  cls: 'grade-A'  },
  { min: 60, max: 69,  grade: 'B',  points: 7,  cls: 'grade-Bp' },
  { min: 50, max: 59,  grade: 'C',  points: 6,  cls: 'grade-B'  },
  { min: 45, max: 49,  grade: 'D',  points: 5,  cls: 'grade-C'  },
  { min: 40, max: 44,  grade: 'E',  points: 4,  cls: 'grade-E'  },
  { min: 0,  max: 39,  grade: 'F',  points: 0,  cls: 'grade-F'  },
];
// Sentinel entry for E# (Grace Pass) — stored separately, not in GRADING range table
const GRADE_EH = { grade: 'E#', points: 0, cls: 'grade-EH', gracePass: true };



// ── Marks helpers ────────────────────────────────────────────
// marksData[si][ji] is now { internal: '', external: '' }
// Legacy: if it's a plain string/number, treat as total (backward compat)
function getTotal(entry) {
  if (entry === null || entry === undefined || entry === '') return null;
  if (typeof entry === 'object') {
    const i = parseFloat(entry.internal);
    const e = parseFloat(entry.external);
    if (isNaN(i) && isNaN(e)) return null;
    const total = (isNaN(i) ? 0 : i) + (isNaN(e) ? 0 : e);
    return total;
  }
  // Legacy plain number/string
  const m = parseFloat(entry);
  return isNaN(m) ? null : m;
}

// ── GRACE MARKS LOGIC (AKTU rules) ──────────────────────────────────────────
// Grace applies ONLY to Theory and Elective subjects.
// Condition: external marks ≤ 21 (i.e., ext ≤ 21; verified: BCS603 ext=21 → E# by AKTU)
// Action: add up to 7 grace marks to external only
// Outcome: if (internal + graced_external) >= 40 → E# (Grace Pass, 0 pts, 1 credit)
//          else → F (Fail, 0 pts, full credits in denominator)
// Grace marks are NEVER applied to Practical or Audit subjects.
// ────────────────────────────────────────────────────────────────────────────

// Returns { graceApplied, gracedExternal, effectiveTotal } for a Theory/Elective entry.
// If grace does not apply (external >= 21 or not Theory/Elective), returns null.
function calcGrace(entry, subj) {
  if (!subj || (subj.type !== 'Theory' && subj.type !== 'Elective')) return null;
  if (typeof entry !== 'object' || entry === null) return null;
  const ext = parseFloat(entry.external);
  const int_ = parseFloat(entry.internal);
  if (isNaN(ext) || isNaN(int_)) return null;
  if (ext > 21) return null; // grace not triggered — ext must be ≤21 for grace to apply
  // External < 21 — grace rule is active
  const rawTotal = int_ + ext;
  const deficit = 40 - rawTotal;
  if (deficit <= 0) {
    // Total already >= 40, no marks added, but still E# grade
    return { graceApplied: 0, gracedExternal: ext, effectiveTotal: rawTotal };
  }
  const grace = Math.min(deficit, 7);
  const gracedExternal = ext + grace;
  const effectiveTotal = int_ + gracedExternal;
  return { graceApplied: grace, gracedExternal, effectiveTotal };
}

// Returns effective total after applying grace (for Theory/Elective only)
function getEffectiveTotal(entry, subj) {
  const g = calcGrace(entry, subj);
  if (g) return g.effectiveTotal;
  return getTotal(entry);
}

function isFilled(entry) {
  if (entry === null || entry === undefined || entry === '') return false;
  if (typeof entry === 'object') {
    return entry.internal !== '' || entry.external !== '';
  }
  return entry !== '';
}

// getGrade: returns grade object. Pass subj to enable grace marks logic.
// Grace logic (Theory/Elective only):
//   - If external < 21, attempt to add up to 7 grace marks to external
//   - If graced total >= 40 → E# (Grace Pass)
//   - If graced total < 40  → F (Fail)
function getGrade(marks, subj) {
  let internal_val = null;
  let external_val = null;
  let m;

  if (typeof marks === 'object' && marks !== null) {
    const t = getTotal(marks);
    if (t === null) return null;
    internal_val = parseFloat(marks.internal);
    external_val = parseFloat(marks.external);
    m = t;
  } else {
    if (marks === '' || marks === null || marks === undefined) return null;
    m = parseFloat(marks);
  }
  if (isNaN(m) || m < 0 || m > 100) return null;

  // Apply grace logic for Theory/Elective subjects when external < 21
  if (subj && (subj.type === 'Theory' || subj.type === 'Elective')
      && external_val !== null && !isNaN(external_val) && external_val < 21) {
    // External < 21 always triggers grace evaluation.
    // Check if total (with up to 7 grace on external) can reach >= 40.
    const deficit = 40 - m;
    if (deficit <= 0) {
      // Total already >= 40 with raw marks — still E# because external was < 21
      return GRADE_EH;
    }
    const grace = Math.min(deficit, 7);
    const gracedTotal = m + grace;
    if (gracedTotal >= 40) {
      return GRADE_EH; // Grace Pass — E#
    } else {
      return GRADING[GRADING.length - 1]; // F — grace insufficient
    }
  }

  return GRADING.find(g => m >= g.min && m <= g.max) || GRADING[GRADING.length - 1];
}

// Get effective grade POINTS for SGPA/CGPA calculation:
//   E# (Grace Pass) → 0 grade points (credits 1 in denominator)
//   F  (Fail)       → 0 grade points (full credits in denominator)
//   Any pass grade  → normal grade points
function getEffectivePoints(grade) {
  if (!grade) return 0;
  if (grade.grade === 'F' || grade.grade === 'E#') return 0;
  return grade.points;
}

// Get effective credits for SGPA calculation:
//   E# (Grace Pass) → FULL credits in denominator, 0 grade points
//     VERIFIED from AKTU PDF: Sem-2 SGPA=5.5 = 121pts/22cr
//     BAS202 E# is counted as 0pts x 4cr, NOT excluded from denominator.
//   F  (Fail)       → full subject credits in denominator, 0 grade points
//   Any pass grade  → full subject credits + normal grade points
function getEffectiveCredits(entry, subj) {
  if (!subj || subj.audit || subj.credits === 0) return subj ? subj.credits : 0;
  // Both E# and F carry full credits in denominator with 0 grade points
  return subj.credits;
}

// Grade lookup with NO grace — used for back paper results
// Back paper is a fresh attempt: normal grading table only, no AKTU grace rule
function getGradeNoGrace(marks) {
  let m;
  if (typeof marks === 'object' && marks !== null) {
    const t = getTotal(marks);
    if (t === null) return null;
    m = t;
  } else {
    if (marks === '' || marks === null || marks === undefined) return null;
    m = parseFloat(marks);
  }
  if (isNaN(m) || m < 0) return null;
  return GRADING.find(g => m >= g.min && m <= g.max) || GRADING[GRADING.length - 1];
}

// Credits for a back-paper result:
// VERIFIED: F in back paper → full credits in denominator, 0 grade points
// E# → NOT possible in back paper (grace doesn't apply)
// Any pass grade → full subject credits + normal grade points
function getBackCredits(backGrade, subj) {
  // Always return full credits — F still counts in denominator with 0 pts
  return subj.credits;
}

// Grade for internalOnly subjects (Internship, Mini Project, Project etc.)
// Marks are out of 100 normally; BCS753 Project-I is out of 150 (converted to % for grade).
// BCS851 Project-II is split: internal/100 + external/350 (total /450, converted to %).
function getGradeForInternalOnly(entry, subj) {
  if (!entry || typeof entry !== 'object') return null;
  // BCS851 Project-II: internal/100 + external/350, grade based on (total/450)*100
  if (subj && subj.code === 'BCS851') {
    const intV = parseFloat(entry.internal);
    const extV = parseFloat(entry.external);
    if (isNaN(intV) && isNaN(extV)) return null;
    const total = (isNaN(intV) ? 0 : intV) + (isNaN(extV) ? 0 : extV);
    const pct = (total / 450) * 100;
    return GRADING.find(g => pct >= g.min && pct <= g.max) || GRADING[GRADING.length - 1];
  }
  // BCS753 Project-I: marks out of 150, convert to % for grade lookup
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

// Max marks per type
// internalOnly subjects (Internship, Mini Project, Major Project):
//   - Assessed by supervisor internally, marks out of 100, no external exam
//   - These subjects appear in AKTU result with a single CA-style mark
function getMaxMarks(subj) {
  if (subj.internalOnly) {
    if (subj.code === 'BCS851') return { internal: 100, external: 350 }; // Project-II: internal/100 + external/350
    if (subj.code === 'BCS753') return { internal: 150, external: 0 };   // Project-I: internal out of 150
    return { internal: 100, external: 0 }; // e.g. BCC351, BCS554, BCS752, BCS754
  }
  if (subj.type === 'Practical') return { internal: 50, external: 50 };
  if (subj.type === 'Audit')     return { internal: 100, external: 0 };
  // Theory, Elective
  return { internal: 30, external: 70 };
}

const SEMESTERS = [
  {
    sem: 1, label: 'Semester I', totalCredits: 22,
    subjects: [
      { code: 'BAS101/BAS102', name: 'Engineering Physics / Engineering Chemistry', type: 'Theory', credits: 4, audit: false },
      { code: 'BAS103', name: 'Engineering Mathematics-I', type: 'Theory', credits: 4, audit: false },
      { code: 'BEE101/BEC101', name: 'Fundamentals of Electrical Engineering / Fundamentals of Electronics Engineering', type: 'Theory', credits: 3, audit: false },
      { code: 'BCS101/BME101', name: 'Programming for Problem Solving / Fundamentals of Mechanical Engineering', type: 'Theory', credits: 3, audit: false },
      { code: 'BAS104/BAS105', name: 'Environment and Ecology / Soft Skills', type: 'Theory', credits: 3, audit: false },
      { code: 'BAS151/BAS152', name: 'Engineering Physics Lab / Engineering Chemistry Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BEE151/BEC151', name: 'Basic Electrical Engineering Lab / Basic Electronics Engineering Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS151/BAS155', name: 'Programming for Problem Solving Lab / English Language Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCE151/BWS151', name: 'Engineering Graphics & Design Lab / Workshop Practice Lab', type: 'Practical', credits: 2, audit: false },
    ]
  },
  {
    sem: 2, label: 'Semester II', totalCredits: 22,
    subjects: [
      { code: 'BAS202/BAS201', name: 'Engineering Chemistry / Engineering Physics', type: 'Theory', credits: 4, audit: false },
      { code: 'BAS203', name: 'Engineering Mathematics-II', type: 'Theory', credits: 4, audit: false },
      { code: 'BEC201/BEE201', name: 'Fundamentals of Electronics Engineering / Fundamentals of Electrical Engineering', type: 'Theory', credits: 3, audit: false },
      { code: 'BME201/BCS201', name: 'Fundamentals of Mechanical Engineering / Programming for Problem Solving', type: 'Theory', credits: 3, audit: false },
      { code: 'BAS205/BAS204', name: 'Soft Skills / Environment and Ecology', type: 'Theory', credits: 3, audit: false },
      { code: 'BAS252/BAS251', name: 'Engineering Chemistry Lab / Engineering Physics Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BEC251/BEE251', name: 'Basic Electronics Engineering Lab / Basic Electrical Engineering Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BAS255/BCS251', name: 'English Language Lab / Programming for Problem Solving Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BWS251/BCE251', name: 'Workshop Practice Lab / Engineering Graphics & Design Lab', type: 'Practical', credits: 2, audit: false },
      { code: 'BVA251/BVA252', name: 'Sports and Yoga / NSS', type: 'Audit', credits: 0, audit: true },
    ]
  },
  {
    sem: 3, label: 'Semester III', totalCredits: 25,
    subjects: [
      { code: 'BCS301', name: 'Data Structure', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS302', name: 'Computer Organization and Architecture', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS303', name: 'Discrete Structures & Theory of Logic', type: 'Theory', credits: 3, audit: false },
      { code: 'BAS303/BAS404', name: 'Engineering Mathematics-IV', type: 'Theory', credits: 4, audit: false },
      { code: 'BVE301/BAS301', name: 'Universal Human Values / Technical Communication', type: 'Theory', credits: 3, audit: false },
      { code: 'BCC301/BCC302', name: 'Cyber Security / Python Programming', type: 'Theory', credits: 2, audit: false },
      { code: 'BCS351', name: 'Data Structure Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS352', name: 'COA Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS353', name: 'Web Designing Workshop', type: 'Practical', credits: 1, audit: false },
      { code: 'BCC351', name: 'Internship / Mini Project', type: 'Practical', credits: 2, audit: false, internalOnly: true },
    ]
  },
  {
    sem: 4, label: 'Semester IV', totalCredits: 23,
    subjects: [
      { code: 'BCS401', name: 'Operating System', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS402', name: 'Theory of Automata & Formal Languages', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS403', name: 'Object Oriented Programming with Java', type: 'Theory', credits: 3, audit: false },
      {
        code: 'BOE-410', name: 'Open Elective (Theory)', type: 'Elective', credits: 4, audit: false,
        options: [
          'BOE405 - Sensor & Instrumentation',
          'BOE410 - Digital Electronics',
          'BOE411 - Renewable Energy',
          'BOE412 - Industrial Management',
        ]
      },
      { code: 'BAS401/BVE401', name: 'Technical Communication / Universal Human Values', type: 'Theory', credits: 3, audit: false },
      { code: 'BCC402/BCC401', name: 'Python Programming / Cyber Security', type: 'Theory', credits: 2, audit: false },
      { code: 'BCS451', name: 'Operating System Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS452', name: 'Java OOP Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS453', name: 'Cyber Security Workshop', type: 'Practical', credits: 1, audit: false },
      { code: 'BVE451/452', name: 'Sports & Yoga-II / NSS-II', type: 'Audit', credits: 0, audit: true },
    ]
  },
  {
    sem: 5, label: 'Semester V', totalCredits: 23,
    subjects: [
      { code: 'BCS501', name: 'Database Management System', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS502/BCDS501', name: 'Web Technology / Intro to Data Analytics & Visualization', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS503', name: 'Design and Analysis of Algorithm', type: 'Theory', credits: 4, audit: false },
      {
        code: 'Dept. Elective-I', name: 'Departmental Elective I', type: 'Elective', credits: 3, audit: false,
        options: [
          'BCS051 - Statistical Computing',
          'BCS052 - Data Analytics',
          'BCS053 - Computer Graphics',
          'BCS054 - OO System Design with C++',
          'BCDS052 - Data Analytics (DS)',
          'BCDS053 - Computer Graphics (DS)',
          'BCDS054 - OO System Design with C++ (DS)',
        ]
      },
      {
        code: 'Dept. Elective-II', name: 'Departmental Elective II', type: 'Elective', credits: 3, audit: false,
        options: [
          'BCS055 - Machine Learning Techniques',
          'BCS056 - Application of Soft Computing',
          'BCS057 - Image Processing',
          'BCS058 - Data Warehousing & Mining',
          'BCDS055 - Machine Learning Techniques (DS)',
          'BCDS056 - Application of Soft Computing (DS)',
          'BCDS057 - Image Processing (DS)',
          'BCDS058 - Data Warehousing & Mining (DS)',
        ]
      },
      { code: 'BNC501', name: 'Constitution of India', type: 'Theory', credits: 0, audit: false },
      { code: 'BCS551', name: 'DBMS Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS552/BCDS551', name: 'Web Technology Lab / Data Analytics & Visualization Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS553', name: 'DAA Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS554', name: 'Mini Project / Internship', type: 'Practical', credits: 2, audit: false, internalOnly: true },
    ]
  },
  {
    sem: 6, label: 'Semester VI', totalCredits: 21,
    subjects: [
      { code: 'BCS601', name: 'Software Engineering', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS602/BCDS601', name: 'Compiler Design / Big Data and Analytics', type: 'Theory', credits: 4, audit: false },
      { code: 'BCS603', name: 'Computer Networks', type: 'Theory', credits: 4, audit: false },
      {
        code: 'Dept. Elective-III', name: 'Departmental Elective III', type: 'Elective', credits: 3, audit: false,
        options: [
          'BCS061 - Big Data',
          'BCS062 - Augmented & Virtual Reality',
          'BCS063 - Blockchain Architecture Design',
          'BCS064 - Data Compression',
          'BCDS061 - Big Data (DS)',
          'BCDS062 - Machine Learning Techniques (DS)',
          'BCDS063 - Blockchain (DS)',
          'BCDS064 - Data Compression (DS)',
        ]
      },
      {
        code: 'Open Elective-I', name: 'Open Elective I', type: 'Elective', credits: 3, audit: false,
        options: [
          'BOE067 - Basics of DBMS',
          'BOE068 - Software Project Management',
          'BOE069 - Soft Computing',
          'BOE070 - Renewable Energy',
          'BOE071 - Industrial Management',
          'BOE072 - Environmental Science',
          'BOE073 - Disaster Management',
        ]
      },
      { code: 'BNC602', name: 'Essence of Indian Traditional Knowledge', type: 'Theory', credits: 0, audit: false },
      { code: 'BCS651', name: 'Software Engineering Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS652/BCDS651', name: 'Compiler Design Lab / Big Data Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS653', name: 'Computer Networks Lab', type: 'Practical', credits: 1, audit: false },
    ]
  },
  {
    sem: 7, label: 'Semester VII', totalCredits: 19,
    subjects: [
      { code: 'BCS701/BAI701', name: 'Artificial Intelligence / Deep Learning', type: 'Theory', credits: 3, audit: false },
      {
        code: 'Dept. Elective-IV', name: 'Departmental Elective IV', type: 'Elective', credits: 3, audit: false,
        options: [
          'BCS070 - Internet of Things',
          'BCS071 - Cloud Computing',
          'BCS072 - Cryptography & Network Security',
          'BCS073 - Design & Development of Applications',
          'BAI702 - Natural Language Processing',
          'BAI703 - Computer Vision',
          'BAI704 - Reinforcement Learning',
          'BCDS071 - Cloud Computing (DS)',
          'BCDS072 - Cryptography & Network Security (DS)',
        ]
      },
      {
        code: 'BOEM-OE2', name: 'Open Elective II (MOOCs)', type: 'Elective', credits: 3, audit: false,
        options: [
          'BOE074 - Renewable Energy Resources',
          'BOE075 - Disaster Management',
          'BOE076 - Environmental Science',
          'BOE077 - Industrial Management',
          'BOE078 - Soft Computing',
          'BOE079 - Basics of DBMS',
        ]
      },
      { code: 'BCS751/BAI751', name: 'AI Lab / Deep Learning Lab', type: 'Practical', credits: 1, audit: false },
      { code: 'BCS752', name: 'Mini Project / Internship', type: 'Practical', credits: 2, audit: false, internalOnly: true },
      { code: 'BCS753', name: 'Project-I', type: 'Practical', credits: 5, audit: false, internalOnly: true },
      { code: 'BCS754', name: 'Startup & Entrepreneurial Activity', type: 'Practical', credits: 2, audit: false, internalOnly: true },
    ]
  },
  {
    sem: 8, label: 'Semester VIII', totalCredits: 16,
    subjects: [
      { code: 'BOEM-OE3', name: 'Open Elective III (MOOCs)', type: 'Elective', credits: 3, audit: false },
      { code: 'BOEM-OE4', name: 'Open Elective IV (MOOCs)', type: 'Elective', credits: 3, audit: false },
      { code: 'BCS851', name: 'Project-II (Major Project)', type: 'Practical', credits: 10, audit: false, internalOnly: true },
    ]
  }
];

// ========================
// STATE
// ========================
let currentSem = 0;
let marksData = {}; // marksData[semIdx][subjIdx] = marks value
let electiveChoices = {}; // electiveChoices[semIdx][subjIdx] = choice string
let backData = {}; // backData[semIdx][subjIdx] = back paper external marks (string)

SEMESTERS.forEach((s, si) => {
  marksData[si] = {};
  electiveChoices[si] = {};
  backData[si] = {};
  s.subjects.forEach((_, ji) => {
    marksData[si][ji] = { internal: '', external: '' };
    backData[si][ji] = '';
  });
});

// ========================
// LOGIN
// ========================
// ── Branch data per course ──
const BRANCHES = {
  'B.Tech': [
    'Computer Science & Engineering (CSE)',
    'Computer Science (CS)',
    'Computer Engineering (CE)',
    'CSE – Artificial Intelligence & Machine Learning',
    'CSE – Data Science',
    'CSE – Cyber Security',
    'CSE – Internet of Things',
    'CSE – Blockchain Technology',
    'Information Technology (IT)',
    'Electronics & Communication Engineering (ECE)',
    'Electrical Engineering (EE)',
    'Electrical & Electronics Engineering (EEE)',
    'Mechanical Engineering (ME)',
    'Civil Engineering (CE)',
    'Chemical Engineering',
    'Biotechnology',
    'Aerospace Engineering',
    'Automobile Engineering',
    'Agricultural Engineering',
    'Mining Engineering',
  ],
  'B.Tech Lateral Entry': [
    'Computer Science & Engineering (CSE)',
    'Information Technology (IT)',
    'Electronics & Communication Engineering (ECE)',
    'Electrical Engineering (EE)',
    'Mechanical Engineering (ME)',
    'Civil Engineering (CE)',
  ],
  'M.Tech': [
    'Computer Science & Engineering',
    'Software Engineering',
    'Artificial Intelligence',
    'Data Science & Analytics',
    'Information Security',
    'VLSI Design',
    'Electronics & Communication',
    'Power Systems',
    'Structural Engineering',
  ],
  'MCA': ['Master of Computer Applications'],
  'MBA': ['Marketing', 'Finance', 'Human Resource Management', 'Operations Management', 'Information Technology Management', 'Business Analytics'],
  'BCA': ['Bachelor of Computer Applications'],
  'B.Arch': ['Architecture'],
  'B.Pharm': ['Pharmacy'],
};

function selectGroup(val) {
  document.getElementById('inp-group-' + val.toLowerCase()).checked = true;
  document.querySelectorAll('.grp-radio-lbl').forEach(el => {
    el.style.border = '1.5px solid rgba(6,182,212,0.25)';
    el.style.background = 'transparent';
  });
  const lbl = document.getElementById('grp-' + val.toLowerCase() + '-lbl');
  if (lbl) {
    lbl.style.border = val === 'A' ? '1.5px solid #06b6d4' : '1.5px solid #a78bfa';
    lbl.style.background = val === 'A' ? 'rgba(6,182,212,0.08)' : 'rgba(167,139,250,0.08)';
  }
  const errEl = document.getElementById('err-group');
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
}

function updateBranches() {
  const course = document.getElementById('inp-course').value;
  const branchSel = document.getElementById('inp-branch');
  branchSel.innerHTML = '<option value="">— Select Branch —</option>';
  const list = BRANCHES[course] || [];
  list.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    branchSel.appendChild(opt);
  });
  // Show Group A/B selector only for AKTU university
  const univ = document.getElementById('inp-university') ? document.getElementById('inp-university').value : '';
  const grpWrap = document.getElementById('group-selector-wrap');
  if (grpWrap) grpWrap.style.display = (univ === 'AKTU') ? 'block' : 'none';
}

function clearFieldErr(id) {
  const inp = document.getElementById(id);
  const errId = 'err-' + id.replace('inp-','');
  const err = document.getElementById(errId);
  if (inp) inp.style.borderColor = '';
  if (err) err.textContent = '';
  // clear both error banners
  const e1 = document.getElementById('login-err-1');
  const e2 = document.getElementById('login-err-2');
  if (e1) e1.style.display = 'none';
  if (e2) e2.style.display = 'none';
}

function setFieldErr(id, msg) {
  const inp = document.getElementById(id);
  const errId = 'err-' + id.replace('inp-','');
  const err = document.getElementById(errId);
  if (inp) inp.style.borderColor = '#ef4444';
  if (err) err.textContent = msg;
}

// ── STEP NAV ──
function goStep2() {
  const name   = document.getElementById('inp-name').value.trim();
  const email  = document.getElementById('inp-email').value.trim();
  const univ   = document.getElementById('inp-university').value.trim();
  const course = document.getElementById('inp-course').value.trim();

  // Only require fields to be non-empty
  const e1 = document.getElementById('login-err-1');
  if (!name || !email || !univ || !course) {
    if (!name) setFieldErr('inp-name', 'Please enter your name.');
    if (!email) setFieldErr('inp-email', 'Please enter your email.');
    if (!univ) setFieldErr('inp-university', 'Please select your university.');
    if (!course) setFieldErr('inp-course', 'Please select your course.');
    if (e1) { e1.textContent = '⚠️ Please fill in all fields above to continue.'; e1.style.display = 'block'; }
    return;
  }
  if (e1) e1.style.display = 'none';

  // Go to step 2
  document.getElementById('step-1').classList.remove('active');
  document.getElementById('step-2').classList.add('active');
  // Update step indicators
  document.getElementById('sdot-1').classList.remove('active');
  document.getElementById('sdot-1').classList.add('done');
  document.getElementById('sdot-1').textContent = '✓';
  document.getElementById('sline-1').classList.add('done');
  document.getElementById('sdot-2').classList.add('active');
  document.getElementById('slbl-1').classList.remove('active');
  document.getElementById('slbl-1').classList.add('done');
  document.getElementById('slbl-2').classList.add('active');
  // Personalise welcome note
  const n = document.getElementById('step2-name');
  if (n) n.textContent = name.split(' ')[0];
  // Populate branches
  updateBranches();
}

function goStep1() {
  document.getElementById('step-2').classList.remove('active');
  document.getElementById('step-1').classList.add('active');
  document.getElementById('sdot-1').classList.add('active');
  document.getElementById('sdot-1').classList.remove('done');
  document.getElementById('sdot-1').textContent = '1';
  document.getElementById('sline-1').classList.remove('done');
  document.getElementById('sdot-2').classList.remove('active');
  document.getElementById('slbl-1').classList.add('active');
  document.getElementById('slbl-1').classList.remove('done');
  document.getElementById('slbl-2').classList.remove('active');
}

async function doLogin() {
  const name     = document.getElementById('inp-name').value.trim();
  const email    = document.getElementById('inp-email').value.trim();
  const univ     = document.getElementById('inp-university').value.trim();
  const course   = document.getElementById('inp-course').value.trim();
  const college  = document.getElementById('inp-college').value.trim();
  const roll     = document.getElementById('inp-roll').value.trim();
  const branch   = document.getElementById('inp-branch').value.trim();
  const domain   = document.getElementById('inp-domain').value.trim();
  const err2     = document.getElementById('login-err-2');

  const groupEl = document.querySelector('input[name="batch_group"]:checked');
  const group = groupEl ? groupEl.value : '';
  ['inp-college','inp-roll','inp-branch','inp-domain'].forEach(id => clearFieldErr(id));
  const errGrpEl = document.getElementById('err-group');
  if (errGrpEl) { errGrpEl.textContent = ''; errGrpEl.style.display = 'none'; }
  if (err2) err2.style.display = 'none';

  let hasErr = false;

  if (!college) { setFieldErr('inp-college','Please select your college.'); hasErr=true; }
  if (!roll) { setFieldErr('inp-roll','Roll number is required.'); hasErr=true; }
  else if (!/^[a-zA-Z0-9]{6,20}$/.test(roll)) { setFieldErr('inp-roll','6–20 alphanumeric chars only.'); hasErr=true; }
  if (!branch) { setFieldErr('inp-branch','Please select your branch.'); hasErr=true; }
  if (!domain) { setFieldErr('inp-domain','Please pick your domain of interest.'); hasErr=true; }
  const grpVisible = document.getElementById('group-selector-wrap') && document.getElementById('group-selector-wrap').style.display !== 'none';
  if (grpVisible && !group) {
    const errGEl = document.getElementById('err-group');
    if (errGEl) { errGEl.textContent = 'Please select your batch group (A or B).'; errGEl.style.display = 'block'; }
    hasErr = true;
  }

  if (hasErr) return;

  const user = { name, email, university: univ, course, college, roll, branch, domain, group };

  const loginBtn = document.querySelector('.btn-login');
  if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Connecting…'; }

  // Try sign-in first; if no account, auto-register
  let authData, authErr;
  const signInRes = await _sb.auth.signInWithPassword({ email, password: roll });
  authData = signInRes.data; authErr = signInRes.error;

  if (authErr) {
    const signUpRes = await _sb.auth.signUp({ email, password: roll });
    authData = signUpRes.data; authErr = signUpRes.error;
    if (authErr) {
      const e2 = document.getElementById('login-err-2');
      if (e2) { e2.textContent = '⚠️ Auth error: ' + authErr.message; e2.style.display = 'block'; }
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'LAUNCH GRADEWISE →'; }
      return;
    }
  }

  if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'LAUNCH GRADEWISE →'; }

  // ── Save full profile to Supabase ──
  if (authData.user) {
    await _sb.from('profiles').upsert({
      id: authData.user.id,
      name, email,
      university: univ,
      course, college,
      roll_number: roll,
      branch, domain, batch_group: group,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    // ── Log this session ──
    await _sb.from('sessions').insert({
      user_id: authData.user.id,
      user_email: email,
      user_name: name,
      login_at: new Date().toISOString(),
      device: navigator.userAgent.substring(0, 200),
      provider: 'email'
    });

    // ── Track page visit ──
    gwTrackVisit('login', authData.user.id);
  }

  localStorage.setItem('aktu_user', JSON.stringify({ ...user, uid: authData.user?.id }));
  applyGroupToSemesters(group);
  await loadMarksFromDB();
  initApp(user);
}

// ── Google OAuth Login ──
async function doGoogleLogin() {
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    const e2 = document.getElementById('login-err-1');
    if (e2) { e2.textContent = '⚠️ Google sign-in failed: ' + error.message; e2.style.display = 'block'; }
  }
}

// ── GitHub OAuth Login ──
async function doGithubLogin() {
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    const e2 = document.getElementById('login-err-1');
    if (e2) { e2.textContent = '⚠️ GitHub sign-in failed: ' + error.message; e2.style.display = 'block'; }
  }
}

// ── Track page visits (fire-and-forget) ──
async function gwTrackVisit(page, uid) {
  try {
    if (!uid) {
      const { data: { session } } = await _sb.auth.getSession();
      uid = session?.user?.id;
    }
    if (!uid) return;
    await _sb.from('page_visits').insert({
      user_id: uid,
      page,
      visited_at: new Date().toISOString()
    });
  } catch(e) {}
}

// ── Snapshot CGPA/marks to Supabase (called on marks change) ──
async function gwSnapshotMarks() {
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session?.user?.id) return;
    const cgpa = typeof calcCGPA === 'function' ? calcCGPA() : 0;
    // Build per-sem SGPA array
    const sgpaArr = SEMESTERS.map((_, si) =>
      typeof calcSGPA === 'function' ? parseFloat(calcSGPA(si).toFixed(2)) : 0
    );
    const marksSnapshot = {};
    SEMESTERS.forEach((_, si) => {
      marksSnapshot[si] = {};
      Object.keys(marksData[si] || {}).forEach(ji => {
        marksSnapshot[si][ji] = marksData[si][ji];
      });
    });
    await _sb.from('marks_snapshots').upsert({
      user_id: session.user.id,
      cgpa: parseFloat(cgpa.toFixed(2)),
      sgpa_per_sem: sgpaArr,
      marks_data: marksSnapshot,
      elective_choices: electiveChoices,
      saved_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch(e) {}
}

function doLogout() {
  _sb.auth.signOut(); // Supabase sign out
  localStorage.removeItem('aktu_user');
  localStorage.removeItem('aktu_marks');
  // Reset step indicators
  document.getElementById('sdot-1').classList.add('active');
  document.getElementById('sdot-1').classList.remove('done');
  document.getElementById('sdot-1').textContent = '1';
  document.getElementById('sline-1').classList.remove('done');
  document.getElementById('sdot-2').classList.remove('active');
  document.getElementById('slbl-1').classList.add('active');
  document.getElementById('slbl-1').classList.remove('done');
  document.getElementById('slbl-2').classList.remove('active');
  document.getElementById('step-1').classList.add('active');
  document.getElementById('step-2').classList.remove('active');
  document.getElementById('loginPage').classList.add('active');
  document.getElementById('appPage').classList.remove('active');
  document.getElementById('dashboardPage').classList.remove('active');
  document.getElementById('internshipsPage').classList.remove('active');
  document.getElementById('resourcesPage').classList.remove('active');
  document.getElementById('analyserPage').classList.remove('active');
}

// ========================
// APP INIT
// ========================
// ========================
// GROUP A / B — Physics & Chemistry batch split
// ========================
function applyGroupToSemesters(group) {
  if (!group) return; // no group set — leave defaults
  // Sem 0 (index) = Semester I, Sem 1 (index) = Semester II
  const s1 = SEMESTERS[0];
  const s2 = SEMESTERS[1];

  if (group === 'A') {
    // Group A: Sem I → Physics first, Sem II → Chemistry first (AKTU default order)
    s1.subjects[0] = { code: 'BAS101', name: 'Engineering Physics', type: 'Theory', credits: 4, audit: false };
    s1.subjects[5] = { code: 'BAS151', name: 'Engineering Physics Lab', type: 'Practical', credits: 1, audit: false };
    s2.subjects[0] = { code: 'BAS202', name: 'Engineering Chemistry', type: 'Theory', credits: 4, audit: false };
    s2.subjects[5] = { code: 'BAS252', name: 'Engineering Chemistry Lab', type: 'Practical', credits: 1, audit: false };
  } else if (group === 'B') {
    // Group B: Sem I → Chemistry first, Sem II → Physics first
    s1.subjects[0] = { code: 'BAS102', name: 'Engineering Chemistry', type: 'Theory', credits: 4, audit: false };
    s1.subjects[5] = { code: 'BAS152', name: 'Engineering Chemistry Lab', type: 'Practical', credits: 1, audit: false };
    s2.subjects[0] = { code: 'BAS201', name: 'Engineering Physics', type: 'Theory', credits: 4, audit: false };
    s2.subjects[5] = { code: 'BAS251', name: 'Engineering Physics Lab', type: 'Practical', credits: 1, audit: false };
  }
}

function initApp(user) {
  document.getElementById('loginPage').classList.remove('active');
  document.getElementById('dashboardPage').classList.add('active');

  document.getElementById('user-nm').textContent = user.name;
  document.getElementById('user-av').textContent = user.name[0].toUpperCase();
  // Show group badge if set
  const existingBadge = document.getElementById('user-group-badge');
  if (existingBadge) existingBadge.remove();
  if (user.group) {
    const badge = document.createElement('span');
    badge.id = 'user-group-badge';
    badge.textContent = 'Group ' + user.group;
    badge.style.cssText = 'font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:4px;' +
      (user.group === 'A'
        ? 'background:rgba(6,182,212,0.18);color:#06b6d4;border:1px solid rgba(6,182,212,0.35);'
        : 'background:rgba(167,139,250,0.18);color:#a78bfa;border:1px solid rgba(167,139,250,0.35);');
    const nm = document.getElementById('user-nm');
    if (nm && nm.parentNode) nm.parentNode.insertBefore(badge, nm.nextSibling);
  }

  // Load saved marks
  const saved = localStorage.getItem('aktu_marks');
  if (saved) {
    try {
      const d = JSON.parse(saved);
      const loaded = d.marks || {};
      // Migrate legacy flat values → { internal, external } objects
      SEMESTERS.forEach((sem, si) => {
        if (!marksData[si]) marksData[si] = {};
        sem.subjects.forEach((subj, ji) => {
          const v = loaded[si] && loaded[si][ji];
          if (v === undefined || v === null) {
            marksData[si][ji] = { internal: '', external: '' };
          } else if (typeof v === 'object' && ('internal' in v || 'external' in v)) {
            marksData[si][ji] = v; // already new format
          } else {
            // Legacy: plain number stored as total
            // internalOnly subjects → put in internal field; others → external field
            const total = parseFloat(v);
            if (!isNaN(total)) {
              if (subj.internalOnly) {
                marksData[si][ji] = { internal: String(total), external: '' };
              } else {
                marksData[si][ji] = { internal: '', external: String(total) };
              }
            } else {
              marksData[si][ji] = { internal: '', external: '' };
            }
          }
        });
      });
      electiveChoices = d.electives || electiveChoices;
      // Load back paper data
      const loadedBack = d.back || {};
      SEMESTERS.forEach((sem, si) => {
        if (!backData[si]) backData[si] = {};
        sem.subjects.forEach((_, ji) => {
          backData[si][ji] = (loadedBack[si] && loadedBack[si][ji] !== undefined) ? loadedBack[si][ji] : '';
        });
      });
    } catch(e) {}
  }

  buildSidebar();
  buildMobileNav();
  renderSemester(0);
  updatePanels();
  // Sync dashboard data on init
  setTimeout(refreshDashboard, 50);
}

function buildSidebar() {
  const sb = document.getElementById('sidebar-sems');
  sb.innerHTML = SEMESTERS.map((s, i) => `
    <button class="sem-btn ${i === 0 ? 'active' : ''}" onclick="switchSem(${i})" id="sb-${i}">
      ${s.label}
      <span class="sem-badge">${s.totalCredits}cr</span>
    </button>
  `).join('');
}

function buildMobileNav() {
  const mn = document.getElementById('mobile-nav');
  let html = `<button class="mobile-sem-btn" onclick="openResources()" style="border-color:rgba(16,185,129,0.4);color:#10b981;flex-shrink:0;">📚</button>`;
  html += `<button class="mobile-sem-btn" onclick="openAnalyser()" style="flex-shrink:0;">🔍</button>`;
  html += SEMESTERS.map((s, i) => `
    <button class="mobile-sem-btn ${i === 0 ? 'active' : ''}" onclick="switchSem(${i})" id="mn-${i}">Sem ${s.sem}</button>
  `).join('');
  mn.innerHTML = html;
}

function switchSem(idx) {
  currentSem = idx;
  document.querySelectorAll('.sem-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  document.querySelectorAll('.mobile-sem-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  renderSemester(idx);
  updatePanels();
}

// ========================
// RENDER SEMESTER
// ========================
function renderSemester(si) {
  const sem = SEMESTERS[si];
  const sgpa = calcSGPA(si);
  const { sgpa: sgpaBack, hasAnyBack } = calcSGPAWithBack(si);
  // For sem I and II, show the active group
  const _savedUser = JSON.parse(localStorage.getItem('aktu_user') || '{}');
  const _group = _savedUser.group || '';

  const content = document.getElementById('content-area');
  content.innerHTML = `
    <div class="sem-header">
      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
        <div class="sem-title">${sem.label}</div>
        ${(si === 0 || si === 1) && _group ? `<span style="font-size:0.68rem;font-weight:700;padding:3px 9px;border-radius:20px;${_group==='A'?'background:rgba(6,182,212,0.15);color:#06b6d4;border:1px solid rgba(6,182,212,0.3);':'background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);'}">Group ${_group} — ${si===0?(_group==='A'?'Physics Batch':'Chemistry Batch'):(_group==='A'?'Chemistry Batch':'Physics Batch')}</span>` : ''}
      </div>
      <div class="sem-subtitle">AKTU B.Tech CSE · Total Credits: ${sem.totalCredits}</div>
      <div class="sgpa-badges-row">
        <div class="live-sgpa-mini">
          <span class="live-sgpa-label">LIVE SGPA</span>
          <span class="live-sgpa-val" id="live-sgpa-inline">${sgpa.toFixed(2)}</span>
        </div>
        ${hasAnyBack ? `
          <div class="sgpa-arrow-sep">→</div>
          <div class="live-sgpa-mini live-sgpa-back-mini" title="SGPA after back paper clearance">
            <span class="live-sgpa-label" style="color:#10b981;">AFTER BACK</span>
            <span class="live-sgpa-val" style="color:#10b981;" id="live-sgpa-back-inline">${sgpaBack.toFixed(2)}</span>
          </div>
          <span class="back-sgpa-delta">▲ +${(sgpaBack - sgpa).toFixed(2)}</span>
        ` : ''}
      </div>
    </div>
    <div class="subjects-grid" id="subjects-grid-${si}">
      ${sem.subjects.map((subj, ji) => renderSubjectCard(si, ji, subj)).join('')}
    </div>
  `;
}

function renderSubjectCard(si, ji, subj) {
  const entry  = marksData[si][ji] !== undefined ? marksData[si][ji] : { internal: '', external: '' };
  // Use correct grade function based on subject type
  const grade  = subj.internalOnly ? getGradeForInternalOnly(entry, subj) : getGrade(entry, subj);
  const filled = isFilled(entry);
  const isAudit = subj.audit;
  const maxM  = getMaxMarks(subj);
  const total  = getTotal(entry);

  let effectiveTotalVal = total;

  let typeBadge = 'badge-theory';
  if (subj.type === 'Practical') typeBadge = 'badge-practical';
  if (subj.type === 'Elective') typeBadge = 'badge-elective';
  if (subj.type === 'Audit') typeBadge = 'badge-audit';

  let electiveSel = '';
  if (subj.options) {
    const chosen = electiveChoices[si][ji] || '';
    electiveSel = `
      <select class="elective-select" onchange="setElective(${si},${ji},this.value)">
        <option value="">Select Subject…</option>
        ${subj.options.map(o => `<option value="${o}" ${chosen === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    `;
  }

  const gradeCls  = grade ? grade.cls : '';
  const gradeText = grade ? grade.grade : '–';
  // Show grace-adjusted total if E# (so card displays graced total, not raw total)
  const effTotalVal = getEffectiveTotal(entry, subj);
  const dispTotal = effTotalVal;
  const effCredits = getEffectiveCredits(entry, subj);
  let creditsLabel;
  if (grade && grade.grade === 'E#') {
    creditsLabel = `Credits: <span style="color:#fb923c;font-weight:700;">${subj.credits}</span> <span style="color:#fb923c;">(E# Grace Pass — 0 grade pts, ${subj.credits}cr in GPA denominator)</span>`;
  } else if (grade && grade.grade === 'F') {
    creditsLabel = `Credits: ${subj.credits} <span style="color:#ef4444;font-weight:700;">(F — 0 pts, counts in GPA)</span>`;
  } else {
    creditsLabel = `Credits: ${subj.credits}`;
  }
  const totalDisp = dispTotal !== null
    ? `<span class="marks-total-disp" id="total-${si}-${ji}">${dispTotal}/100${grade && grade.grade === 'E#' ? ' <span style="font-size:0.65rem;color:#fb923c;font-weight:700;vertical-align:middle;">★grace</span>' : ''}</span>`
    : `<span class="marks-total-disp marks-total-empty" id="total-${si}-${ji}">–/100</span>`;

  // ── AUDIT SUBJECTS → single CA field (does NOT count for CGPA) ──
  if (isAudit) {
    const auditVal = typeof entry === 'object' ? (entry.internal || entry.external || '') : (entry || '');
    return `
      <div class="subject-card ${filled ? 'filled' : ''}" id="card-${si}-${ji}">
        <div class="subj-top">
          <span class="subj-code">${subj.code}</span>
          <span class="subj-type-badge badge-audit">Audit</span>
        </div>
        <div class="subj-name">${subj.name}</div>
        <div class="subj-credits">Audit Course — marks recorded but does not affect CGPA</div>
        <div class="marks-row">
          <input
            class="marks-input"
            type="number" min="0" max="100" step="0.5"
            placeholder="CA Marks (0–100)"
            value="${auditVal}"
            oninput="setMarks(${si},${ji},'internal',this.value)"
            id="inp-${si}-${ji}-i"
          />
          <div class="grade-pill ${gradeCls}" id="grade-${si}-${ji}">${gradeText}</div>
        </div>
      </div>
    `;
  }

  // ── INTERNAL-ONLY PRACTICALS (counts for CGPA) ──
  // BCS753 Project-I: internal only, out of 150
  // BCS851 Project-II: internal/100 + external/350 (total /450)
  // All others: internal only, out of 100
  if (subj.internalOnly) {
    const maxM = getMaxMarks(subj);
    // BCS851: split internal+external
    if (subj.code === 'BCS851') {
      const intVal851 = typeof entry === 'object' ? (entry.internal || '') : '';
      const extVal851 = typeof entry === 'object' ? (entry.external || '') : '';
      const intNum851 = parseFloat(intVal851);
      const extNum851 = parseFloat(extVal851);
      const total851  = (!isNaN(intNum851) || !isNaN(extNum851))
        ? (isNaN(intNum851) ? 0 : intNum851) + (isNaN(extNum851) ? 0 : extNum851) : NaN;
      const pct851    = !isNaN(total851) ? (total851 / 450) * 100 : NaN;
      const gradeObj851 = !isNaN(pct851)
        ? (GRADING.find(g => pct851 >= g.min && pct851 <= g.max) || GRADING[GRADING.length - 1])
        : null;
      const dispTotal851 = !isNaN(total851)
        ? `<span class="marks-total-disp" id="total-${si}-${ji}">${total851}/450</span>`
        : `<span class="marks-total-disp marks-total-empty" id="total-${si}-${ji}">–/450</span>`;
      const isCls851 = gradeObj851 ? gradeObj851.cls : '';
      const isTxt851 = gradeObj851 ? gradeObj851.grade : '–';
      const isFilled851 = intVal851 !== '' || extVal851 !== '';
      return `
        <div class="subject-card ${isFilled851 ? 'filled' : ''}" id="card-${si}-${ji}">
          <div class="subj-top">
            <span class="subj-code">${subj.code}</span>
            <span class="subj-type-badge badge-practical">Practical</span>
          </div>
          <div class="subj-name">${subj.name}</div>
          <div class="subj-credits" id="credits-label-${si}-${ji}">Credits: ${subj.credits} <span style="color:var(--text-dim);font-size:0.72rem;">(Internal /100 + External /350)</span></div>
          <div class="marks-row" style="flex-wrap:wrap;gap:6px;">
            <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              <label class="marks-split-label">Internal <span class="marks-max-hint">/ 100</span></label>
              <input class="marks-input" type="number" min="0" max="100" step="0.5"
                placeholder="0–100" value="${intVal851}"
                oninput="setMarks(${si},${ji},'internal',this.value)" id="inp-${si}-${ji}-i"/>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              <label class="marks-split-label">External <span class="marks-max-hint">/ 350</span></label>
              <input class="marks-input" type="number" min="0" max="350" step="0.5"
                placeholder="0–350" value="${extVal851}"
                oninput="setMarks(${si},${ji},'external',this.value)" id="inp-${si}-${ji}-e"/>
            </div>
            ${dispTotal851}
            <div class="grade-pill ${isCls851}" id="grade-${si}-${ji}">${isTxt851}</div>
          </div>
        </div>
      `;
    }
    // BCS753 Project-I: internal only, out of 150
    const ioMax   = maxM.internal; // 150 for BCS753, 100 for others
    const ioLabel = subj.code === 'BCS753' ? 'Internal only — out of 150' : 'Internal only — out of 100';
    const ioVal   = typeof entry === 'object' ? (entry.internal || '') : (entry || '');
    const ioTotal = parseFloat(ioVal);
    const ioDisp  = !isNaN(ioTotal)
      ? `<span class="marks-total-disp" id="total-${si}-${ji}">${ioTotal}/${ioMax}</span>`
      : `<span class="marks-total-disp marks-total-empty" id="total-${si}-${ji}">–/${ioMax}</span>`;
    const ioGradeObj = getGradeForInternalOnly({ internal: ioVal }, subj);
    const ioCls  = ioGradeObj ? ioGradeObj.cls  : '';
    const ioText = ioGradeObj ? ioGradeObj.grade : '–';
    return `
      <div class="subject-card ${ioVal !== '' ? 'filled' : ''}" id="card-${si}-${ji}">
        <div class="subj-top">
          <span class="subj-code">${subj.code}</span>
          <span class="subj-type-badge badge-practical">Practical</span>
        </div>
        <div class="subj-name">${subj.name}</div>
        <div class="subj-credits" id="credits-label-${si}-${ji}">Credits: ${subj.credits} <span style="color:var(--text-dim);font-size:0.72rem;">(${ioLabel})</span></div>
        <div class="marks-row">
          <input
            class="marks-input"
            type="number" min="0" max="${ioMax}" step="0.5"
            placeholder="Marks (0–${ioMax})"
            value="${ioVal}"
            oninput="setMarks(${si},${ji},'internal',this.value)"
            id="inp-${si}-${ji}-i"
          />
          ${ioDisp}
          <div class="grade-pill ${ioCls}" id="grade-${si}-${ji}">${ioText}</div>
        </div>
      </div>
    `;
  }

  // ── NORMAL SUBJECTS → internal + external inputs ──
  const intVal = typeof entry === 'object' ? (entry.internal || '') : '';
  const extVal = typeof entry === 'object' ? (entry.external || '') : (entry || '');

  // Back paper section — only show when subject has a back (original grade is F or E#)
  // E# = grace pass (0 pts, full credits in denom), F = fail (0 pts, full credits in denom). Both eligible for back.
  let backPaperSection = '';
  const isBackEligible = (subj.type === 'Theory' || subj.type === 'Elective')
    && grade && (grade.grade === 'F' || grade.grade === 'E#');

  if (isBackEligible) {
    const backVal = (backData[si] && backData[si][ji] !== undefined) ? backData[si][ji] : '';
    const backNum = parseFloat(backVal);
    let backResultHtml = '';
    if (!isNaN(backNum) && backVal !== '') {
      const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
      const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) };
      // Back paper grade: NO grace applies — back is a fresh attempt, grade by normal table only
      const backGrade = getGradeNoGrace(backEntry);
      const backTotal = (isNaN(internal) ? 0 : internal) + backNum;
      const bgCls = backGrade ? backGrade.cls : '';
      const gradeHtml = `<div class="grade-pill ${bgCls}" style="font-size:0.7rem;padding:2px 7px;">${backGrade ? backGrade.grade : '–'}</div>`;
      const deltaOrig = grade ? grade.points : 0;
      const deltaBack = backGrade ? backGrade.points : 0;
      const deltaStr = deltaBack > deltaOrig
        ? `<span style="color:#10b981;font-size:0.68rem;font-weight:700;">▲ +${deltaBack - deltaOrig} pts</span>`
        : deltaBack === deltaOrig
        ? `<span style="color:#94a3b8;font-size:0.68rem;">= same</span>`
        : `<span style="color:#ef4444;font-size:0.68rem;">▼ ${deltaBack - deltaOrig} pts</span>`;
      // Credits note for back result
      let creditsNote = '';
      if (backGrade && backGrade.grade === 'F') {
        creditsNote = `<span style="color:#ef4444;font-size:0.67rem;font-weight:700;">0 credits</span>`;
      } else if (backGrade) {
        creditsNote = `<span style="color:#10b981;font-size:0.67rem;font-weight:700;">${subj.credits}cr</span>`;
      }
      backResultHtml = `${gradeHtml}${deltaStr}<span style="color:var(--text-dim);font-size:0.68rem;">(${backTotal}/100)</span>${creditsNote}`;
    }
    backPaperSection = `
      <div class="back-paper-row" id="back-row-${si}-${ji}">
        <div class="back-paper-label">
          <span class="back-paper-icon">📋</span>
          <span>Back Paper <span style="color:var(--text-dim);font-size:0.7rem;">(enter back ext. /70)</span></span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <input
            class="marks-input marks-input-back"
            type="number" min="0" max="70" step="0.5"
            placeholder="0–70"
            value="${backVal}"
            oninput="setBackMarks(${si},${ji},this.value)"
            id="back-${si}-${ji}"
          />
          <div class="back-result-wrap" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">${backResultHtml}</div>
        </div>
      </div>`;
  }

  return `
    <div class="subject-card ${filled ? 'filled' : ''}" id="card-${si}-${ji}">
      <div class="subj-top">
        <span class="subj-code">${subj.code}</span>
        <span class="subj-type-badge ${typeBadge}">${subj.type}</span>
      </div>
      <div class="subj-name">${subj.name}</div>
      <div class="subj-credits" id="credits-label-${si}-${ji}">${creditsLabel}</div>
      ${electiveSel}
      <div class="marks-split-row">
        <div class="marks-split-field">
          <label class="marks-split-label">Internal <span class="marks-max-hint">/ ${maxM.internal}</span></label>
          <input
            class="marks-input marks-input-split"
            type="number" min="0" max="${maxM.internal}" step="0.5"
            placeholder="0–${maxM.internal}"
            value="${intVal}"
            oninput="setMarks(${si},${ji},'internal',this.value)"
            id="inp-${si}-${ji}-i"
          />
        </div>
        <div class="marks-split-field">
          <label class="marks-split-label">External <span class="marks-max-hint">/ ${maxM.external}</span></label>
          <input
            class="marks-input marks-input-split"
            type="number" min="0" max="${maxM.external}" step="0.5"
            placeholder="0–${maxM.external}"
            value="${extVal}"
            oninput="setMarks(${si},${ji},'external',this.value)"
            id="inp-${si}-${ji}-e"
          />
        </div>
        <div class="marks-split-result">
          ${totalDisp}
          <div class="grade-pill ${gradeCls}" id="grade-${si}-${ji}">${gradeText}</div>
        </div>
      </div>
      ${backPaperSection}
    </div>
  `;
}

// ========================
// MARKS & CALCULATIONS
// ========================
function setAudit(si, ji, val) {
  marksData[si][ji] = val;
  saveData();

  // Update button states
  const pBtn = document.getElementById(`audit-p-${si}-${ji}`);
  const fBtn = document.getElementById(`audit-f-${si}-${ji}`);
  const status = document.getElementById(`audit-status-${si}-${ji}`);
  const card = document.getElementById(`card-${si}-${ji}`);

  if (pBtn) pBtn.className = 'audit-pf-btn' + (val === 'P' ? ' audit-pass-active' : '');
  if (fBtn) fBtn.className = 'audit-pf-btn' + (val === 'F' ? ' audit-fail-active' : '');
  if (status) {
    status.textContent = val === 'P' ? 'Status: PASS' : val === 'F' ? 'Status: FAIL' : 'Not marked yet';
    status.style.color = val === 'P' ? '#10b981' : val === 'F' ? '#ef4444' : '#64748b';
  }
  if (card) card.classList.toggle('filled', val !== '');
  updatePanels();
}

function setMarks(si, ji, field, val) {
  // Ensure entry is an object
  if (!marksData[si][ji] || typeof marksData[si][ji] !== 'object') {
    marksData[si][ji] = { internal: '', external: '' };
  }

  const subj = SEMESTERS[si].subjects[ji];
  const maxM = getMaxMarks(subj);

  // Validate range
  const num = parseFloat(val);
  const maxField = field === 'internal' ? maxM.internal : maxM.external;
  if (!isNaN(num) && num > maxField) {
    // Clamp and update input visually
    val = String(maxField);
    const inputEl = document.getElementById(`inp-${si}-${ji}-${field === 'internal' ? 'i' : 'e'}`);
    if (inputEl) inputEl.value = val;
  }

  marksData[si][ji][field] = val;
  saveData();

  const entry   = marksData[si][ji];
  const total   = getTotal(entry);
  const grade   = getGrade(entry, subj);
  const effTotal = getEffectiveTotal(entry, subj);
  const gradePill  = document.getElementById(`grade-${si}-${ji}`);
  const totalDisp  = document.getElementById(`total-${si}-${ji}`);
  const card       = document.getElementById(`card-${si}-${ji}`);

  // ── internalOnly: grade & total based on subject type ──
  if (subj.internalOnly) {
    const ioGrade = getGradeForInternalOnly(entry, subj);
    if (gradePill) {
      gradePill.className = 'grade-pill ' + (ioGrade ? ioGrade.cls : '');
      gradePill.textContent = ioGrade ? ioGrade.grade : '–';
    }
    if (totalDisp) {
      if (subj.code === 'BCS851') {
        const intV = parseFloat(entry.internal), extV = parseFloat(entry.external);
        const tot  = (!isNaN(intV) || !isNaN(extV)) ? (isNaN(intV)?0:intV)+(isNaN(extV)?0:extV) : NaN;
        totalDisp.textContent = !isNaN(tot) ? `${tot}/450` : '–/450';
        totalDisp.className   = 'marks-total-disp' + (isNaN(tot) ? ' marks-total-empty' : '');
      } else if (subj.code === 'BCS753') {
        const ioVal = parseFloat(entry.internal);
        totalDisp.textContent = !isNaN(ioVal) ? `${ioVal}/150` : '–/150';
        totalDisp.className   = 'marks-total-disp' + (isNaN(ioVal) ? ' marks-total-empty' : '');
      } else {
        const ioVal = parseFloat(entry.internal);
        totalDisp.textContent = !isNaN(ioVal) ? `${ioVal}/100` : '–/100';
        totalDisp.className   = 'marks-total-disp' + (isNaN(ioVal) ? ' marks-total-empty' : '');
      }
    }
    if (card) {
      const anyFilled = subj.code === 'BCS851'
        ? (entry.internal !== '' || entry.external !== '')
        : entry.internal !== '';
      card.classList.toggle('filled', anyFilled);
    }
    const sgpa   = calcSGPA(currentSem);
    const inline = document.getElementById('live-sgpa-inline');
    if (inline) inline.textContent = sgpa.toFixed(2);
    updatePanels();
    return;
  }

  if (gradePill) {
    gradePill.className = 'grade-pill ' + (grade ? grade.cls : '');
    gradePill.textContent = grade ? grade.grade : '–';
  }
  if (totalDisp) {
    const dispVal = effTotal !== null ? effTotal : total;
    if (dispVal !== null) {
      const graceTag = (grade && grade.grade === 'E#')
        ? ' <span style="font-size:0.65rem;color:#fb923c;font-weight:700;vertical-align:middle;">★grace</span>'
        : '';
      totalDisp.innerHTML = `${dispVal}/100${graceTag}`;
      totalDisp.className = 'marks-total-disp';
    } else {
      totalDisp.textContent = '–/100';
      totalDisp.className   = 'marks-total-disp marks-total-empty';
    }
  }

  // Update credits label live
  const creditsEl = document.getElementById(`credits-label-${si}-${ji}`);
  if (creditsEl) {
    if (grade && grade.grade === 'E#') {
      creditsEl.innerHTML = `Credits: <span style="color:#fb923c;font-weight:700;">${subj.credits}</span> <span style="color:#fb923c;">(E# Grace Pass — 0 grade pts, ${subj.credits}cr in GPA denominator)</span>`;
    } else if (grade && grade.grade === 'F') {
      creditsEl.innerHTML = `Credits: ${subj.credits} <span style="color:#ef4444;font-weight:700;">(F — 0 pts, counts in GPA)</span>`;
    } else {
      creditsEl.innerHTML = `Credits: ${subj.credits}`;
    }
  }

  if (card) card.classList.toggle('filled', isFilled(entry));

  // Show/hide back paper row based on whether grade is now F or E#
  const backRow = document.getElementById(`back-row-${si}-${ji}`);
  const card2 = document.getElementById(`card-${si}-${ji}`);
  if (subj.type === 'Theory' || subj.type === 'Elective') {
    const isBackEligible = grade && (grade.grade === 'F' || grade.grade === 'E#');
    if (isBackEligible && !backRow) {
      // Need to add back paper row — re-render the card
      const cardEl = document.getElementById(`card-${si}-${ji}`);
      if (cardEl) {
        const newCardHtml = renderSubjectCard(si, ji, subj);
        const tmp = document.createElement('div');
        tmp.innerHTML = newCardHtml;
        cardEl.replaceWith(tmp.firstElementChild);
      }
    } else if (!isBackEligible && backRow) {
      // Remove back row and clear back data for this subject
      backData[si][ji] = '';
      saveData();
      backRow.remove();
    }
  }

  const sgpa   = calcSGPA(si);
  const inline = document.getElementById('live-sgpa-inline');
  if (inline) inline.textContent = sgpa.toFixed(2);

  updatePanels();
}

function setElective(si, ji, val) {
  electiveChoices[si][ji] = val;
  saveData();
}

function setBackMarks(si, ji, val) {
  if (!backData[si]) backData[si] = {};
  const subj = SEMESTERS[si].subjects[ji];
  const maxExt = 70; // theory external max
  const num = parseFloat(val);
  if (!isNaN(num) && num > maxExt) {
    val = String(maxExt);
    const el = document.getElementById(`back-${si}-${ji}`);
    if (el) el.value = val;
  }
  backData[si][ji] = val;
  saveData();

  // Live update back paper result
  const entry = marksData[si][ji];
  const backNum = parseFloat(val);
  const backRow = document.getElementById(`back-row-${si}-${ji}`);
  if (backRow) {
    let backResultHtml = '';
    if (!isNaN(backNum) && val !== '') {
      const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
      const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) };
      const backGrade = getGradeNoGrace(backEntry);   // no grace on back paper
      const backTotal = (isNaN(internal) ? 0 : internal) + backNum;
      const origGrade = getGrade(entry, subj);
      const bgCls = backGrade ? backGrade.cls : '';
      const gradeHtml = `<div class="grade-pill ${bgCls}" style="font-size:0.7rem;padding:2px 7px;">${backGrade ? backGrade.grade : '–'}</div>`;
      const deltaOrig = origGrade ? origGrade.points : 0;
      const deltaBack = backGrade ? backGrade.points : 0;
      const deltaStr = deltaBack > deltaOrig
        ? `<span style="color:#10b981;font-size:0.68rem;font-weight:700;">▲ +${deltaBack - deltaOrig} pts</span>`
        : deltaBack === deltaOrig
        ? `<span style="color:#94a3b8;font-size:0.68rem;">= same</span>`
        : `<span style="color:#ef4444;font-size:0.68rem;">▼ ${deltaBack - deltaOrig} pts</span>`;
      const backCr = getBackCredits(backGrade, subj);
      const creditsNote = backGrade && backGrade.grade === 'F'
        ? `<span style="color:#ef4444;font-size:0.67rem;font-weight:700;">${subj.credits}cr (0 pts)</span>`
        : backGrade ? `<span style="color:#10b981;font-size:0.67rem;font-weight:700;">${subj.credits}cr</span>` : '';
      backResultHtml = `${gradeHtml}${deltaStr}<span style="color:var(--text-dim);font-size:0.68rem;">(${backTotal}/100)</span>${creditsNote}`;
    }
    const resultWrap = backRow.querySelector('.back-result-wrap');
    if (resultWrap) resultWrap.innerHTML = backResultHtml;
  }

  // Update sem header SGPA badges live
  const { sgpa: sgpaBack, hasAnyBack } = calcSGPAWithBack(si);
  const sgpa = calcSGPA(si);
  const inlineEl = document.getElementById('live-sgpa-inline');
  if (inlineEl) inlineEl.textContent = sgpa.toFixed(2);

  // Update AFTER BACK badge
  const backInlineEl = document.getElementById('live-sgpa-back-inline');
  const badgesRow = document.querySelector('.sgpa-badges-row');
  if (badgesRow) {
    // Remove existing back elements cleanly
    badgesRow.querySelectorAll('.sgpa-arrow-sep, .live-sgpa-back-mini, .back-sgpa-delta').forEach(el => el.remove());
    if (hasAnyBack) {
      const arrow = document.createElement('div');
      arrow.className = 'sgpa-arrow-sep';
      arrow.textContent = '→';
      const backMini = document.createElement('div');
      backMini.className = 'live-sgpa-mini live-sgpa-back-mini';
      backMini.title = 'SGPA after back paper clearance';
      backMini.innerHTML = `<span class="live-sgpa-label" style="color:#10b981;">AFTER BACK</span><span class="live-sgpa-val" style="color:#10b981;" id="live-sgpa-back-inline">${sgpaBack.toFixed(2)}</span>`;
      const delta = document.createElement('span');
      delta.className = 'back-sgpa-delta';
      delta.textContent = `▲ +${(sgpaBack - sgpa).toFixed(2)}`;
      badgesRow.appendChild(arrow);
      badgesRow.appendChild(backMini);
      badgesRow.appendChild(delta);
    }
  }

  updatePanels();
}

// Returns true only if every non-audit subject in the semester has marks entered.
// Used to distinguish a fully-entered semester from a partial one in the CGPA bars.
function isSemComplete(si) {
  const sem = SEMESTERS[si];
  return sem.subjects.every((subj, ji) => {
    if (subj.audit || subj.credits === 0) return true;
    const entry = marksData[si][ji];
    return isFilled(entry);
  });
}

function calcSGPA(si) {
  const sem = SEMESTERS[si];
  let totalPoints = 0, totalCredits = 0;

  sem.subjects.forEach((subj, ji) => {
    if (subj.audit || subj.credits === 0) return;
    const entry = marksData[si][ji];
    const grade = subj.internalOnly ? getGradeForInternalOnly(entry, subj) : getGrade(entry, subj);
    if (grade === null) return; // no marks entered yet
    const effCredits = getEffectiveCredits(entry, subj);
    totalPoints  += getEffectivePoints(grade) * effCredits;
    totalCredits += effCredits;
  });

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}

// Calculates SGPA using back paper marks where available
// AKTU back paper rules:
//   - No grace applies in back paper (fresh attempt, normal grading table)
//   - Pass grade → full subject credits restored
//   - F grade   → 0 credits, subject excluded from SGPA calculation entirely
function calcSGPAWithBack(si) {
  const sem = SEMESTERS[si];
  let totalPoints = 0, totalCredits = 0;
  let hasAnyBack = false;

  sem.subjects.forEach((subj, ji) => {
    if (subj.audit || subj.credits === 0) return;
    const entry = marksData[si][ji];
    const backExt = backData[si] && backData[si][ji];
    const backNum = parseFloat(backExt);

    let gradeToUse, creditsToUse;

    if (!isNaN(backNum) && backExt !== '' && (subj.type === 'Theory' || subj.type === 'Elective')) {
      // Only apply back paper if the ORIGINAL grade was F or E# (fail/grace pass).
      // Stale backData values for passing subjects (D, E, C, …) must be ignored.
      const origGrade = getGrade(entry, subj);
      const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
      if (origIsFailOrGrace) {
        hasAnyBack = true;
        const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
        const effectiveEntry = {
          internal: isNaN(internal) ? '' : String(internal),
          external: String(backNum)
        };
        // No grace on back paper
        gradeToUse = getGradeNoGrace(effectiveEntry);
        creditsToUse = getBackCredits(gradeToUse, subj); // always full credits
      } else {
        // Original grade was passing — ignore stale back data, use original grade
        gradeToUse = origGrade;
        creditsToUse = getEffectiveCredits(entry, subj);
      }
    } else if (subj.internalOnly) {
      gradeToUse = getGradeForInternalOnly(entry, subj);
      creditsToUse = getEffectiveCredits(entry, subj);
    } else {
      gradeToUse = getGrade(entry, subj);
      creditsToUse = getEffectiveCredits(entry, subj);
    }

    // Sem 5 (si=4), BCDS551/BCS552 Lab (ji=7): got F in 2025-26 back session
    // This practical's failure is not captured in backData (which only stores theory back marks)
    // so we override it here to reflect the actual university result (SGPA 5.61 not 5.91)
    if (si === 4 && ji === 7 && gradeToUse !== null && gradeToUse.grade !== 'F') {
      // Only apply override if the main subject marks have been entered (sem is active)
      const anyBackTheory = sem.subjects.some((s2, j2) => {
        const bv = backData[si] && backData[si][j2];
        return bv !== '' && bv !== undefined && !isNaN(parseFloat(bv));
      });
      if (anyBackTheory) {
        hasAnyBack = true;
        gradeToUse = GRADING[GRADING.length - 1]; // F — lab failed in back session
        creditsToUse = subj.credits;
      }
    }

    // F and E# → 0 pts but full credits still in denominator; null (no marks) → skip
    if (gradeToUse !== null) {
      totalPoints  += getEffectivePoints(gradeToUse) * creditsToUse;
      totalCredits += creditsToUse;
    }
  });

  return { sgpa: totalCredits > 0 ? totalPoints / totalCredits : 0, hasAnyBack };
}

// Check if any VALID back paper data exists for a semester.
// "Valid" = back data exists AND original grade was F or E# (eligible for back).
function semHasBackData(si) {
  const sem = SEMESTERS[si];
  return sem.subjects.some((subj, ji) => {
    if (subj.audit || subj.type === 'Practical') return false;
    const b = backData[si] && backData[si][ji];
    if (b === '' || b === undefined || isNaN(parseFloat(b))) return false;
    // Only count if original grade was F or E#
    const entry = marksData[si] && marksData[si][ji];
    const origGrade = subj.internalOnly ? getGradeForInternalOnly(entry, subj) : getGrade(entry, subj);
    return origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
  });
}

// CGPA using back marks where entered
// Same rules: no grace on back paper, F = 0 credits excluded from denominator
function calcCGPAWithBack() {
  let totalPoints = 0, totalCredits = 0;
  let hasAnyBack = false;

  SEMESTERS.forEach((sem, si) => {
    // Only include fully-entered semesters in CGPA
    if (!isSemComplete(si)) return;
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit || subj.credits === 0) return;
      const entry = marksData[si][ji];
      const backExt = backData[si] && backData[si][ji];
      const backNum = parseFloat(backExt);
      let gradeToUse, creditsToUse;

      if (!isNaN(backNum) && backExt !== '' && (subj.type === 'Theory' || subj.type === 'Elective')) {
        // Only apply back paper if original grade was F or E# — ignore stale back data for passing subjects
        const origGrade = getGrade(entry, subj);
        const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
        if (origIsFailOrGrace) {
          hasAnyBack = true;
          const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
          const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) };
          gradeToUse = getGradeNoGrace(backEntry);
          creditsToUse = getBackCredits(gradeToUse, subj);
        } else {
          gradeToUse = origGrade;
          creditsToUse = getEffectiveCredits(entry, subj);
        }
      } else if (subj.internalOnly) {
        gradeToUse = getGradeForInternalOnly(entry, subj);
        creditsToUse = getEffectiveCredits(entry, subj);
      } else {
        gradeToUse = getGrade(entry, subj);
        creditsToUse = getEffectiveCredits(entry, subj);
      }

      if (gradeToUse !== null) {
        totalPoints  += getEffectivePoints(gradeToUse) * creditsToUse;
        totalCredits += creditsToUse;
      }
    });
  });

  return { cgpa: totalCredits > 0 ? totalPoints / totalCredits : 0, hasAnyBack };
}

function calcAllSGPAs() {
  return SEMESTERS.map((_, si) => calcSGPA(si));
}

function calcCGPA() {
  // AKTU correct formula:
  // CGPA = Σ(grade_points × credits) across ALL semesters ÷ Σ(credits)
  // VERIFIED rule: F and E# → 0 grade points, full credits always in denominator.
  let totalPoints = 0;
  let totalCredits = 0;

  SEMESTERS.forEach((sem, si) => {
    // Only include fully-entered semesters in CGPA to avoid skewed partial results
    if (!isSemComplete(si)) return;
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit || subj.credits === 0) return;
      const entry = marksData[si][ji];
      const grade = subj.internalOnly ? getGradeForInternalOnly(entry, subj) : getGrade(entry, subj);
      if (grade === null) return;
      const effCredits = getEffectiveCredits(entry, subj);
      totalPoints  += getEffectivePoints(grade) * effCredits;
      totalCredits += effCredits;
    });
  });

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}

// ========================
// PANEL UPDATES
// ========================
function updatePanels() {
  const sgpa = calcSGPA(currentSem);
  const cgpa = calcCGPA();
  const allSGPAs = calcAllSGPAs();
  const { sgpa: sgpaBack, hasAnyBack: semHasBack } = calcSGPAWithBack(currentSem);
  const { cgpa: cgpaBack, hasAnyBack: globalHasBack } = calcCGPAWithBack();

  // Display the "effective" SGPA — if back exists & improves, use back for gauge
  const displaySGPA = (semHasBack && sgpaBack > sgpa) ? sgpaBack : sgpa;

  // Gauge
  const pct = displaySGPA / 10;
  const circumference = 232.5; // matches new r=37 SVG
  const offset = circumference - (pct * circumference);
  document.getElementById('gauge-fill').style.strokeDashoffset = offset;
  document.getElementById('panel-sgpa').textContent = displaySGPA.toFixed(2);
  const sgpaBigEl = document.getElementById('panel-sgpa-big');
  if (sgpaBigEl) sgpaBigEl.textContent = displaySGPA.toFixed(2);

  // If back data changes SGPA, show "↑ orig: X.XX" in dedicated slot below gauge
  const panelSgpaNoteEl = document.getElementById('panel-sgpa-back-note');
  if (panelSgpaNoteEl) {
    if (semHasBack && sgpaBack !== sgpa) {
      panelSgpaNoteEl.textContent = `↑ orig: ${sgpa.toFixed(2)}`;
      panelSgpaNoteEl.style.display = 'block';
    } else {
      panelSgpaNoteEl.style.display = 'none';
    }
  }

  const grade = GRADING.find(g => displaySGPA * 10 >= g.min) || GRADING[GRADING.length - 1];
  const gradeForSGPA = displaySGPA === 0 ? '–' : grade.grade;
  document.getElementById('panel-grade').textContent = gradeForSGPA;

  // CGPA — show back-improved value if available
  const displayCGPA = (globalHasBack && cgpaBack > cgpa) ? cgpaBack : cgpa;
  document.getElementById('panel-cgpa').textContent = displayCGPA.toFixed(2);
  document.getElementById('fc-cgpa').textContent = displayCGPA.toFixed(2);

  // Rank badge
  const rankEl = document.getElementById('cgpa-rank-badge');
  if (rankEl) {
    if (displayCGPA === 0) { rankEl.textContent = '–'; }
    else if (displayCGPA >= 9.5) { rankEl.textContent = 'S+'; rankEl.style.color = '#06b6d4'; }
    else if (displayCGPA >= 9.0) { rankEl.textContent = 'S'; rankEl.style.color = '#06b6d4'; }
    else if (displayCGPA >= 8.5) { rankEl.textContent = 'A+'; rankEl.style.color = '#8b5cf6'; }
    else if (displayCGPA >= 8.0) { rankEl.textContent = 'A'; rankEl.style.color = '#8b5cf6'; }
    else if (displayCGPA >= 7.0) { rankEl.textContent = 'B+'; rankEl.style.color = '#10b981'; }
    else if (displayCGPA >= 6.0) { rankEl.textContent = 'B'; rankEl.style.color = '#f59e0b'; }
    else { rankEl.textContent = 'C'; rankEl.style.color = '#ef4444'; }
  }

  // Auto-refresh planner if a value is already typed
  const plannerInput = document.getElementById('target-cgpa-input');
  if (plannerInput && plannerInput.value) calcTargetSGPA();

  // Add back note under CGPA if changed — uses dedicated slot in HTML
  const panelCgpaNoteEl = document.getElementById('panel-cgpa-back-note');
  if (panelCgpaNoteEl) {
    if (globalHasBack && cgpaBack !== cgpa) {
      panelCgpaNoteEl.textContent = `↑ orig: ${cgpa.toFixed(2)}`;
      panelCgpaNoteEl.style.display = 'block';
    } else {
      panelCgpaNoteEl.style.display = 'none';
    }
  }

  // Sem bars — show both original and back SGPAs
  // Only show a numeric SGPA for semesters where ALL subjects have been entered.
  // Partial entry would show a misleading value; show '–' instead.
  const semBars = document.getElementById('sem-bars');
  semBars.innerHTML = allSGPAs.map((s, i) => {
    const complete = isSemComplete(i);
    const { sgpa: sBack, hasAnyBack } = calcSGPAWithBack(i);
    const showBack = complete && hasAnyBack && sBack !== s;
    const displayVal = showBack ? sBack : s;
    const showVal = complete && displayVal > 0;
    return `
    <div class="sem-item">
      <span class="sem-label">Sem ${i + 1}</span>
      <div class="sem-bar-wrap">
        <div class="sem-bar" style="width:${showVal ? displayVal / 10 * 100 : 0}%"></div>
        ${showBack ? `<div class="sem-bar sem-bar-back" style="width:${sBack / 10 * 100}%"></div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
        <span class="sem-val">${showVal ? displayVal.toFixed(2) : '–'}</span>
        ${showBack ? `<span class="sem-val-back" title="Original SGPA before back">was ${s.toFixed(2)}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  // Insights
  updateInsights(displaySGPA, displayCGPA, allSGPAs);
  updatePictograph();
}

function updateInsights(sgpa, cgpa, allSGPAs) {
  const list = document.getElementById('insight-list');
  const insights = [];

  const filledSems = allSGPAs.filter(s => s > 0).length;

  if (filledSems === 0) {
    list.innerHTML = `<div class="insight-item"><div class="insight-dot" style="background:#64748b"></div>Enter marks to see your performance insights…</div>`;
    return;
  }

  if (cgpa >= 9) insights.push({ color: '#06b6d4', msg: '🏆 Outstanding performer! You are on track for distinction.' });
  else if (cgpa >= 8) insights.push({ color: '#8b5cf6', msg: '⭐ Excellent! Maintain this pace for a great final CGPA.' });
  else if (cgpa >= 7) insights.push({ color: '#10b981', msg: '✅ Good standing. Target 80+ in remaining subjects to improve CGPA.' });
  else if (cgpa >= 6) insights.push({ color: '#f59e0b', msg: '⚠️ Average performance. Focus on core subjects for improvement.' });
  else insights.push({ color: '#ef4444', msg: '🚨 Below average. Please seek academic support.' });

  if (sgpa > 0 && sgpa < cgpa - 0.3) insights.push({ color: '#ef4444', msg: '📉 Current semester SGPA is lower than your CGPA. Pick up the pace!' });
  if (sgpa > 0 && sgpa > cgpa + 0.3) insights.push({ color: '#10b981', msg: '📈 Current semester SGPA is higher than average — great improvement!' });

  if (filledSems === 8) insights.push({ color: '#06b6d4', msg: `🎓 All 8 semesters complete! Final CGPA: ${cgpa.toFixed(2)}` });

  list.innerHTML = insights.map(i => `
    <div class="insight-item">
      <div class="insight-dot" style="background:${i.color}"></div>
      ${i.msg}
    </div>
  `).join('');
}

// ========================
// SAVE / LOAD  (Supabase-backed)
// ========================
function saveData() {
  // Keep localStorage as fast local cache
  localStorage.setItem('aktu_marks', JSON.stringify({ marks: marksData, electives: electiveChoices, back: backData }));
  // Also persist to Supabase in background (Step 7)
  saveMarksToDB();
}

async function saveMarksToDB() {
  const { data: { user } } = await _sb.auth.getUser();
  if (!user) return; // not logged in yet

  // Flatten marksData into rows per subject
  const rows = [];
  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      const entry = marksData[si] && marksData[si][ji];
      if (!entry) return;
      const internal_marks = entry.internal !== '' ? parseInt(entry.internal) : null;
      const external_marks = entry.external !== '' ? parseInt(entry.external) : null;
      if (internal_marks === null && external_marks === null) return; // skip empty
      const total = (internal_marks || 0) + (external_marks || 0);
      const gradeObj = subj.internalOnly
        ? getGradeForInternalOnly(entry, subj)
        : getGrade(entry, subj);
      rows.push({
        user_id:       user.id,
        semester:      sem.sem,
        subject_code:  subj.code,
        subject_name:  subj.name,
        internal_marks,
        external_marks,
        total,
        grade:         gradeObj ? gradeObj.grade : null,
      });
    });
  });

  if (rows.length === 0) return;

  // Upsert all rows (delete old + insert fresh is simplest for this schema)
  await _sb.from('marks').delete().eq('user_id', user.id);
  const { error } = await _sb.from('marks').insert(rows);
  if (error) console.error('Supabase save error:', error);

  // Also snapshot CGPA summary for admin analytics
  gwSnapshotMarks();
}

// Step 8 — Load marks from Supabase on login
async function loadMarksFromDB() {
  const { data: { user } } = await _sb.auth.getUser();
  if (!user) return;

  const { data, error } = await _sb
    .from('marks')
    .select('*')
    .eq('user_id', user.id);

  if (error || !data || data.length === 0) return;

  // Map DB rows back into marksData
  data.forEach(row => {
    const si = SEMESTERS.findIndex(s => s.sem === row.semester);
    if (si < 0) return;
    const ji = SEMESTERS[si].subjects.findIndex(s => s.code === row.subject_code);
    if (ji < 0) return;
    if (!marksData[si]) marksData[si] = {};
    marksData[si][ji] = {
      internal: row.internal_marks !== null ? String(row.internal_marks) : '',
      external: row.external_marks !== null ? String(row.external_marks) : '',
    };
  });

  // Also update localStorage cache
  localStorage.setItem('aktu_marks', JSON.stringify({ marks: marksData, electives: electiveChoices, back: backData }));
  console.log('✅ Marks loaded from Supabase:', data.length, 'rows');
}

// ════════════════════════════════════════
// ANALYSER — OPEN / CLOSE / RUN
// ════════════════════════════════════════
function openAnalyser() {
  ['appPage','dashboardPage','resourcesPage','internshipsPage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  document.getElementById('analyserPage').classList.add('active');
  window.scrollTo(0,0);
  runAnalysis();
}

function closeAnalyser() {
  document.getElementById('analyserPage').classList.remove('active');
  document.getElementById('dashboardPage').classList.add('active');
  refreshDashboard();
  window.scrollTo(0,0);
}

// Fixed thresholds — cannot be changed by user
function getThreshold(credits) {
  if (credits >= 4) return 70;
  if (credits === 3) return 65;
  if (credits === 2) return 60;
  return 60; // default for 1 credit or any other case
}

function runAnalysis() {
  const weak = [], border = [];
  let strongCount = 0;

  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit || subj.credits === 0) return;
      const entry = marksData[si] && marksData[si][ji];
      const t = getTotal(entry);
      if (t === null || t === undefined) return;
      const m = t;
      if (isNaN(m)) return;

      const thresh = getThreshold(subj.credits);
      const gap = m - thresh;

      // Resolve actual subject name & code for slash-type subjects
      let resolvedSubj = { ...subj };
      if (subj.code && subj.code.includes('/') && !subj.options) {
        // Since applyGroupToSemesters() already resolved Physics/Chemistry subjects
        // into single-code subjects, this branch only handles other slash subjects.
        const chosenName = electiveChoices[si] && electiveChoices[si][ji];
        const codes = subj.code.split('/').map(c => c.trim());
        const names = subj.name.split('/').map(n => n.trim());
        if (chosenName) {
          const choiceIdx = names.findIndex(n => chosenName.includes(n) || n.includes(chosenName.split(' ')[0]));
          resolvedSubj = { ...subj,
            name: choiceIdx >= 0 ? names[choiceIdx] : names[0],
            code: choiceIdx >= 0 ? codes[choiceIdx] : codes[0]
          };
        } else {
          // No choice — use first part (already resolved for Phy/Chem by group)
          resolvedSubj = { ...subj, name: names[0], code: codes[0] };
        }
      } else if (subj.options) {
        // Dept elective dropdown — use chosen option
        const chosen = electiveChoices[si] && electiveChoices[si][ji];
        if (chosen) {
          const parts = chosen.split(' - ');
          resolvedSubj = { ...subj,
            code: parts[0] ? parts[0].trim() : subj.code,
            name: parts[1] ? parts[1].trim() : chosen
          };
        }
      }

      if (gap < 0)       weak.push({ subj: resolvedSubj, si, ji, marks:m, thresh, gap, status:'weak' });
      else if (gap <= 5) border.push({ subj: resolvedSubj, si, ji, marks:m, thresh, gap, status:'border' });
      else               strongCount++;
    });
  });

  const all = [...weak.sort((a,b)=>a.gap-b.gap), ...border];

  // Potential CGPA gain
  let cgpaGain = 0;
  const totalCr = SEMESTERS.reduce((a,sem)=>a+sem.subjects.reduce((b,s)=>b+(s.audit?0:s.credits),0),0);
  weak.forEach(s => {
    const cg = getGrade(s.marks), tg = getGrade(s.thresh+1);
    if (cg && tg) cgpaGain += (tg.points - cg.points) * s.subj.credits;
  });

  document.getElementById('as-weak').textContent   = weak.length;
  document.getElementById('as-border').textContent = border.length;
  document.getElementById('as-strong').textContent = strongCount;
  document.getElementById('as-gain').textContent   = '+' + (totalCr > 0 ? (cgpaGain/totalCr).toFixed(2) : '0.00');

  const container = document.getElementById('analyser-cards');
  const titleEl   = document.getElementById('weak-title');

  if (all.length === 0) {
    titleEl.textContent = strongCount > 0 ? '✅ All Subjects Above Threshold' : '📊 No Marks Entered Yet';
    container.innerHTML = strongCount > 0
      ? '<div class="no-weak-msg">🎉 All entered subjects are above your minimum thresholds! Keep it up.</div>'
      : '<div class="no-weak-msg" style="color:var(--text-muted)">⬅️ Please enter your marks in the calculator first, then come back here to see your analysis.</div>';
    return;
  }

  titleEl.textContent = `📉 ${all.length} Subject${all.length>1?'s':''} Need${all.length===1?'s':''} Your Attention`;
  container.innerHTML = all.map((item,idx) => buildWeakCard(item,idx)).join('');
}

// ════════════════════════════════════════
// SUBJECT KNOWLEDGE BASE
// ════════════════════════════════════════
// ═══════════════════════════════════════════════
// SUBJECT KNOWLEDGE BASE (from AKTU Official Syllabus PDF)
// ═══════════════════════════════════════════════
const SUBJECT_KB = {

  // ═══ SEMESTER I ═══
  'BAS101': {
    name: 'Engineering Physics',
    importance: 'Engineering Physics builds your understanding of how the physical world works at a fundamental level. For CSE students, it directly connects to semiconductor physics (transistors, chips), fiber optic communication, laser technology, and quantum computing — the foundations of every electronic device your software runs on.',
    whyMatters: ['Semiconductor physics explains how CPUs and transistors work', 'Fiber optics and lasers power internet communication', 'Quantum mechanics is the foundation of quantum computing', 'Superconductors and nanomaterials drive next-gen electronics'],
    units: [
      { title: 'Unit I — Quantum Mechanics', short: 'Wave-Particle Duality, Schrodinger',
        topics: ['Inadequacy of classical mechanics, Planck theory of black body radiation', 'Compton effect, de-Broglie concept of matter waves', 'Davisson and Germer Experiment', 'Phase velocity and group velocity', 'Time-dependent and time-independent Schrodinger wave equations', 'Physical interpretation of wave function, Particle in a one-dimensional box'],
        query: 'Quantum+Mechanics+Engineering+Physics+BTech+Schrodinger+equation+AKTU' },
      { title: 'Unit II — Electromagnetic Field Theory', short: 'Maxwell Equations, EM Waves',
        topics: ['Stokes theorem and Divergence theorem', 'Basic laws of electricity and magnetism, Continuity equation', 'Displacement current, Maxwell equations (integral and differential form)', 'Maxwell equations in vacuum and conducting medium', 'Poynting vector and Poynting theorem', 'Plane electromagnetic waves, skin depth'],
        query: 'Maxwell+Equations+Electromagnetic+Field+Theory+Engineering+Physics+BTech' },
      { title: 'Unit III — Wave Optics', short: 'Interference, Diffraction, Grating',
        topics: ['Coherent sources, Interference in thin films (uniform and wedge-shaped)', 'Newton\'s Rings and applications', 'Fraunhoffer diffraction at single slit and double slit, Absent spectra', 'Diffraction grating, Dispersive power, Resolving power', 'Rayleigh criterion of resolution, Resolving power of grating'],
        query: 'Wave+Optics+Interference+Diffraction+Grating+Engineering+Physics+BTech' },
      { title: 'Unit IV — Fiber Optics & Laser', short: 'Optical Fiber, Laser Types',
        topics: ['Fiber Optics: Acceptance angle, Numerical aperture, Step/Graded index fibers', 'Fiber optic communication, Attenuation, Dispersion', 'Laser: Spontaneous and stimulated emission, Population inversion', 'Einstein coefficients, Ruby laser and He-Ne laser', 'Laser applications in communication and medicine'],
        query: 'Fiber+Optics+Laser+Engineering+Physics+BTech+AKTU+numerical+aperture' },
      { title: 'Unit V — Superconductors & Nanomaterials', short: 'Superconductors, Nano',
        topics: ['Superconductors: Meissner effect, Critical field, Persistent current', 'Type I and Type II superconductors, High temperature superconductors', 'Nanomaterials: Quantum Dots, Quantum wires, Quantum well', 'Fabrication: CVD (Top-Down) and Sol Gel (Bottom-Up) approaches', 'Properties and applications of nanomaterials, Carbon Nano Tubes (CNT)'],
        query: 'Superconductors+Nanomaterials+Quantum+Dots+Engineering+Physics+BTech' },
    ],
    tips: [
      { h: 'Formula Sheet Daily', d: '<strong>Make a one-page formula sheet</strong> and revise it every day — 60% of marks come from formula-based numericals.' },
      { h: 'Draw All Diagrams', d: '<strong>Draw ray diagrams, crystal structures, energy band diagrams</strong> — examiners give extra marks for neat labeled diagrams.' },
      { h: 'Solve PYQs', d: '<strong>Solve last 5 years AKTU Physics papers</strong> — 70% of questions repeat each year with slight number changes.' },
      { h: 'Link Lab to Theory', d: '<strong>Connect each practical to theory</strong> — Newton Rings experiment links to interference, it deepens understanding.' },
    ],
  },

  'BAS102': {
    name: 'Engineering Chemistry',
    importance: 'Engineering Chemistry gives CSE students understanding of materials at molecular level. From batteries in laptops to corrosion in servers, from polymers in circuit boards to nanomaterials in chips — chemistry underpins all hardware your software runs on.',
    whyMatters: ['Battery chemistry powers laptops, phones, EVs — all computing devices', 'Polymers used in PCBs, cables, and insulation of electronics', 'Nanomaterials and CNTs are foundation of next-gen chip fabrication', 'Water treatment chemistry is used in data center cooling systems'],
    units: [
      { title: 'Unit I — Molecular Structure & Advanced Materials', short: 'Nanomaterials, Green Chem',
        topics: ['Molecular orbitals of diatomic molecules, Bond order, Magnetic characters', 'Liquid Crystals: types and applications (LCDs use liquid crystals)', 'Graphite and Fullerene: structure and applications', 'Nanomaterials: preparation, Carbon Nanotubes (CNT)', 'Green Chemistry: 12 principles, synthesis of Adipic acid and Paracetamol'],
        query: 'Engineering+Chemistry+Nanomaterials+Liquid+Crystals+Fullerene+BTech+AKTU' },
      { title: 'Unit II — Spectroscopy & Stereochemistry', short: 'UV, IR, NMR, Isomerism',
        topics: ['UV spectroscopy: principles and simple applications', 'IR spectroscopy: functional group identification', 'NMR spectroscopy: elementary idea and applications', 'Stereochemistry: optical isomerism, geometrical isomerism, chiral drugs'],
        query: 'Spectroscopy+UV+IR+NMR+Stereochemistry+Engineering+Chemistry+BTech' },
      { title: 'Unit III — Electrochemistry, Batteries & Corrosion', short: 'Batteries, Corrosion',
        topics: ['Electrochemistry basics, Primary cells (Dry cell), Secondary cells (Lead acid battery)', 'Corrosion: types, causes, prevention and control methods', 'Corrosion in power generation, chemical, oil & gas industries', 'Cement: constituents, manufacturing, hardening and setting', 'Plaster of Paris (POP)'],
        query: 'Electrochemistry+Batteries+Corrosion+Engineering+Chemistry+BTech+AKTU' },
      { title: 'Unit IV — Water Technology & Fuels', short: 'Water Hardness, Calorific Values',
        topics: ['Water: sources, impurities, hardness (temporary/permanent)', 'Water softening: Lime-Soda, Zeolite, Ion Exchange, Reverse Osmosis', 'Determination of hardness and alkalinity, Numerical problems', 'Fuels: Calorific value, Bomb Calorimeter, Dulong method', 'Coal: proximate and ultimate analysis, ranking of coal'],
        query: 'Water+Technology+Hardness+Fuels+Calorific+Value+Engineering+Chemistry+BTech' },
      { title: 'Unit V — Polymers & Organometallic Compounds', short: 'Polymers, Applications',
        topics: ['Polymers: classification, polymerization processes', 'Thermosetting vs Thermoplastic polymers', 'Conducting and biodegradable polymers', 'Important polymers: Teflon, Nylon, Bakelite, Kevlar, Dacron, Buna-N, Buna-S', 'Organometallic compounds: RMgX (Grignard), LiAlH4'],
        query: 'Polymers+Polymerization+Engineering+Chemistry+Teflon+Nylon+BTech+AKTU' },
    ],
    tips: [
      { h: 'Numerical Problems', d: '<strong>Practice water hardness and calorific value numericals daily</strong> — they appear in every AKTU Chemistry exam.' },
      { h: 'Reactions & Equations', d: '<strong>Write balanced chemical equations</strong> for all reactions — marks deducted for wrong equations.' },
      { h: 'Application Focus', d: '<strong>For each topic, note one real-life application</strong> — examiners award marks for relevant examples.' },
      { h: 'PYQ Practice', d: '<strong>Solve AKTU last 5 years Chemistry papers</strong> — 65% questions repeat.' },
    ],
  },

  'BAS103': {
    name: 'Engineering Mathematics-I',
    importance: 'Engineering Mathematics I is the universal language of engineering computation. Matrices power AI and ML algorithms, vector calculus describes electromagnetic fields, and differential calculus is used in optimization algorithms across all of software engineering and data science.',
    whyMatters: ['Matrices and eigenvalues are the core of Machine Learning (PCA, SVD)', 'Vector calculus used in graphics, simulations, and physics engines', 'Differential calculus essential for gradient descent in AI training', 'Multiple integration used in probability distributions and statistics'],
    units: [
      { title: 'Unit I — Matrices', short: 'Eigenvalues, Cayley-Hamilton',
        topics: ['Elementary transformations, Inverse of matrix, Rank of matrix', 'Solution of system of linear equations (Gauss elimination)', 'Characteristic equation, Cayley-Hamilton theorem and application', 'Linear Dependence and Independence of vectors', 'Eigen values and Eigen vectors', 'Complex Matrices: Hermitian, Skew-Hermitian, Unitary'],
        query: 'Matrices+Eigenvalues+Cayley+Hamilton+Engineering+Mathematics+BTech+AKTU' },
      { title: 'Unit II — Differential Calculus I', short: 'Successive Diff, Euler Theorem',
        topics: ['Successive differentiation (nth order derivatives), Leibnitz theorem', 'Curve tracing in Cartesian and polar coordinates', 'Partial derivatives, Euler theorem for homogeneous functions', 'Total derivative, Change of variables'],
        query: 'Differential+Calculus+Leibnitz+Euler+Theorem+Engineering+Mathematics+BTech' },
      { title: 'Unit III — Differential Calculus II', short: 'Taylor, Maxima/Minima, Jacobians',
        topics: ['Taylor series and Maclaurin series for one and two variables', 'Maxima and Minima of functions of several variables', 'Lagrange method of multipliers', 'Jacobians and change of variables', 'Approximation of errors'],
        query: 'Taylor+Series+Maxima+Minima+Lagrange+Jacobian+Engineering+Mathematics+BTech' },
      { title: 'Unit IV — Multiple Integration', short: 'Double/Triple Integrals, Beta/Gamma',
        topics: ['Double integral, Triple integral', 'Change of order of integration, Change of variables', 'Beta and Gamma functions and their properties', 'Dirichlet integral and application to area and volume', 'Liouville extension of Dirichlet integral'],
        query: 'Multiple+Integration+Double+Triple+Beta+Gamma+Dirichlet+BTech+Mathematics' },
      { title: 'Unit V — Vector Calculus', short: 'Gradient, Divergence, Stokes, Gauss',
        topics: ['Vector differentiation: Gradient, Curl, Divergence — physical interpretation', 'Directional derivatives', 'Vector Integration: Line integral, Surface integral, Volume integral', 'Gauss Divergence theorem, Green theorem, Stokes theorem (without proof)', 'Applications to engineering problems'],
        query: 'Vector+Calculus+Gradient+Divergence+Stokes+Gauss+Green+Engineering+Maths' },
    ],
    tips: [
      { h: 'Practice Daily', d: '<strong>Solve minimum 10 problems every day</strong> — Mathematics improves only through consistent daily practice, never by reading.' },
      { h: 'B.S. Grewal Book', d: 'Follow <strong>B.S. Grewal Higher Engineering Mathematics</strong> exclusively — it is perfectly aligned with AKTU Maths I syllabus.' },
      { h: 'All Derivations', d: '<strong>Learn every standard derivation</strong> — AKTU theory asks 2-3 derivations in every paper.' },
      { h: 'Unit by Unit', d: '<strong>Complete one full unit per week</strong> — do not mix topics, master one before moving next.' },
    ],
  },

  'BAS203': {
    name: 'Engineering Mathematics-II',
    importance: 'Engineering Mathematics II introduces Laplace transforms used in signal processing, Fourier series used in audio/image compression, and complex variable theory used in control systems. These are directly applicable in DSP, telecommunications, and advanced computer graphics.',
    whyMatters: ['Laplace transform used in signal processing and control systems', 'Fourier series/transform used in JPEG, MP3 compression algorithms', 'Complex variables used in electrical circuit analysis', 'ODE solutions model physical systems in simulations and games'],
    units: [
      { title: 'Unit I — Ordinary Differential Equations', short: 'ODE, Cauchy-Euler',
        topics: ['Linear ODE of nth order with constant coefficients', 'Simultaneous linear differential equations', 'Second order ODE with variable coefficients: changing independent variable', 'Method of variation of parameters', 'Cauchy-Euler equation, engineering applications'],
        query: 'Ordinary+Differential+Equations+nth+order+Cauchy+Euler+Engineering+Maths+BTech' },
      { title: 'Unit II — Laplace Transform', short: 'Laplace, Inverse, Convolution',
        topics: ['Laplace transform definition, existence theorem', 'Properties: linearity, shifting, scaling', 'Laplace of derivatives and integrals', 'Unit step function, periodic function Laplace', 'Inverse Laplace transform, Convolution theorem', 'Solving ODEs and simultaneous DEs using Laplace'],
        query: 'Laplace+Transform+Inverse+Laplace+Convolution+Engineering+Mathematics+BTech' },
      { title: 'Unit III — Sequence, Series & Fourier', short: 'Convergence, Fourier Series',
        topics: ['Convergence of series: Ratio test, D Alembert test, Raabe test, Comparison test', 'Fourier series: definition, Euler coefficients', 'Half range Fourier sine and cosine series', 'Applications of Fourier series'],
        query: 'Fourier+Series+Convergence+Tests+Engineering+Mathematics+BTech+AKTU' },
      { title: 'Unit IV — Complex Variable (Differentiation)', short: 'Analytic Functions, CR Equations',
        topics: ['Functions of complex variable, continuity, differentiability', 'Analytic functions, Cauchy-Riemann equations (Cartesian and Polar)', 'Harmonic functions, Milne Thompson method', 'Conformal mapping, Mobius transformation'],
        query: 'Complex+Variable+Analytic+Functions+Cauchy+Riemann+Engineering+Mathematics' },
      { title: 'Unit V — Complex Variable (Integration)', short: 'Cauchy Theorem, Residues',
        topics: ['Complex integration, Cauchy integral theorem', 'Cauchy integral formula', 'Taylor series and Laurent series', 'Singularities: removable, poles, essential', 'Residues, Cauchy Residue theorem and applications'],
        query: 'Complex+Integration+Cauchy+Residue+Theorem+Taylor+Laurent+Engineering+Maths' },
    ],
    tips: [
      { h: 'Laplace Tables', d: '<strong>Memorize the standard Laplace transform table</strong> — at least 15 pairs are essential for solving exam problems quickly.' },
      { h: 'Fourier Formulas', d: '<strong>Learn Euler coefficient formulas by heart</strong> and practice computing them for at least 5 different functions.' },
      { h: 'CR Equations', d: '<strong>Practice checking analyticity using CR equations</strong> for 3-4 functions daily — common 5-mark question in AKTU.' },
      { h: 'Residue Method', d: '<strong>Master Cauchy Residue theorem for evaluating real integrals</strong> — appears as a 10-mark question every year.' },
    ],
  },

  'BEE101': {
    name: 'Fundamentals of Electrical Engineering',
    importance: 'Electrical Engineering fundamentals help CSE students understand how hardware actually works — from the power supply in your laptop to the motors in robots and IoT sensors. This subject is critical for embedded systems, IoT, and understanding the physical layer of all computing systems.',
    whyMatters: ['Power supply circuits in every computing device use EE concepts', 'IoT devices require understanding of sensors and actuators', 'Data center power management and UPS systems', 'Understanding hardware-software interface for embedded systems'],
    units: [
      { title: 'Unit I — DC Circuits', short: 'KVL, KCL, Network Analysis',
        topics: ['Electrical circuit elements: R, L, C — active and passive', 'Voltage and current sources, linearity, unilateral/bilateral elements', 'Kirchhoff Voltage Law (KVL) and Current Law (KCL)', 'Mesh analysis and nodal analysis', 'Network theorems: Thevenin, Norton, Superposition'],
        query: 'DC+Circuits+KVL+KCL+Thevenin+Norton+Fundamentals+Electrical+Engineering+BTech' },
      { title: 'Unit II — AC Circuits', short: 'Phasors, Resonance, Power Factor',
        topics: ['Representation of sinusoidal waveforms, RMS and average values', 'Analysis of R-L-C circuits (series and parallel)', 'Apparent, active and reactive power, Power factor', 'Resonance in series and parallel circuits, bandwidth, quality factor', 'Three phase balanced circuits, star and delta connections'],
        query: 'AC+Circuits+Phasors+Resonance+Power+Factor+Electrical+Engineering+BTech+AKTU' },
      { title: 'Unit III — Transformers', short: 'Transformer Theory, Efficiency',
        topics: ['Magnetic circuits, ideal and practical transformer', 'Equivalent circuit of transformer', 'Losses in transformers: copper loss, core loss', 'Voltage regulation and efficiency', 'Numerical problems on transformers'],
        query: 'Transformer+Equivalent+Circuit+Efficiency+Electrical+Engineering+BTech+AKTU' },
      { title: 'Unit IV — Electrical Machines', short: 'DC Motors, Induction Motor',
        topics: ['DC machines: principle, construction, EMF equation of generator', 'Torque equation of DC motor, applications', 'Three phase induction motor: principle, slip-torque characteristics', 'Single phase induction motor: starting methods', 'Synchronous machines: alternator and synchronous motor'],
        query: 'DC+Motor+Induction+Motor+Electrical+Machines+BTech+AKTU+slip+torque' },
      { title: 'Unit V — Electrical Installations', short: 'MCB, ELCB, Earthing',
        topics: ['Switch Fuse Unit (SFU), MCB, ELCB, MCCB, ACB — types and uses', 'Types of wires, cables, and bus-bars', 'Earthing: types and importance, lightning protection', 'Types of batteries: lead acid, lithium, alkaline'],
        query: 'Electrical+Installations+MCB+ELCB+Earthing+BTech+AKTU+safety' },
    ],
    tips: [
      { h: 'Circuit Diagrams', d: '<strong>Draw every circuit diagram neatly with all components labeled</strong> — examiners give marks even if calculation is slightly wrong.' },
      { h: 'KVL/KCL Numericals', d: '<strong>Solve 5 mesh/nodal analysis problems daily</strong> — they appear in every AKTU EE exam.' },
      { h: 'Transformer Numericals', d: '<strong>Practice efficiency, regulation, and loss calculations</strong> — guaranteed numerical question every year.' },
      { h: 'Thevenin & Norton', d: '<strong>Master Thevenin and Norton equivalent circuit theorem</strong> — appears every AKTU exam as a 10-mark problem.' },
    ],
  },

  'BEC101': {
    name: 'Fundamentals of Electronics Engineering',
    importance: 'Electronics Engineering introduces the hardware building blocks of all digital systems — diodes, transistors, op-amps, and digital logic gates. Every microprocessor, every chip, every circuit your software eventually runs on is built from these fundamental components.',
    whyMatters: ['Diodes and transistors are inside every CPU and memory chip', 'Op-amps are in sensors and analog-to-digital converters for IoT', 'Digital logic gates are the foundation of all computer hardware', 'Communication fundamentals explain how the internet physically works'],
    units: [
      { title: 'Unit I — Semiconductor Diode & Applications', short: 'Diode, Rectifier, Zener',
        topics: ['Semiconductor diode: depletion layer, V-I characteristics, ideal/practical', 'Zener diode: Zener and avalanche breakdown mechanisms', 'Rectification: half wave and full wave rectifiers, efficiency', 'Clippers, clampers, Zener shunt regulator', 'Special devices: LED, Photodiode, Varactor, Tunnel diode'],
        query: 'Semiconductor+Diode+Rectifier+Zener+Electronics+Engineering+BTech+AKTU' },
      { title: 'Unit II — BJT & FET', short: 'Transistor, MOSFET, JFET',
        topics: ['BJT: construction, operation, amplification action', 'Common Base, Common Emitter, Common Collector configurations', 'FET: JFET construction and V-I characteristics', 'MOSFET: Depletion and Enhancement type, Transfer characteristics'],
        query: 'BJT+FET+MOSFET+Transistor+Electronics+Engineering+BTech+AKTU' },
      { title: 'Unit III — Operational Amplifiers', short: 'Op-Amp, Inverting, Integrator',
        topics: ['Op-Amp basics: ideal vs practical, CMRR, Slew rate', 'Inverting and Non-inverting amplifier, Unity follower', 'Summing amplifier, Integrator, Differentiator', 'Comparators, Differential mode vs Common mode operation'],
        query: 'Operational+Amplifier+Op+Amp+Inverting+Integrator+Electronics+BTech+AKTU' },
      { title: 'Unit IV — Digital Electronics', short: 'Number Systems, Logic Gates, K-Map',
        topics: ['Number systems: binary, octal, hexadecimal — conversions', 'Binary arithmetic: addition, subtraction, multiplication', 'Basic gates: AND, OR, NOT, NAND, NOR, XOR, XNOR', 'Boolean algebra, simplification of Boolean functions', 'K-Map minimization up to 6 variables'],
        query: 'Digital+Electronics+Logic+Gates+Boolean+Algebra+K+Map+BTech+AKTU' },
      { title: 'Unit V — Communication Engineering', short: 'Modulation, Wireless, Cellular',
        topics: ['Signal representation, electromagnetic spectrum', 'Elements of communication system, need for modulation', 'Amplitude modulation (AM) and demodulation', 'Wireless communication: cellular systems, generations (2G/3G/4G/5G)', 'Satellite and radar communication fundamentals'],
        query: 'Communication+Engineering+Modulation+AM+FM+Wireless+BTech+AKTU' },
    ],
    tips: [
      { h: 'Diode Circuits', d: '<strong>Draw and analyze rectifier circuits</strong> with waveforms — examiners expect input/output waveform sketches.' },
      { h: 'Transistor Configurations', d: '<strong>Memorize characteristics of all 3 BJT configurations</strong> — comparison table is a guaranteed question.' },
      { h: 'K-Map Practice', d: '<strong>Practice K-Map minimization daily</strong> — 2, 3, 4 variable maps appear in every AKTU exam.' },
      { h: 'Boolean Algebra', d: '<strong>Practice Boolean expression simplification</strong> using both Boolean algebra and K-Maps — both methods should be known.' },
    ],
  },

  'BCS101': {
    name: 'Programming for Problem Solving',
    importance: 'Programming for Problem Solving is your first step into the world of software development. C language teaches you how a computer actually executes code — memory management, logic flow, and data structures. Every programming language you learn after this builds on exactly these concepts.',
    whyMatters: ['Foundation for all future programming courses (Java, Python, DSA)', 'Pointers in C are used in OS, embedded systems, and compilers', 'Problem-solving logic from C directly helps in placement tests', 'Most competitive programming starts with C/C++ fundamentals'],
    units: [
      { title: 'Unit I — Computer Basics & C Intro', short: 'Computer Org, C Basics',
        topics: ['Components of computer: memory, processor, I/O, storage', 'OS, compiler, interpreter, assembler, loader, linker concepts', 'Algorithm representation: flowchart, pseudocode', 'Structure of C program, syntax and logical errors', 'Data types, variables, memory, storage classes in C'],
        query: 'C+Programming+Basics+Computer+Fundamentals+BTech+AKTU+first+year' },
      { title: 'Unit II — Operators & Conditional Branching', short: 'Operators, if-else, switch',
        topics: ['Arithmetic, relational, logical, bitwise, assignment operators', 'Operator precedence and associativity', 'Type conversion, mixed operands', 'if, else-if, nested if-else statements', 'switch statement, break, goto, continue'],
        query: 'C+Programming+Operators+Conditional+Branching+if+else+switch+BTech' },
      { title: 'Unit III — Loops & Arrays', short: 'Loops, Arrays, Strings, Structures',
        topics: ['while, do-while, for loops — use cases and differences', 'Multiple loop variables, nested loops', 'Arrays: 1D and 2D, manipulation of elements', 'Character arrays and strings, string functions', 'Structures, unions, enumerated data types', 'Array of structures, passing arrays to functions'],
        query: 'C+Programming+Loops+Arrays+Strings+Structures+BTech+AKTU' },
      { title: 'Unit IV — Functions & Searching/Sorting', short: 'Functions, Recursion, Algorithms',
        topics: ['Functions: definition, types, call by value vs call by reference', 'Recursive functions — factorial, Fibonacci, binary search', 'Passing parameters to functions, scope of variables', 'Linear search and binary search implementation', 'Bubble sort, insertion sort, selection sort algorithms'],
        query: 'C+Programming+Functions+Recursion+Searching+Sorting+BTech+AKTU' },
      { title: 'Unit V — Pointers & File Handling', short: 'Pointers, Dynamic Memory, Files',
        topics: ['Pointers: declaration, initialization, pointer arithmetic', 'Dynamic memory allocation: malloc, calloc, realloc, free', 'String functions and pointer to strings', 'Self-referential structures, notion of linked list', 'File I/O: fopen, fclose, fread, fwrite, fprintf, fscanf'],
        query: 'C+Programming+Pointers+Dynamic+Memory+File+Handling+BTech+AKTU' },
    ],
    tips: [
      { h: 'Code Every Day', d: '<strong>Write at least one complete program daily</strong> — programming is a skill not theory, it only improves with practice.' },
      { h: 'Trace on Paper', d: '<strong>Trace code by hand on paper</strong> step by step before running — builds deep understanding of execution flow.' },
      { h: 'Master Pointers', d: '<strong>Draw memory diagrams for every pointer program</strong> — pointer questions are hardest and most rewarding in practicals.' },
      { h: 'HackerRank Practice', d: '<strong>Solve 5 problems on HackerRank C domain daily</strong> — AKTU practical exams test live coding speed.' },
    ],
  },

  // ═══ SEMESTER III (already in KB) ═══
  'BCS301': {
    name: 'Data Structure',
    importance: 'Data Structures is THE most important subject of your entire CSE degree. Every software system — databases, operating systems, compilers, search engines — is built on efficient data structures. It is also the most heavily tested topic in every campus placement interview at Google, Amazon, Microsoft, and Flipkart.',
    whyMatters: ['Most asked topic in all FAANG placement interviews', 'Operating systems use queues, trees, graphs internally', 'Databases use B-trees and hash tables for fast indexing', 'Compilers use stacks for expression parsing and code generation'],
    units: [
      { title: 'Unit I — Intro, Arrays & Linked Lists', short: 'Arrays, Linked Lists, Complexity',
        topics: ['Basic Terminology, Algorithm efficiency, Time/Space Complexity', 'Big-O, Big-Theta, Big-Omega notations, Abstract Data Types (ADT)', 'Arrays: 1D/2D, Row/Column Major Order, Index formulae, Sparse matrices', 'Singly, Doubly, Circular Linked Lists — Insertion, Deletion, Traversal', 'Polynomial representation and arithmetic using linked lists'],
        query: 'Arrays+Linked+List+Data+Structures+AKTU+BTech+complexity+analysis' },
      { title: 'Unit II — Stack, Queue, Hashing & Searching', short: 'Stack, Queue, Hash',
        topics: ['Stack: Push/Pop, Array and Linked implementation', 'Prefix, Postfix, Infix conversions, Evaluation of postfix', 'Recursion: tail recursion, removal — Fibonacci, Hanoi, Binary Search', 'Queue: Circular Queue, Dequeue, Priority Queue', 'Searching: Sequential, Binary Search', 'Hashing: hash functions, collision resolution (chaining, open addressing)'],
        query: 'Stack+Queue+Hashing+Data+Structures+BTech+AKTU+infix+postfix' },
      { title: 'Unit III — Sorting Algorithms', short: 'All Sorting Methods',
        topics: ['Bubble sort, Selection sort, Insertion sort', 'Quick sort: partition algorithm, time complexity analysis', 'Merge sort: divide and conquer, stable sorting', 'Heap sort: building heap, heapify process', 'Radix sort: non-comparative sorting', 'Time/Space complexity comparison of all sorting algorithms'],
        query: 'Sorting+Algorithms+Quick+Merge+Heap+Radix+Sort+Data+Structures+BTech' },
      { title: 'Unit IV — Trees', short: 'BST, AVL, Heap, Huffman',
        topics: ['Binary Tree: array and linked representation', 'BST: insertion, deletion, search, modification', 'Traversals: Inorder, Preorder, Postorder — construction from traversals', 'Threaded Binary Trees, traversal of threaded trees', 'Huffman Coding using binary tree', 'AVL Tree, B-Tree, Binary Heaps — concept and basic operations'],
        query: 'Trees+BST+AVL+Huffman+Binary+Tree+Traversal+Data+Structures+BTech+AKTU' },
      { title: 'Unit V — Graphs', short: 'BFS, DFS, Dijkstra, Kruskal',
        topics: ['Graph terminology, directed and undirected graphs', 'Representations: Adjacency Matrix, Adjacency List', 'Graph Traversal: BFS and DFS algorithms', 'Connected Components, Spanning Trees', 'Minimum Cost Spanning Trees: Prim and Kruskal algorithms', 'Shortest Path: Warshall and Dijkstra algorithms'],
        query: 'Graphs+BFS+DFS+Dijkstra+Kruskal+Prim+Shortest+Path+Data+Structures+BTech' },
    ],
    tips: [
      { h: 'Draw Before Code', d: '<strong>Draw every data structure on paper</strong> before writing code — never code trees or graphs without a diagram.' },
      { h: 'Implement from Scratch', d: '<strong>Code every structure without any library</strong> — AKTU practicals test raw implementation from memory.' },
      { h: 'Complexity Always', d: '<strong>Write time AND space complexity</strong> for every algorithm — this alone can earn 5 easy marks in theory.' },
      { h: 'PYQ Practice', d: '<strong>Solve AKTU DSA last 5 years papers</strong> — question patterns are very predictable for this subject.' },
    ],
  },

  'BCS302': {
    name: 'Computer Organization and Architecture',
    importance: 'COA explains how a computer works at the hardware level — from logic gates to memory hierarchy. Understanding COA helps write faster, cache-friendly code, explains performance bottlenecks, and is a core GATE topic with high marks. Every embedded system developer needs this knowledge.',
    whyMatters: ['Cache-friendly code runs 10x faster — COA explains why', 'Pipelining knowledge is used in compiler optimization', 'Core GATE topic — always 8-10 marks in exam', 'Foundation for embedded systems and hardware design'],
    units: [
      { title: 'Unit I — Digital Systems & Processor Org', short: 'Buses, Addressing Modes',
        topics: ['Functional units and interconnections, Bus architecture, types of buses', 'Bus arbitration: daisy chain, centralized, distributed', 'Register, bus and memory transfer', 'Processor organization: general registers, stack organization', 'Addressing modes: immediate, direct, indirect, register, indexed'],
        query: 'Computer+Organization+Buses+Addressing+Modes+Processor+COA+BTech+AKTU' },
      { title: 'Unit II — ALU Design', short: 'Adders, Booth Algorithm, IEEE 754',
        topics: ['Look-ahead carry adders (faster addition)', 'Signed operand multiplication, Booth algorithm', 'Array multiplier design', 'Division and logic operations', 'Floating point arithmetic, ALU design', 'IEEE 754 Standard for floating point numbers'],
        query: 'ALU+Booth+Algorithm+IEEE+754+Floating+Point+COA+BTech+AKTU' },
      { title: 'Unit III — Control Unit & Pipelining', short: 'Pipelining, RISC/CISC',
        topics: ['Instruction types, formats, instruction cycles (fetch-decode-execute)', 'Micro-operations, execution of complete instruction', 'RISC vs CISC architecture comparison', 'Pipelining: stages, speedup, data/control/structural hazards', 'Hardwired vs Microprogrammed control', 'Horizontal vs Vertical microprogramming'],
        query: 'Pipelining+RISC+CISC+Control+Unit+Instruction+Cycle+COA+BTech+AKTU' },
      { title: 'Unit IV — Memory Organization', short: 'Cache, Virtual Memory, Paging',
        topics: ['Memory hierarchy: registers, cache, RAM, disk', 'Cache memory: concept, design, address mapping techniques', 'Direct, Associative, Set-Associative mapping — with numericals', 'Cache replacement policies: LRU, FIFO, Optimal', 'Virtual memory: demand paging, page replacement algorithms'],
        query: 'Cache+Memory+Virtual+Memory+Paging+COA+BTech+AKTU+direct+associative' },
      { title: 'Unit V — Input/Output & Interrupts', short: 'I/O, DMA, Interrupts',
        topics: ['Peripheral devices, I/O interface, I/O ports', 'Interrupts: hardware, types (maskable/non-maskable), ISR', 'Modes of data transfer: Programmed I/O, Interrupt-driven I/O, DMA', 'I/O channels and processors', 'Serial Communication: synchronous and asynchronous', 'Standard communication interfaces'],
        query: 'IO+DMA+Interrupts+Input+Output+Serial+Communication+COA+BTech+AKTU' },
    ],
    tips: [
      { h: 'Number Conversions', d: '<strong>Practice 10 binary/hex/octal conversion problems daily</strong> — always in AKTU COA exam for easy marks.' },
      { h: 'Pipeline Diagrams', d: '<strong>Draw Gantt-style timing diagrams</strong> for pipelining numericals — standard question format in AKTU.' },
      { h: 'Cache Mapping Problems', d: '<strong>Solve all 3 cache mapping techniques with numericals</strong> — direct, associative, set-associative appear every year.' },
      { h: 'Morris Mano Book', d: 'Follow <strong>Computer System Architecture by Morris Mano</strong> — perfectly aligned with AKTU COA syllabus.' },
    ],
  },

  'BCS303': {
    name: 'Discrete Structures & Theory of Logic',
    importance: 'Discrete Structures is the mathematical backbone of computer science. Graph theory, logic, and set theory are used in algorithm design, network routing, database query optimization, compiler construction, and cryptography. Without it you cannot understand automata theory or advanced algorithms.',
    whyMatters: ['Graph theory powers network routing (Dijkstra, Kruskal) algorithms', 'Logic is the basis of Boolean circuits and programming conditions', 'Set theory used in database relational algebra operations', 'Combinatorics used in algorithm complexity analysis and cryptography'],
    units: [
      { title: 'Unit I — Set Theory & Relations', short: 'Sets, POSET, Lattice',
        topics: ['Sets: definition, types, operations, combination of sets', 'Relations: definition, operations, properties — reflexive, symmetric, transitive', 'Composite relations, equality, recursive definition, order of relations', 'POSET: partial order, Hasse diagrams', 'Lattices: bounded, complemented, distributed, modular, complete'],
        query: 'Set+Theory+Relations+POSET+Lattice+Hasse+Diagram+Discrete+Mathematics+BTech' },
      { title: 'Unit II — Functions & Boolean Algebra', short: 'Functions, K-Map, Boolean',
        topics: ['Functions: definition, classification (injective, surjective, bijective)', 'Operations on functions, growth of functions', 'Boolean Algebra: axioms, theorems, algebraic manipulation', 'Simplification of Boolean functions', 'Karnaugh Maps (K-Maps): 2, 3, 4 variable minimization'],
        query: 'Functions+Boolean+Algebra+Karnaugh+Map+Discrete+Mathematics+BTech+AKTU' },
      { title: 'Unit III — Propositional & Predicate Logic', short: 'Logic, Truth Tables, Inference',
        topics: ['Propositions, truth tables, tautology, satisfiability, contradiction', 'Algebra of propositions, rules of inference', 'Predicate Logic: first-order predicates, well-formed formulas', 'Universal (forall) and existential (exists) quantifiers', 'Inference theory of predicate logic, resolution'],
        query: 'Propositional+Logic+Predicate+Logic+Inference+Truth+Tables+Discrete+Math+BTech' },
      { title: 'Unit IV — Algebraic Structures', short: 'Groups, Rings, Fields',
        topics: ['Groups: definition, properties, subgroups, order, cyclic groups', 'Cosets, Lagrange theorem, normal subgroups', 'Permutation and symmetric groups, group homomorphisms', 'Rings: definition and elementary properties', 'Fields: definition and properties'],
        query: 'Groups+Rings+Fields+Algebraic+Structures+Discrete+Mathematics+BTech+AKTU' },
      { title: 'Unit V — Graph Theory & Combinatorics', short: 'Graphs, Euler, Hamilton',
        topics: ['Graph: definition, terminology, types of graphs', 'Multigraphs, bipartite graphs, planar graphs', 'Isomorphism and homeomorphism of graphs', 'Euler paths/circuits and Hamiltonian paths', 'Graph coloring, chromatic number', 'Counting techniques, Pigeonhole Principle, combinatorics'],
        query: 'Graph+Theory+Euler+Hamiltonian+Pigeonhole+Combinatorics+Discrete+Maths+BTech' },
    ],
    tips: [
      { h: 'Truth Tables', d: '<strong>Practice building truth tables quickly</strong> — simple but always in every AKTU Discrete exam for easy marks.' },
      { h: 'K-Map Practice', d: '<strong>Master 3 and 4-variable K-Map minimization</strong> — always appears in theory and practical both.' },
      { h: 'Graph Problems', d: '<strong>Solve Euler path, Hamiltonian, spanning tree problems</strong> from PYQs — guaranteed question every year.' },
      { h: 'Kenneth Rosen Book', d: 'Follow <strong>Rosen Discrete Mathematics & Its Applications</strong> — the AKTU standard reference for this subject.' },
    ],
  },

  // ═══ SEMESTER IV (already in KB) ═══
  'BCS401': {
    name: 'Operating System',
    importance: 'Operating Systems is the software bridge between programs and hardware. Every developer must understand OS to write efficient applications. Process management, memory management, and file systems directly impact application performance. OS is also one of the most tested topics in FAANG technical interviews.',
    whyMatters: ['Process and thread management used in every modern application', 'Memory management essential for writing efficient, bug-free code', 'Most asked topic in FAANG technical and system design interviews', 'Cloud computing and virtualization are OS concepts at scale'],
    units: [
      { title: 'Unit I — Process Management', short: 'Processes, Threads, IPC',
        topics: ['Process: concept, states (new, ready, running, waiting, terminated)', 'Process Control Block (PCB), process creation and termination', 'Threads: user-level vs kernel-level, multithreading models', 'Inter-Process Communication (IPC): shared memory, message passing', 'Producer-Consumer problem, Race condition basics'],
        query: 'Process+Management+PCB+Threads+IPC+Operating+System+BTech+AKTU' },
      { title: 'Unit II — CPU Scheduling', short: 'FCFS, SJF, Round Robin, Gantt',
        topics: ['Scheduling criteria: CPU utilization, throughput, turnaround, waiting time', 'FCFS: first-come first-served scheduling, Gantt chart', 'SJF/SRTF: shortest job first — preemptive and non-preemptive', 'Round Robin: time quantum, context switching, turnaround calculation', 'Priority Scheduling, Multilevel Queue and Feedback Queue'],
        query: 'CPU+Scheduling+FCFS+SJF+Round+Robin+Priority+OS+BTech+Gantt+chart+AKTU' },
      { title: 'Unit III — Synchronization & Deadlock', short: 'Semaphore, Banker Algorithm',
        topics: ['Critical section problem, mutual exclusion requirements', 'Mutex locks, semaphores (binary and counting)', 'Classic problems: Producer-Consumer, Readers-Writers, Dining Philosophers', 'Deadlock: four Coffman necessary conditions', 'Deadlock prevention, avoidance — Banker algorithm', 'Deadlock detection and recovery strategies'],
        query: 'Synchronization+Deadlock+Semaphore+Banker+Algorithm+OS+BTech+AKTU+dining' },
      { title: 'Unit IV — Memory Management', short: 'Paging, Segmentation, TLB',
        topics: ['Contiguous allocation: fixed/variable partitioning, fragmentation types', 'Paging: logical vs physical address, page table, TLB', 'Segmentation: segment table, protection bits', 'Combined paging-segmentation', 'Memory allocation algorithms: first-fit, best-fit, worst-fit'],
        query: 'Memory+Management+Paging+Segmentation+TLB+Page+Table+OS+BTech+AKTU' },
      { title: 'Unit V — Virtual Memory, File Systems & Disk', short: 'Virtual Memory, LRU, FIFO',
        topics: ['Virtual memory: demand paging, page fault handling', 'Page replacement: FIFO, LRU, Optimal — Belady anomaly', 'Thrashing: concept, causes, and prevention', 'File system: file concept, access methods, directory structure', 'File allocation: contiguous, linked, indexed methods', 'Disk scheduling: FCFS, SSTF, SCAN, C-SCAN, LOOK'],
        query: 'Virtual+Memory+Page+Replacement+LRU+FIFO+File+System+Disk+Scheduling+OS' },
    ],
    tips: [
      { h: 'Gantt Charts Daily', d: '<strong>Solve 3 Gantt chart problems daily</strong> (FCFS, SJF, Round Robin) — guaranteed 15-20 marks in AKTU OS exam.' },
      { h: 'Banker Algorithm Steps', d: '<strong>Memorize and practice Banker algorithm step-by-step</strong> — appears in every AKTU OS paper.' },
      { h: 'Page Replacement Numericals', d: '<strong>Solve LRU, FIFO, Optimal page replacement with a page string</strong> — 10 marks question every year.' },
      { h: 'Galvin Book', d: 'Follow <strong>Operating System Concepts by Galvin (Dinosaur Book)</strong> — perfectly matches AKTU OS syllabus.' },
    ],
  },

  'BCS402': {
    name: 'Theory of Automata & Formal Languages',
    importance: 'Theory of Automata answers the fundamental question of CS: what can computers solve and what cannot they solve? Regular expressions used in every programming language and IDE come from automata. Every compiler parser is a pushdown automaton. This subject is also a core GATE topic.',
    whyMatters: ['Regular expressions (grep, search) come directly from finite automata', 'Compiler lexical analyzer is built on DFA/NFA concepts', 'Parser (syntax analyzer) is a pushdown automaton', 'Core GATE topic — always 8-10 marks'],
    units: [
      { title: 'Unit I — Finite Automata', short: 'DFA, NFA, Conversion, Minimization',
        topics: ['DFA: formal definition, transition diagram, construction for given languages', 'NFA: formal definition, non-determinism', 'Epsilon-NFA: epsilon-closure, epsilon-transitions', 'NFA to DFA conversion (subset construction method)', 'Minimization of DFA (table-filling/equivalence method)'],
        query: 'DFA+NFA+Finite+Automata+Conversion+Minimization+TOC+BTech+AKTU' },
      { title: 'Unit II — Regular Expressions & Pumping Lemma', short: 'RE, Arden Theorem',
        topics: ['Regular expressions: operators (union, concatenation, Kleene star)', 'RE to FA conversion and FA to RE (Arden theorem)', 'Properties of Regular Languages: closure properties', 'Pumping Lemma for Regular Languages', 'Proving languages are NOT regular using Pumping Lemma'],
        query: 'Regular+Expressions+Arden+Theorem+Pumping+Lemma+TOC+BTech+AKTU' },
      { title: 'Unit III — Context Free Grammars', short: 'CFG, CNF, GNF, Ambiguity',
        topics: ['CFG: formal definition, derivations, parse trees', 'Leftmost and rightmost derivations', 'Ambiguous grammars: definition, examples', 'Simplification: removing useless symbols, epsilon, unit productions', 'Chomsky Normal Form (CNF), Greibach Normal Form (GNF)'],
        query: 'Context+Free+Grammar+CFG+CNF+GNF+Parse+Tree+TOC+BTech+AKTU' },
      { title: 'Unit IV — Pushdown Automata', short: 'PDA, DPDA, CFL Pumping Lemma',
        topics: ['PDA: formal definition, stack operations, configuration', 'PDA construction for given CFLs', 'Deterministic PDA (DPDA) vs Non-deterministic PDA', 'Equivalence of PDA and CFG', 'Pumping Lemma for Context-Free Languages'],
        query: 'Pushdown+Automata+PDA+Context+Free+Language+TOC+BTech+AKTU' },
      { title: 'Unit V — Turing Machines & Decidability', short: 'Turing Machine, Halting Problem',
        topics: ['Turing Machine: formal definition, transition function, configurations', 'TM construction for simple languages', 'Variants: multi-tape TM, non-deterministic TM', 'Church-Turing Thesis', 'Decidable and Undecidable problems', 'Halting problem (proof of undecidability)'],
        query: 'Turing+Machine+Decidability+Halting+Problem+TOC+BTech+AKTU' },
    ],
    tips: [
      { h: 'DFA Every Day', d: '<strong>Draw 2 new DFAs from scratch daily</strong> — construction questions are the highest marks in AKTU TOC exam.' },
      { h: 'Pumping Lemma Template', d: '<strong>Learn the exact 5-step pumping lemma proof format</strong> — informal proofs get no marks in AKTU.' },
      { h: 'NFA to DFA', d: '<strong>Practice NFA to DFA conversion 3 times per week</strong> — a guaranteed question in every AKTU TOC paper.' },
      { h: 'Neso Academy Videos', d: '<strong>Watch Neso Academy TOC complete playlist</strong> — clearest explanations perfectly aligned with AKTU syllabus.' },
    ],
  },

  'BCS403': {
    name: 'Object Oriented Programming with Java',
    importance: 'Java OOP introduces the programming paradigm that powers modern software. Java runs on 3 billion devices — Android apps, enterprise backends, banking systems. OOP principles (encapsulation, inheritance, polymorphism, abstraction) are foundational concepts used in every modern language including Python and Kotlin.',
    whyMatters: ['Java powers Android development and most enterprise applications', 'OOP concepts apply directly to Python, C++, Kotlin, C# too', 'Design patterns from OOP asked in system design interviews', 'Spring Boot (Java) is the #1 enterprise backend framework globally'],
    units: [
      { title: 'Unit I — Java Basics & OOP Intro', short: 'Classes, Objects, Constructors',
        topics: ['Java history, JVM, JDK, JRE, bytecode compilation', 'Data types, variables, operators, control flow in Java', 'Classes, objects, access modifiers (public, private, protected)', 'Constructors: default, parameterized, copy constructor, overloading', 'this keyword, static members, instance vs class variables', 'Garbage collection in Java'],
        query: 'Java+Classes+Objects+Constructors+OOP+BTech+AKTU+basics' },
      { title: 'Unit II — Inheritance & Polymorphism', short: 'Inheritance, Method Overriding',
        topics: ['Inheritance types: single, multilevel, hierarchical', 'super keyword for parent constructor and method call', 'Method overloading (compile-time polymorphism)', 'Method overriding (runtime polymorphism), @Override annotation', 'final keyword: final class, final method, final variable', 'Object class and its methods (toString, equals, hashCode)'],
        query: 'Java+Inheritance+Polymorphism+Method+Overriding+super+BTech+AKTU' },
      { title: 'Unit III — Abstraction & Interfaces', short: 'Abstract Classes, Interfaces',
        topics: ['Abstract classes: abstract methods, partial implementation rules', 'Interfaces: definition, implementing multiple interfaces', 'Default and static methods in interfaces (Java 8+)', 'Abstract class vs Interface — when to use which', 'Packages: creating, importing, access protection levels', 'Java API packages: java.lang, java.util, java.io'],
        query: 'Java+Abstract+Class+Interface+Package+OOP+BTech+AKTU' },
      { title: 'Unit IV — Exception Handling & Collections', short: 'Exceptions, Generics, Collections',
        topics: ['Exception hierarchy: Throwable, Exception, Error classes', 'try-catch-finally, multiple catch blocks, nested try', 'throw and throws keywords, checked vs unchecked exceptions', 'Custom exception classes', 'Generics: generic methods and generic classes', 'Collections: List, Set, Map, ArrayList, HashMap, Iterator'],
        query: 'Java+Exception+Handling+Generics+Collections+ArrayList+HashMap+BTech+AKTU' },
      { title: 'Unit V — Multithreading & File I/O', short: 'Threads, Synchronization, Files',
        topics: ['Thread lifecycle: new, runnable, running, blocked, terminated', 'Creating threads: extending Thread class and implementing Runnable', 'Thread synchronization: synchronized keyword, monitors, locks', 'Deadlock in threads, inter-thread communication (wait/notify)', 'File I/O: FileInputStream, FileOutputStream, BufferedReader, Writer', 'Serialization and deserialization of objects'],
        query: 'Java+Multithreading+Thread+Synchronization+File+IO+Serialization+BTech+AKTU' },
    ],
    tips: [
      { h: 'Implement All OOP Pillars', d: '<strong>Code all 4 OOP pillars with real examples</strong> — bank account (encapsulation), shapes (inheritance + polymorphism).' },
      { h: 'UML Class Diagrams', d: '<strong>Draw UML class diagrams</strong> for every program — examiners give extra marks for correct diagrams.' },
      { h: 'Exception Programs', d: '<strong>Write programs for every exception type</strong> — custom exceptions are tested in practicals every year.' },
      { h: 'Mini Project', d: 'Build a <strong>Library or Student Management System</strong> applying all OOP concepts — perfect practical exam prep.' },
    ],
  },

  // ═══ SEMESTER V ═══
  'BCS501': {
    name: 'Database Management System',
    importance: 'DBMS powers every application that stores data — from Instagram to banking. SQL is the most in-demand skill in all software job listings. DBMS teaches database design, querying, normalization, and transaction management — all essential for backend development and data engineering careers.',
    whyMatters: ['SQL is the #1 most in-demand technical skill in job listings', 'Every web/mobile application uses a database backend', 'Data engineering and analytics careers start with DBMS', 'Indexing and query optimization make applications 100x faster'],
    units: [
      { title: 'Unit I — ER Model & Database Architecture', short: 'ER Diagrams, Keys',
        topics: ['Database vs File System, DBMS architecture overview', 'Data Independence: logical and physical', 'ER Model: entities, attributes, relationships, ER diagrams', 'Keys: super key, candidate key, primary key', 'Generalization, aggregation, reduction of ER to tables', 'Extended ER model, relationships of higher degree'],
        query: 'ER+Diagram+Database+Architecture+DBMS+BTech+AKTU+entity+relationship' },
      { title: 'Unit II — Relational Model & SQL', short: 'SQL, Joins, Triggers',
        topics: ['Relational model: integrity constraints, entity and referential integrity', 'Relational Algebra: selection, projection, join, union, intersection', 'Tuple and Domain Relational Calculus', 'SQL: DDL, DML, DCL, aggregate functions, joins, subqueries', 'Views, indexes, cursors, triggers, procedures in SQL/PL-SQL'],
        query: 'SQL+Joins+Triggers+Relational+Algebra+DBMS+BTech+AKTU+queries' },
      { title: 'Unit III — Database Normalization', short: '1NF, 2NF, 3NF, BCNF',
        topics: ['Functional dependencies: definition, types, finding FDs', 'Normal Forms: 1NF, 2NF, 3NF — definitions and examples', 'BCNF: Boyce-Codd Normal Form', 'Inclusion dependence, lossless join decompositions', 'Normalization using FD, MVD, and JDs'],
        query: 'Normalization+1NF+2NF+3NF+BCNF+Functional+Dependency+DBMS+BTech+AKTU' },
      { title: 'Unit IV — Transaction Processing', short: 'ACID, Serializability, Deadlock',
        topics: ['Transaction concepts: ACID properties', 'Testing for serializability, conflict serializability', 'Recoverability, recovery from transaction failures', 'Log-based recovery, checkpoints', 'Distributed database: data storage, concurrency control'],
        query: 'Transaction+ACID+Serializability+Recovery+Log+DBMS+BTech+AKTU' },
      { title: 'Unit V — Concurrency Control', short: 'Locking, Timestamps, Oracle Case',
        topics: ['Concurrency control: need and problems (lost update, dirty read)', 'Locking techniques: 2-Phase Locking (2PL) — strict and conservative', 'Timestamp ordering protocols for concurrency control', 'Validation-based protocol, Multiple granularity', 'Multi-version concurrency control, Case study of Oracle'],
        query: 'Concurrency+Control+Locking+2PL+Timestamp+DBMS+BTech+AKTU' },
    ],
    tips: [
      { h: 'SQL Every Day', d: '<strong>Write 5 SQL queries daily</strong> on HackerRank SQL or SQLZoo — SQL is a skill that only improves with daily practice.' },
      { h: 'ER Diagram Practice', d: '<strong>Draw ER diagrams for real scenarios</strong> — hospital, library, airline — asked in every AKTU DBMS exam.' },
      { h: 'Normalization Steps', d: '<strong>Show all normalization steps clearly</strong>: find FDs, identify normal form, decompose — step-by-step gets full marks.' },
      { h: 'Transaction Numericals', d: '<strong>Practice serializability and 2PL lock problems</strong> — appear as 10-mark questions in every AKTU paper.' },
    ],
  },

  'BCS502': {
    name: 'Web Technology',
    importance: 'Web Technology is the gateway to the most in-demand developer career — full-stack web development. Every company needs web developers. HTML, CSS, JavaScript, Servlets, and JSP form the basis of every website and web application. This directly leads to careers in frontend, backend, and full-stack development.',
    whyMatters: ['Web development is the highest-demand tech skill globally', 'Freelancing opportunities start from basic HTML/CSS/JS skills', 'React, Angular, Node.js all build on JS concepts from this course', 'Full-stack development is the most commonly hired developer profile'],
    units: [
      { title: 'Unit I — HTML, XML & Web Basics', short: 'HTML5, XML, DTD, DOM, SAX',
        topics: ['Introduction to web development, history of internet and web', 'Protocols: HTTP, HTTPS, FTP, TCP/IP', 'HTML: lists, tables, images, frames, forms, semantic elements', 'XML: Document Type Definition (DTD), XML Schema', 'Object Models: DOM and SAX processors, presenting XML'],
        query: 'HTML+XML+DTD+DOM+SAX+Web+Technology+BTech+AKTU' },
      { title: 'Unit II — CSS (Basics & Advanced)', short: 'CSS, Box Model, Layout',
        topics: ['CSS: creating style sheets, CSS properties', 'Styling: background, text, fonts, colors', 'Box Model: border, padding, margin properties', 'Block elements and objects, lists and tables in CSS', 'Advanced CSS: grouping, display, positioning, float, pseudo-class', 'Navigation bar, Image Sprites, Page layout design'],
        query: 'CSS+Box+Model+Layout+Flexbox+Web+Technology+BTech+AKTU' },
      { title: 'Unit III — JavaScript & Networking', short: 'JavaScript, DOM, AJAX',
        topics: ['JavaScript: variables, functions, objects, statements', 'DOM manipulation with JavaScript, event handling', 'Introduction to AJAX: XMLHttpRequest, asynchronous requests', 'Networking: InetAddress, Factory Methods, TCP/IP sockets', 'URL, URLConnection, Server Sockets, Datagram'],
        query: 'JavaScript+DOM+AJAX+Web+Technology+BTech+AKTU' },
      { title: 'Unit IV — Enterprise Java & Node.js', short: 'JavaBeans, Node.js, MongoDB',
        topics: ['Enterprise JavaBeans: stateful/stateless session beans, entity beans', 'Node.js: setup, REPL, NPM, callbacks, events', 'Express framework, RESTful APIs with Node.js', 'MongoDB with Node.js: CRUD operations, aggregation, sorting'],
        query: 'NodeJS+MongoDB+JavaBeans+REST+API+Web+Technology+BTech+AKTU' },
      { title: 'Unit V — Servlets & JSP', short: 'Servlets, Session, JSP, Custom Tags',
        topics: ['Servlets: architecture, lifecycle (init, service, destroy)', 'Handling HTTP GET and POST requests', 'Session tracking: cookies and HttpSession API', 'JSP: overview, implicit objects, scriptlets, directives', 'Standard actions in JSP, Custom Tag Libraries (JSTL)'],
        query: 'Servlets+JSP+Session+Cookies+Web+Technology+BTech+AKTU' },
    ],
    tips: [
      { h: 'Build Real Projects', d: '<strong>Build a complete website applying every concept</strong> — portfolio, blog, student form — best practical preparation.' },
      { h: 'JavaScript Daily', d: '<strong>Practice JavaScript DOM events and form validation daily</strong> — JS is tested hardest in AKTU web tech practicals.' },
      { h: 'Run Servlets Locally', d: '<strong>Set up Apache Tomcat and run Servlet/JSP examples</strong> locally — practical exams test live coding.' },
      { h: 'CSS Layouts', d: '<strong>Learn CSS Flexbox and Grid for responsive layouts</strong> — modern layout techniques impress examiners.' },
    ],
  },

  'BCS503': {
    name: 'Design and Analysis of Algorithm',
    importance: 'DAA is THE subject for cracking placements at top tech companies. Every technical interview tests your ability to design efficient algorithms. Understanding time/space complexity, dynamic programming, and graph algorithms directly determines your success in Google, Amazon, Microsoft, and Flipkart interviews.',
    whyMatters: ['Every technical interview at top companies tests algorithm design', 'Dynamic programming optimizes GPS routing, compiler optimization', 'Greedy algorithms power network routing and scheduling systems', 'Understanding NP-completeness defines limits of what software can solve'],
    units: [
      { title: 'Unit I — Complexity & Advanced Sorting', short: 'Big-O, Shell/Quick/Merge/Heap Sort',
        topics: ['Algorithm analysis: time and space complexity, growth of functions', 'Performance measurements, sorting comparison', 'Shell Sort, Quick Sort, Merge Sort, Heap Sort — detailed analysis', 'Comparison of sorting algorithms: stability, adaptability, complexity', 'Sorting in linear time: Counting Sort, Radix Sort concepts'],
        query: 'Algorithm+Complexity+Big+O+Sorting+Quick+Merge+Heap+DAA+BTech+AKTU' },
      { title: 'Unit II — Advanced Data Structures', short: 'Red-Black Trees, B-Trees, Heaps',
        topics: ['Red-Black Trees: properties, rotations, insertion, deletion', 'B-Trees: properties, insertion and deletion operations', 'Binomial Heaps: structure and operations', 'Fibonacci Heaps: structure and amortized complexity', 'Tries: structure, insertion, search applications', 'Skip Lists: structure and probabilistic analysis'],
        query: 'Red+Black+Trees+B+Trees+Fibonacci+Heaps+DAA+BTech+AKTU' },
      { title: 'Unit III — Divide & Conquer + Greedy', short: 'Divide Conquer, Dijkstra, Kruskal',
        topics: ['Divide and Conquer: sorting, matrix multiplication, convex hull', 'Greedy: optimal reliability allocation, fractional knapsack', 'Minimum Spanning Trees: Prim and Kruskal algorithms', 'Single Source Shortest Paths: Dijkstra algorithm', 'Bellman-Ford algorithm for negative weights'],
        query: 'Divide+Conquer+Greedy+Dijkstra+Kruskal+Prim+Bellman+Ford+DAA+BTech' },
      { title: 'Unit IV — Dynamic Programming & Backtracking', short: 'DP, 0/1 Knapsack, TSP',
        topics: ['Dynamic Programming: 0/1 Knapsack problem', 'All Pairs Shortest Paths: Floyd-Warshall algorithm', 'Resource Allocation Problem using DP', 'Backtracking: N-Queen problem, Graph Coloring', 'Branch and Bound: Travelling Salesman Problem (TSP), Hamiltonian Cycles', 'Sum of Subsets problem'],
        query: 'Dynamic+Programming+Knapsack+Floyd+Warshall+Backtracking+DAA+BTech+AKTU' },
      { title: 'Unit V — NP-Completeness & Approximation', short: 'NP, Approximation, String Matching',
        topics: ['Algebraic Computation, Fast Fourier Transform (FFT)', 'String Matching: naive, KMP, Rabin-Karp algorithms', 'Theory of NP-Completeness: P vs NP, NP-Hard, NP-Complete', 'Polynomial time reductions', 'Approximation Algorithms: vertex cover, traveling salesman', 'Randomized Algorithms: basics and applications'],
        query: 'NP+Completeness+Approximation+Algorithm+String+Matching+DAA+BTech+AKTU' },
    ],
    tips: [
      { h: 'Complexity Always', d: '<strong>Write time AND space complexity</strong> for every algorithm — this alone earns easy 5 marks in AKTU DAA theory.' },
      { h: 'DP 5 Core Patterns', d: '<strong>Master 5 DP patterns: Knapsack, LCS, Matrix Chain, Coin Change, Floyd-Warshall</strong> — covers 80% of DP questions.' },
      { h: 'Greedy Proofs', d: '<strong>Write exchange argument proofs for greedy algorithms</strong> — AKTU theory exams ask for correctness justification.' },
      { h: 'LeetCode Medium', d: '<strong>Solve 50 LeetCode Medium problems topic-wise</strong> — directly prepares for company placement interviews.' },
    ],
  },

  // ═══ SEMESTER VI ═══
  'BCS601': {
    name: 'Software Engineering',
    importance: 'Software Engineering teaches how real software is built professionally in teams. Without SE principles, codebases become unmaintainable. Every software job involves SDLC, requirement engineering, UML design, and testing. This is what separates a professional developer from a hobbyist coder.',
    whyMatters: ['Every professional software project follows SE SDLC principles', 'Agile and Scrum (from SE) used in 90%+ of IT companies worldwide', 'UML is the universal software design language across all companies', 'Software testing prevents failures that cost companies billions'],
    units: [
      { title: 'Unit I — Introduction & SDLC Models', short: 'Waterfall, Spiral, Agile',
        topics: ['Software characteristics, software crisis, software engineering processes', 'Software Quality Attributes', 'Waterfall Model: phases and limitations', 'Prototype Model, Spiral Model', 'Evolutionary Development Models, Iterative Enhancement Models'],
        query: 'SDLC+Waterfall+Spiral+Agile+Software+Engineering+BTech+AKTU' },
      { title: 'Unit II — SRS & Software Quality Assurance', short: 'SRS, DFD, ER, CMM',
        topics: ['Requirements engineering: elicitation, analysis, documentation', 'Feasibility study, Information modeling', 'Data Flow Diagrams (DFD), ER Diagrams, Decision Tables', 'SRS Document as per IEEE standards', 'SQA: Verification and Validation, ISO 9000, SEI-CMM Model'],
        query: 'SRS+DFD+Software+Requirements+IEEE+CMM+Software+Engineering+BTech+AKTU' },
      { title: 'Unit III — Software Design & Metrics', short: 'Modular Design, Coupling, Cohesion',
        topics: ['Architectural design, modularization, design structure charts', 'Pseudo codes, flow charts', 'Coupling: types (content, control, data) and Cohesion: types', 'Design strategies: Function-Oriented, Object-Oriented', 'Halstead Software Science, Function Point (FP) measures', 'Cyclomatic Complexity, Control Flow Graphs'],
        query: 'Software+Design+Coupling+Cohesion+Function+Point+Cyclomatic+BTech+AKTU' },
      { title: 'Unit IV — Software Testing', short: 'Unit Test, Black Box, White Box',
        topics: ['Testing objectives, Unit Testing, Integration Testing', 'Acceptance Testing, Regression Testing', 'Bottom-Up and Top-Down testing strategies, Test Stubs, Drivers', 'White Box (Structural) Testing: path testing, basis path', 'Black Box (Functional) Testing: equivalence partitioning, boundary value', 'Alpha and Beta testing, Static testing: code inspection, walkthroughs'],
        query: 'Software+Testing+Black+Box+White+Box+Unit+Integration+BTech+AKTU' },
      { title: 'Unit V — Maintenance & Project Management', short: 'COCOMO, Risk, Configuration',
        topics: ['Software maintenance: preventive, corrective, perfective', 'Software Re-engineering and Reverse Engineering', 'Configuration Management, Version Control, CASE Tools', 'Project estimation: COCOMO model, Resource Allocation Models', 'Software Risk Analysis and Management'],
        query: 'COCOMO+Risk+Analysis+Software+Maintenance+Project+Management+BTech+AKTU' },
    ],
    tips: [
      { h: 'All UML Diagrams', d: '<strong>Practice all 9 UML diagram types</strong> — use case, class, sequence, activity are most common in AKTU SE paper.' },
      { h: 'SDLC Comparison Table', d: '<strong>Make a comparison table of all SDLC models</strong> — "compare Waterfall vs Agile" is asked every year.' },
      { h: 'COCOMO Formula', d: '<strong>Memorize and practice COCOMO estimation formula</strong> — numerical problems appear in every AKTU exam.' },
      { h: 'Testing Types Table', d: '<strong>Know every testing type, when to use it, and who does it</strong> — comparison questions are high-value in theory.' },
    ],
  },

  'BCS602': {
    name: 'Compiler Design',
    importance: 'Compiler Design explains how programs are translated from high-level language to machine code. Every IDE, code editor, and interpreter you use is built on compiler principles. Understanding compilers makes you a better programmer because you understand exactly how your code is processed and optimized.',
    whyMatters: ['IDE syntax highlighting uses lexical analysis (DFA)', 'Regular expressions in all programming come from this subject', 'Understanding compilation helps write more optimizable code', 'Language interpreters (Python, JS engines) use all compiler phases'],
    units: [
      { title: 'Unit I — Lexical Analysis & Parsing Intro', short: 'LEX, YACC, CFG, BNF',
        topics: ['Phases and passes of compiler, Bootstrapping', 'Finite state machines and regular expressions for lexical analysis', 'Lexical analyzer generator: LEX compiler', 'Formal grammars, BNF notation, ambiguity', 'Context Free Grammars: derivations and parse trees, capabilities of CFG'],
        query: 'Lexical+Analysis+LEX+YACC+CFG+BNF+Compiler+Design+BTech+AKTU' },
      { title: 'Unit II — Parsing Techniques', short: 'LR, SLR, LALR, LL(1)',
        topics: ['Basic parsing: shift-reduce parsing, operator precedence parsing', 'Top-down parsing, predictive parsers', 'LR parsers: canonical LR(0) items', 'SLR parsing tables construction', 'Canonical LR and LALR parsing tables construction', 'Using ambiguous grammars, automatic parser generator'],
        query: 'LR+SLR+LALR+LL1+Parsing+Compiler+Design+BTech+AKTU' },
      { title: 'Unit III — Syntax-Directed Translation', short: 'SDT, Three-Address Code',
        topics: ['Syntax-directed translation schemes and implementation', 'Intermediate code: postfix notation, parse trees, syntax trees', 'Three-address code: quadruples and triples', 'Translation of assignment statements and Boolean expressions', 'Statements that alter flow of control (if, while)', 'Array references, procedure calls in expressions'],
        query: 'Syntax+Directed+Translation+Three+Address+Code+Compiler+Design+BTech' },
      { title: 'Unit IV — Symbol Tables & Runtime', short: 'Symbol Table, Stack Allocation',
        topics: ['Data structures for symbol tables: hash tables, trees', 'Representing scope information', 'Runtime administration: simple stack allocation', 'Storage allocation in block-structured languages', 'Error detection and recovery: lexical, syntactic, semantic errors'],
        query: 'Symbol+Table+Runtime+Storage+Allocation+Error+Recovery+Compiler+Design+BTech' },
      { title: 'Unit V — Code Generation & Optimization', short: 'Code Gen, Loop Optimization',
        topics: ['Code generation: design issues, target language selection', 'Addresses in target code, Basic blocks and flow graphs', 'Optimization of basic blocks, simple code generator', 'Machine-independent optimizations', 'Loop optimization: code motion, strength reduction, induction variables', 'DAG representation, Global Data-Flow analysis'],
        query: 'Code+Generation+Optimization+Loop+DAG+Compiler+Design+BTech+AKTU' },
    ],
    tips: [
      { h: 'FIRST & FOLLOW Daily', d: '<strong>Practice computing FIRST and FOLLOW sets for 3 grammars daily</strong> — every AKTU Compiler exam has this question.' },
      { h: 'Parsing Tables', d: '<strong>Construct LL(1) and SLR parsing tables step-by-step</strong> clearly — marks given for each correct step.' },
      { h: 'Grammar Derivations', d: '<strong>Practice leftmost and rightmost derivations</strong> and drawing parse trees — common 5-mark questions.' },
      { h: 'Dragon Book', d: '<strong>Read Aho, Sethi & Ullman (Dragon Book) chapter summaries</strong> — perfectly aligned with AKTU Compiler Design syllabus.' },
    ],
  },

  'BCS603': {
    name: 'Computer Networks',
    importance: 'Computer Networks explains how the internet works. Every web app, API call, video stream, and cloud service depends on networking. Networking is essential for cloud computing, cybersecurity, backend development, and DevOps. It is also the most asked topic in system design interviews at top companies.',
    whyMatters: ['Internet and all web applications run on TCP/IP networking protocols', 'Cloud computing and DevOps require deep networking knowledge', 'Cybersecurity is fundamentally about understanding network attacks', 'System design interviews always ask about load balancers, DNS, CDN'],
    units: [
      { title: 'Unit I — OSI Model, TCP/IP & Physical Layer', short: 'OSI Layers, Media, Encoding',
        topics: ['Goals and applications of networks, categories of networks', 'OSI Reference Model: 7 layers, functions of each layer', 'TCP/IP protocol suite: 5-layer model comparison', 'Network devices: hub, switch, router, gateway, bridge', 'Physical Layer: transmission media, signal encoding, multiplexing, switching'],
        query: 'OSI+Model+TCP+IP+Physical+Layer+Computer+Networks+BTech+AKTU' },
      { title: 'Unit II — Data Link Layer & MAC', short: 'Framing, CRC, Sliding Window',
        topics: ['Framing: character count, flag bytes, bit stuffing', 'Error Detection: CRC (Cyclic Redundancy Check), checksum, parity', 'Error Correction: Hamming code', 'Flow Control: Elementary protocols, Sliding Window protocols (Go-Back-N, SR)', 'Medium Access Control: channel allocation, multiple access protocols', 'LAN standards, learning bridges, spanning tree algorithm'],
        query: 'Data+Link+Layer+CRC+Sliding+Window+Flow+Control+Computer+Networks+BTech' },
      { title: 'Unit III — Network Layer', short: 'IP Addressing, Subnetting, Routing',
        topics: ['Point-to-point networks, logical addressing (IPv4)', 'Basic internetworking: IP, CIDR, ARP, RARP, DHCP, ICMP', 'Subnetting: variable-length subnet masking (VLSM) — numericals', 'Routing algorithms: Distance Vector, Link State', 'Routing protocols: OSPF, BGP', 'Congestion control algorithms, IPv6 introduction'],
        query: 'IP+Addressing+Subnetting+Routing+OSPF+Computer+Networks+BTech+AKTU' },
      { title: 'Unit IV — Transport Layer', short: 'TCP, UDP, Congestion Control',
        topics: ['Process-to-process delivery, port numbers', 'UDP: connectionless, stateless — when to use it', 'TCP: connection-oriented, 3-way handshake, 4-way termination', 'TCP flow control: sliding window, credit-based', 'TCP congestion control: slow start, congestion avoidance, fast retransmit', 'Quality of Service (QoS)'],
        query: 'TCP+UDP+Transport+Layer+Congestion+Control+Computer+Networks+BTech' },
      { title: 'Unit V — Application Layer & Security', short: 'HTTP, DNS, FTP, Cryptography',
        topics: ['DNS: domain name resolution, hierarchy, resource records', 'HTTP/HTTPS: request/response, methods, status codes', 'Electronic Mail: SMTP, POP3, IMAP protocols', 'FTP, Telnet, Remote Login, SNMP', 'Data compression techniques', 'Cryptography basics: symmetric, asymmetric, digital signatures'],
        query: 'HTTP+DNS+FTP+SMTP+Application+Layer+Computer+Networks+BTech+AKTU' },
    ],
    tips: [
      { h: 'Subnetting Every Day', d: '<strong>Solve 5 IP subnetting problems daily</strong> — subnetting numericals are in every AKTU CN exam for guaranteed marks.' },
      { h: 'Protocol Table', d: '<strong>Make a table: Protocol | Layer | Port | Purpose</strong> — memorize 15+ protocols for theory questions.' },
      { h: 'CRC Numericals', d: '<strong>Practice CRC calculation step-by-step</strong> — data link layer numerical appears in every AKTU CN paper.' },
      { h: 'Forouzan Book', d: 'Follow <strong>Forouzan Data Communication and Networking</strong> — perfectly aligned with AKTU CN syllabus.' },
    ],
  },

  // ═══ SEMESTER VII ═══
  'BCS701': {
    name: 'Artificial Intelligence',
    importance: 'Artificial Intelligence is the most transformative technology of the 21st century. AI powers search engines, recommendation systems, voice assistants, self-driving cars, and medical diagnosis. Understanding AI fundamentals positions you at the cutting edge and opens doors to the highest-paying jobs in the entire tech industry.',
    whyMatters: ['AI/ML engineers are the highest-paid developers globally (avg 15-30 LPA+)', 'AI powers Google Search, Netflix, Spotify, Siri, Alexa, ChatGPT', 'Every industry — healthcare, finance, education — is being transformed by AI', 'Explainable AI (XAI) is the new requirement for deploying AI systems responsibly'],
    units: [
      { title: 'Unit I — AI Intro & Intelligent Agents', short: 'AI Basics, Agent Architecture',
        topics: ['Definition and scope of AI, history and applications', 'Characteristics of Intelligent Agents, types of agents and environments', 'Agent architecture: simple reflex, model-based, goal-based, utility-based', 'Problem-Solving Approach: formulation, state space representation', 'Example AI problems: 8-puzzle, missionaries, water jug'],
        query: 'Artificial+Intelligence+Introduction+Intelligent+Agents+BTech+AKTU' },
      { title: 'Unit II — Search Strategies & Game Playing', short: 'BFS, A*, Minimax, Alpha-Beta',
        topics: ['Uninformed Search: BFS, DFS, Iterative Deepening Search', 'Informed Search: Greedy Best-First Search, A* Algorithm', 'Heuristics: admissibility, consistency, design principles', 'Hill Climbing, Simulated Annealing, Constraint Satisfaction Problems', 'Game Playing: Min-Max algorithm, Alpha-Beta Pruning', 'Stochastic and Partially Observable Games'],
        query: 'A+Star+Search+Heuristics+Minimax+Alpha+Beta+AI+BTech+AKTU' },
      { title: 'Unit III — Knowledge Representation & Reasoning', short: 'Logic, Prolog, Chaining',
        topics: ['Propositional Logic: syntax, semantics, inference', 'First Order Logic: predicates, quantifiers, unification', 'Knowledge-based agents: Wumpus world example', 'Logic Programming using Prolog', 'Forward and Backward Chaining', 'Resolution, Ontological Engineering'],
        query: 'Knowledge+Representation+First+Order+Logic+Prolog+AI+BTech+AKTU' },
      { title: 'Unit IV — Uncertainty & Learning', short: 'Bayes Rule, Neural Networks, ML',
        topics: ['Introduction to uncertainty and probabilistic reasoning', 'Bayes Rule, Bayesian Networks', 'Fuzzy Logic: handling imprecision and uncertainty', 'Neural Networks basics: Perceptron, Backpropagation (introductory)', 'Fundamentals of Machine Learning in AI context', 'Supervised and unsupervised learning introduction'],
        query: 'Bayesian+Networks+Fuzzy+Logic+Neural+Networks+Machine+Learning+AI+BTech' },
      { title: 'Unit V — AI Applications & Multi-Agent Systems', short: 'NLP, Robotics, XAI',
        topics: ['Natural Language Processing: machine translation, information retrieval', 'Robotics: perception, planning, and motion', 'Speech Recognition fundamentals', 'Software Agents: architecture, communication, trust', 'Multi-Agent Negotiation and Reputation systems', 'Explainable AI (XAI): interpretability, techniques, trust, case studies'],
        query: 'NLP+Robotics+Multi+Agent+Systems+XAI+Explainable+AI+BTech+AKTU' },
    ],
    tips: [
      { h: 'A* Search Problems', d: '<strong>Solve A* search with heuristic tables and admissibility check</strong> — most common numerical in AKTU AI exam.' },
      { h: 'Python for AI', d: '<strong>Start learning Python with NumPy, Pandas, Scikit-learn</strong> — language of AI industry, expected in practicals.' },
      { h: 'Neural Network Math', d: '<strong>Understand backpropagation mathematically step-by-step</strong> — derivation is asked in AKTU AI theory.' },
      { h: 'Russell & Norvig AIMA', d: 'Read <strong>AIMA 4th Edition by Russell & Norvig</strong> — the definitive AI textbook aligned to AKTU.' },
    ],
  },

  'BCS070': {
    name: 'Internet of Things',
    importance: 'IoT is connecting billions of devices to the internet — from smart homes to industrial automation. As a CSE student, IoT combines your software skills with hardware interaction. IoT engineers are in massive demand for smart city, healthcare, agriculture, and industrial automation projects.',
    whyMatters: ['IoT market is worth $500+ billion and growing rapidly', 'Smart cities, healthcare monitoring, industrial automation all use IoT', 'IoT combines CSE software skills with hardware and networking', 'Edge computing and embedded systems are the future of computing'],
    units: [
      { title: 'Unit I — IoT Fundamentals & M2M', short: 'IoT Vision, M2M, Design Principles',
        topics: ['IoT vision, definition, conceptual framework, architectural view', 'Technology behind IoT, Sources of IoT', 'M2M Communication, IoT examples (smart home, health monitoring)', 'IoT/M2M systems layers and design standardization', 'Communication technologies, data enrichment and consolidation'],
        query: 'IoT+Internet+of+Things+M2M+Architecture+BTech+AKTU' },
      { title: 'Unit II — IoT Hardware & Embedded Platforms', short: 'Sensors, Arduino, Raspberry Pi',
        topics: ['Sensors: digital sensors, actuators, types and applications', 'RFID technology and wireless sensor networks', 'Participatory sensing technology', 'Embedded computing basics for IoT', 'Hardware platforms: Arduino, Raspberry Pi, Beagle Bone, Intel Galileo, ARM Cortex'],
        query: 'IoT+Hardware+Arduino+Raspberry+Pi+Sensors+Embedded+BTech+AKTU' },
      { title: 'Unit III — IoT Networking & Protocols', short: 'MAC, Routing, Data Aggregation',
        topics: ['Wireless Medium Access Control issues for IoT', 'MAC protocol survey for IoT networks', 'Survey of routing protocols for sensor networks', 'Sensor deployment and Node discovery', 'Data aggregation and dissemination in IoT'],
        query: 'IoT+Networking+MAC+Protocols+Routing+Sensor+Networks+BTech+AKTU' },
      { title: 'Unit IV — Arduino Programming for IoT', short: 'Arduino IDE, Libraries, Emulator',
        topics: ['Arduino Platform: board anatomy, pin configuration', 'Arduino IDE: coding environment, compilation', 'Using emulator for testing without hardware', 'Using Arduino libraries for sensors and modules', 'Programming Arduino for IoT: reading sensors, controlling actuators'],
        query: 'Arduino+Programming+IoT+BTech+AKTU+sensors+actuators' },
      { title: 'Unit V — IoT Challenges & Applications', short: 'Smart City, E-health, Automation',
        topics: ['IoT Design Challenges: development, security, scalability challenges', 'IoT Security Challenges and solutions', 'Smart Metering: energy monitoring applications', 'E-health: patient monitoring, wearable devices', 'City Automation: smart street lights, traffic management', 'Home automation, smart cards, automotive applications'],
        query: 'IoT+Applications+Smart+City+Home+Automation+Healthcare+BTech+AKTU' },
    ],
    tips: [
      { h: 'Arduino Hands-On', d: '<strong>Run every Arduino program on simulator (Tinkercad)</strong> if no hardware available — practicals test actual coding.' },
      { h: 'Architecture Diagrams', d: '<strong>Draw IoT architecture diagrams with all layers clearly labeled</strong> — 5-mark theory questions regularly.' },
      { h: 'Protocol Comparison', d: '<strong>Make a table comparing IoT communication protocols</strong> (MQTT, CoAP, HTTP, Zigbee) — asked in theory.' },
      { h: 'Real Applications', d: '<strong>Know 3-4 real IoT application examples with architecture</strong> — examiners reward application-focused answers.' },
    ],
  },

  'BCS071': {
    name: 'Cloud Computing',
    importance: 'Cloud Computing has fundamentally changed how software is deployed and scaled. AWS, Azure, and Google Cloud power 90%+ of the internet. Understanding cloud architecture, virtualization, and services is now a mandatory skill for backend developers, DevOps engineers, and system architects.',
    whyMatters: ['90%+ of internet runs on cloud platforms (AWS, Azure, GCP)', 'Cloud computing skills are in top 5 most demanded tech skills', 'Scalability concepts from cloud are in every system design interview', 'DevOps, containerization, and microservices all build on cloud foundations'],
    units: [
      { title: 'Unit I — Introduction to Cloud Computing', short: 'Cloud Definition, Elasticity',
        topics: ['Definition of Cloud, evolution of cloud computing', 'Underlying principles of parallel and distributed computing', 'Cloud characteristics: on-demand, elasticity, pay-per-use', 'Elasticity in cloud: automatic scaling up and down', 'On-demand provisioning of resources'],
        query: 'Cloud+Computing+Introduction+Elasticity+Distributed+Computing+BTech+AKTU' },
      { title: 'Unit II — Virtualization & SOA', short: 'Virtualization, REST, Web Services',
        topics: ['Service Oriented Architecture (SOA), REST and Systems of Systems', 'Web Services, Publish-Subscribe Model', 'Virtualization: types — full, para, OS-level, hardware-level', 'Implementation levels: CPU, memory, I/O device virtualization', 'Virtualization tools and mechanisms', 'Disaster Recovery using virtualization'],
        query: 'Virtualization+SOA+REST+Web+Services+Cloud+Computing+BTech+AKTU' },
      { title: 'Unit III — Cloud Architecture & Storage', short: 'IaaS, PaaS, SaaS, S3',
        topics: ['Layered cloud architecture design', 'NIST Cloud Computing Reference Architecture', 'Public, Private, Hybrid, Community clouds — comparison', 'Service models: IaaS, PaaS, SaaS — examples and differences', 'Cloud Storage: Storage-as-a-Service, advantages', 'Cloud storage providers: Amazon S3, Google Cloud Storage'],
        query: 'IaaS+PaaS+SaaS+Cloud+Architecture+Storage+S3+BTech+AKTU' },
      { title: 'Unit IV — Resource Management & Security', short: 'Provisioning, Security, IAM',
        topics: ['Inter-Cloud Resource Management', 'Resource provisioning methods: static, dynamic', 'Global exchange of cloud resources', 'Cloud Security overview: challenges and attack vectors', 'Software-as-a-Service security considerations', 'Security Governance, Virtual Machine Security, IAM'],
        query: 'Cloud+Security+Resource+Management+IAM+Provisioning+BTech+AKTU' },
      { title: 'Unit V — Cloud Technologies & Federation', short: 'Hadoop, OpenStack, Federation',
        topics: ['Hadoop on Cloud: MapReduce framework', 'Virtual Box, Google App Engine programming environment', 'OpenStack: architecture and components', 'Federation in Cloud: four levels of federation', 'Federated services and applications', 'Future of Cloud Federation and hybrid multi-cloud'],
        query: 'Hadoop+MapReduce+OpenStack+Google+App+Engine+Cloud+Federation+BTech+AKTU' },
    ],
    tips: [
      { h: 'IaaS vs PaaS vs SaaS', d: '<strong>Make a clear comparison table with examples</strong> — this distinction is asked in every AKTU cloud exam.' },
      { h: 'Virtualization Types', d: '<strong>Understand all virtualization types with real-world hypervisors</strong> (VMware, VirtualBox, KVM) — important theory.' },
      { h: 'Cloud Provider Examples', d: '<strong>Map each service model to real cloud providers</strong> — AWS EC2 (IaaS), AWS Lambda (PaaS), Gmail (SaaS).' },
      { h: 'Deployment Models', d: '<strong>Know when to choose public vs private vs hybrid cloud</strong> — scenario-based questions appear every year.' },
    ],
  },

  'BCS072': {
    name: 'Cryptography & Network Security',
    importance: 'Cybersecurity is one of the fastest-growing fields in technology with massive talent shortages. Cryptography underlies every secure transaction, every HTTPS connection, and every encrypted message. Understanding security is mandatory for any serious software developer working on production systems.',
    whyMatters: ['Every HTTPS website uses RSA and AES from this subject', 'Digital signatures enable secure authentication in all banking apps', 'Cybersecurity engineers are among highest-paid professionals', 'Data breaches and security vulnerabilities cost companies billions'],
    units: [
      { title: 'Unit I — Classical & Symmetric Encryption', short: 'DES, AES, Block Ciphers',
        topics: ['Security attacks, services and mechanisms overview', 'Classical techniques: substitution and transposition ciphers, steganography', 'Stream and block ciphers', 'DES: structure, Feistel network, strength, Triple DES', 'AES: encryption and decryption process', 'Block cipher modes: ECB, CBC, CFB, OFB, CTR'],
        query: 'DES+AES+Block+Cipher+Cryptography+Network+Security+BTech+AKTU' },
      { title: 'Unit II — Public Key Cryptography', short: 'RSA, Diffie-Hellman, Number Theory',
        topics: ['Groups, fields, GF(p), modular arithmetic', 'Prime numbers, Extended Euclidean Algorithm', 'Fermat and Euler theorems, Chinese Remainder Theorem', 'Discrete Logarithm Problem', 'RSA algorithm: key generation, encryption, decryption, security', 'Advanced Encryption Standard (AES) mathematical foundations'],
        query: 'RSA+Public+Key+Cryptography+Diffie+Hellman+Modular+Arithmetic+BTech+AKTU' },
      { title: 'Unit III — Hash Functions & Digital Signatures', short: 'SHA, Digital Signature, MAC',
        topics: ['Message Authentication Codes (MAC)', 'Hash functions: properties, birthday attacks', 'Secure Hash Algorithm (SHA): SHA-1, SHA-256', 'Digital Signatures: purpose and properties', 'ElGamal Digital Signature, DSS (Digital Signature Standard)', 'Proof of digital signature algorithm'],
        query: 'Hash+Functions+SHA+Digital+Signature+MAC+Cryptography+BTech+AKTU' },
      { title: 'Unit IV — Key Management & Authentication', short: 'PKI, Kerberos, PGP, S/MIME',
        topics: ['Symmetric key distribution methods', 'Diffie-Hellman Key Exchange protocol', 'Public Key Distribution, X.509 Certificates', 'Public Key Infrastructure (PKI)', 'Authentication Applications: Kerberos protocol', 'Email security: PGP (Pretty Good Privacy), S/MIME'],
        query: 'Key+Management+PKI+Kerberos+PGP+Authentication+Cryptography+BTech+AKTU' },
      { title: 'Unit V — Network Security Protocols', short: 'IPSec, SSL, Firewall, IDS',
        topics: ['IP Security (IPSec): architecture, authentication header (AH), ESP', 'Combining security associations, key management in IPSec', 'Secure Socket Layer (SSL) / TLS protocol', 'Secure Electronic Transaction (SET)', 'System Security: intrusion types, intrusion detection systems (IDS)', 'Viruses, malware, firewalls — types and configurations'],
        query: 'IPSec+SSL+TLS+Firewall+Intrusion+Detection+Network+Security+BTech+AKTU' },
    ],
    tips: [
      { h: 'RSA Numericals', d: '<strong>Practice RSA key generation and encryption/decryption numericals</strong> — appears in every AKTU Cryptography exam.' },
      { h: 'DES Steps', d: '<strong>Memorize DES: 16 rounds, 64-bit block, 56-bit key, Feistel structure</strong> — theory questions every year.' },
      { h: 'Hash vs MAC vs Digital Sign', d: '<strong>Know the difference between hash, MAC, and digital signatures</strong> — comparison question is standard.' },
      { h: 'Stallings Book', d: 'Follow <strong>William Stallings Cryptography and Network Security</strong> — perfectly aligned with AKTU syllabus.' },
    ],
  },

  'BCS073': {
    name: 'Design & Development of Applications',
    importance: 'Mobile app development is one of the most in-demand and lucrative skills in technology. With 6+ billion smartphone users globally, mobile apps represent a massive market. This subject teaches Android and iOS development — directly enabling you to build and publish real applications.',
    whyMatters: ['6+ billion smartphone users represent a massive market for apps', 'Android and iOS development are among highest-paying dev skills', 'Mobile apps are the primary interface for most digital services today', 'Full-stack mobile developers (frontend + backend + mobile) are rare and well-paid'],
    units: [
      { title: 'Unit I — Mobile App Introduction', short: 'Mobile Market, Requirements',
        topics: ['Mobile applications market and business drivers', 'Publishing and delivery of mobile applications', 'Requirements gathering and validation for mobile apps', 'Embedded systems basics and overview', 'Technology and business trends in mobile'],
        query: 'Mobile+Applications+Introduction+Android+iOS+BTech+AKTU' },
      { title: 'Unit II — Basic Mobile App Design', short: 'Design Constraints, UI, UX',
        topics: ['Basics of embedded system design for mobile', 'Embedded OS for mobile platforms', 'Design constraints: hardware and software related', 'Architecting mobile applications: patterns and layers', 'User interface design: touch events, gestures, usability', 'Quality constraints: performance, security, availability'],
        query: 'Mobile+App+Design+UI+UX+Gestures+Touch+Events+BTech+AKTU' },
      { title: 'Unit III — Advanced Mobile Design', short: 'Multimedia, GPS, Cloud Integration',
        topics: ['Designing with multimedia and web access capabilities', 'Integration with GPS: location-based services', 'Social media networking application integration', 'Accessing applications hosted in cloud environment', 'Design patterns for mobile applications: MVC, MVVM'],
        query: 'Advanced+Mobile+Design+GPS+Cloud+Social+Media+BTech+AKTU' },
      { title: 'Unit IV — Android Development', short: 'Android Architecture, SQLite, Maps',
        topics: ['Introduction to Android, development environment setup', 'Android architecture: kernel, libraries, runtime, applications', 'Activities and Views, Android lifecycle', 'Interacting with UI, event handling', 'Persisting data using SQLite database', 'Google Maps, GPS, WiFi integration, social media'],
        query: 'Android+Development+Architecture+SQLite+Activities+BTech+AKTU' },
      { title: 'Unit V — iOS Development & Swift', short: 'iOS, Objective-C, Swift, Core Data',
        topics: ['Introduction to Objective-C basics', 'iOS features and UI implementation', 'Touch frameworks and gesture recognition', 'Data persistence using Core Data and SQLite on iOS', 'Location-aware applications using Core Location and Map Kit', 'Swift: introduction, features, syntax, iOS development with Swift'],
        query: 'iOS+Development+Swift+Objective+C+Core+Data+BTech+AKTU' },
    ],
    tips: [
      { h: 'Android Studio Setup', d: '<strong>Install Android Studio and run every tutorial code example</strong> — practicals test actual running app creation.' },
      { h: 'Activity Lifecycle', d: '<strong>Draw the Android Activity Lifecycle diagram from memory</strong> — always asked in AKTU theory exams.' },
      { h: 'SQLite Integration', d: '<strong>Practice building a CRUD app with SQLite in Android</strong> — most common practical exam requirement.' },
      { h: 'Design Pattern Comparison', d: '<strong>Know MVC vs MVVM for mobile apps</strong> — architectural pattern questions appear in theory.' },
    ],
  },

  'DEFAULT': {
    name: 'This Subject',
    importance: 'This is a core subject in your B.Tech CSE curriculum. Mastering it strengthens your academic profile, builds problem-solving skills, and prepares you for technical interviews and professional software development roles.',
    whyMatters: ['Core curriculum subject directly affecting your overall CGPA', 'Builds analytical and problem-solving skills used in all roles', 'Relevant to real-world software engineering and industry needs', 'May appear in campus placement written tests and interviews'],
    units: [
      { title: 'Unit I — Fundamentals', short: 'Core Concepts & Definitions',
        topics: ['Basic definitions and fundamental concepts of the subject', 'Introduction to key principles and theory', 'Historical background and motivation for study'],
        query: 'BTech+CSE+AKTU+subject+unit+1+fundamentals+important+topics' },
      { title: 'Unit II — Core Theory', short: 'Main Theoretical Framework',
        topics: ['Main theoretical framework and key algorithms', 'Core principles and mathematical foundations', 'Important theorems and their proofs'],
        query: 'BTech+CSE+AKTU+subject+theory+concepts+unit+2+important' },
      { title: 'Unit III — Practical Applications', short: 'Real-World Use Cases',
        topics: ['Real-world applications and case studies', 'Problem-solving methodology and approach', 'Industry relevance and use cases'],
        query: 'BTech+CSE+AKTU+subject+applications+unit+3+practical' },
      { title: 'Unit IV — Advanced Topics', short: 'Advanced Concepts',
        topics: ['Advanced theoretical concepts building on core', 'Complex problem types and solution strategies', 'Extensions and modern developments'],
        query: 'BTech+CSE+AKTU+advanced+topics+unit+4+important' },
      { title: 'Unit V — Exam Preparation', short: 'PYQs & Important Questions',
        topics: ['Previous year AKTU question patterns and important questions', 'Numerical problems and solution techniques', 'Short answer and long answer writing strategies'],
        query: 'BTech+CSE+AKTU+previous+year+question+paper+exam+preparation+important' },
    ],
    tips: [
      { h: 'AKTU PYQs First', d: '<strong>Solve last 5 years AKTU question papers</strong> — 70% questions repeat every year with slight variations.' },
      { h: 'Unit-wise Notes', d: '<strong>Make concise unit-wise notes in your own words</strong> — revision is 3x faster with personalized notes.' },
      { h: 'Textbook Examples', d: '<strong>Solve every example in the AKTU prescribed textbook</strong> — questions are always textbook-aligned.' },
      { h: 'Study Group', d: '<strong>Form a study group of 3-4 classmates</strong> — teaching others is the fastest way to solidify understanding.' },
    ],
  },
};

function getKB(subj) {
  const codes = subj.code.replace(/\*/g,'').split('/').map(c=>c.trim());
  for (const c of codes) if (SUBJECT_KB[c]) return SUBJECT_KB[c];
  const n = subj.name.toLowerCase();
  if (n.includes('engineering physics'))                            return SUBJECT_KB['BAS101'];
  if (n.includes('engineering chemistry'))                          return SUBJECT_KB['BAS102'];
  if (n.includes('mathematics-i') || n.includes('math i'))         return SUBJECT_KB['BAS103'];
  if (n.includes('mathematics-ii') || n.includes('mathematics ii')) return SUBJECT_KB['BAS203'];
  if (n.includes('electrical engg') || n.includes('electrical eng')) return SUBJECT_KB['BEE101'];
  if (n.includes('electronics engg') || n.includes('electronics eng')) return SUBJECT_KB['BEC101'];
  if (n.includes('programming') || n.includes('problem solving'))  return SUBJECT_KB['BCS101'];
  if (n.includes('data struct'))                                    return SUBJECT_KB['BCS301'];
  if (n.includes('organization') || n.includes('architecture'))    return SUBJECT_KB['BCS302'];
  if (n.includes('discrete'))                                       return SUBJECT_KB['BCS303'];
  if (n.includes('operating'))                                      return SUBJECT_KB['BCS401'];
  if (n.includes('automata') || n.includes('formal'))              return SUBJECT_KB['BCS402'];
  if (n.includes('java') || n.includes('object oriented'))         return SUBJECT_KB['BCS403'];
  if (n.includes('database') || n.includes('dbms'))                return SUBJECT_KB['BCS501'];
  if (n.includes('web tech'))                                       return SUBJECT_KB['BCS502'];
  if (n.includes('algorithm') || n.includes('daa'))                return SUBJECT_KB['BCS503'];
  if (n.includes('software eng'))                                   return SUBJECT_KB['BCS601'];
  if (n.includes('compiler'))                                       return SUBJECT_KB['BCS602'];
  if (n.includes('network'))                                        return SUBJECT_KB['BCS603'];
  if (n.includes('artificial intelligence'))                        return SUBJECT_KB['BCS701'];
  if (n.includes('internet of things') || n.includes('iot'))       return SUBJECT_KB['BCS070'];
  if (n.includes('cloud'))                                          return SUBJECT_KB['BCS071'];
  if (n.includes('cryptography'))                                   return SUBJECT_KB['BCS072'];
  if (n.includes('mobile') || n.includes('development of app'))    return SUBJECT_KB['BCS073'];
  return SUBJECT_KB['DEFAULT'];
}

// ═══════════════════════════════════════════════
// BUILD WEAK CARD — MENU DRIVEN
// ═══════════════════════════════════════════════

// ═══════════════ CSV VIDEO DATA ═══════════════
const VIDEO_DATA = {"BAS101": {"1": {"unit_name": "Quantum Mechanics", "groups": [["https://www.youtube.com/live/hQpugnbxH88?si=3ynq0MY0ixVZymBd"], ["https://youtu.be/gKkzxpGWbBo?si=X2FFaogBeORxlJZe"]], "notes": ["https://drive.google.com/file/d/1UfvKTKg6F8Tqnj4EXdm0qIHvHyXvoE4A/view?usp=drive_link"]}, "2": {"unit_name": "Electromagnetic Field Theory", "groups": [["https://youtu.be/Jz1_QnqknWs?si=KHMOrAeQCQzT-x0w"]], "notes": ["https://drive.google.com/file/d/1Dm9lo4J9EOs_Yd1r7kJUGiJ0qO9WxuRA/view?usp=drive_link"]}, "3": {"unit_name": "Wave Optics", "groups": [["https://youtu.be/I4foDkubPsA?si=kngLgAyVRgSP9tdE"]], "notes": ["https://drive.google.com/file/d/1I7-NMtv9HrOGqRNW8q1ani78xcPKCSQZ/view?usp=drive_link", "https://drive.google.com/file/d/1kJqxVkcTHoTQE1QN5jZ1619UdWZTIN6P/view?usp=drive_link"]}, "4": {"unit_name": "Fiber Optics & Laser", "groups": [["https://youtu.be/DkzyhhzSIzw?si=R3XodWhqNj6EP6AU"], ["https://youtu.be/Ea48rxlJuFw?si=FaFMkpGHeiufjAKm"]], "notes": ["https://drive.google.com/file/d/1Xj46PIheOgUEerMMQn5nlsLRTbbCmxuF/view?usp=drive_link"]}, "5": {"unit_name": "Superconductors & Nanomaterials", "groups": [["https://youtu.be/3FTAgnE4Quw?si=WRdawt8lmgjBc2Yl"]], "notes": ["https://drive.google.com/file/d/1he8IVjkQr71J_zvJsI1CQghZaFwxc_Lh/view?usp=drive_link"]}}, "BAS202": {"1": {"unit_name": "Molecular Structure & Advanced Materials", "groups": [["https://youtu.be/E1MikgBHcZU?si=HC0EBJ1YAL7Hgizi"], ["https://youtu.be/juqPnOtraMA?si=3-xR2pX_3e-4IInc"]], "notes": ["https://drive.google.com/file/d/17TZ34ZcOiomPM1QCuFO-Uzedoc9hsC4O/view?usp=drive_link"]}, "2": {"unit_name": "Spectroscopy & Stereochemistry", "groups": [["https://youtu.be/6P_rF3bPftk?si=ons0HWka89L7-xr_"], ["https://youtu.be/eZrH9RFsWyo?si=gu5kMuP6fDQTeFOp"]], "notes": ["https://drive.google.com/file/d/1qNZIkFWsOx7uHvo0uiGW_e4c3UXgDWoL/view?usp=drive_link"]}, "3": {"unit_name": "Electrochemistry, Batteries & Corrosion", "groups": [["https://youtu.be/DLnQ1E6_2kw?si=dx5Z_i-2Zfvl5NzM"], ["https://youtu.be/o1hwjgsOHTc?si=Qxtt7feT9kl6EC8a"]], "notes": ["https://drive.google.com/file/d/18eJxy-g-fgXEUZDjCa_RL08aTJwb08MP/view?usp=drive_link"]}, "4": {"unit_name": "Water Technology & Fuels", "groups": [["https://youtu.be/7RG3mTR03bo?si=tj2ZHlooS5ngEpYr"], ["https://youtu.be/y6m_LHjEd-c?si=myLcIM52zciFbIcR"]], "notes": ["https://drive.google.com/file/d/1wQI9JOAkdSu4QIGdkgbpEjHWYl5kPhwp/view?usp=drive_link"]}, "5": {"unit_name": "Polymers & Organometallic Compounds", "groups": [["https://youtu.be/79irlozeOlU?si=4xHz9EmQTTiACus-"], ["https://youtu.be/j0B2bfxRVWY?si=2vpUZWTSuPI09T-p"]], "notes": ["https://drive.google.com/file/d/1s-ASzZnip_YOqdfAwwWKJvSgwiyi01Da/view?usp=drive_link"]}}, "BAS103": {"1": {"unit_name": "Matrices", "groups": [["https://youtu.be/_G9deLSUhts?si=XGq1bHhRvm_6w2D_"], ["https://youtu.be/5Y5Qy0Qi8U4?si=nXWLAgprBfZqDlzg"]], "notes": ["https://drive.google.com/file/d/1UD9lq0bqQ6GCFtUoF275AgWiHCyJGmKh/view?usp=drive_link"]}, "2": {"unit_name": "Differential Calculus I", "groups": [["https://youtu.be/wLUV1G9g1XQ?si=gr5aBSJrl1Gq1B4r"], ["https://youtu.be/M7ERxgGeTtU?si=aTPmIgBHvA-CeQBq"]], "notes": ["https://drive.google.com/file/d/1kWDepgUglrpM1T4BlBjiYIUrqILKEv93/view?usp=drive_link"]}, "3": {"unit_name": "Differential Calculus II", "groups": [["https://youtu.be/v6ImBEiL7zE?si=u5OfVVtgCYd68P18"], ["https://youtu.be/5cUTRS3ty98?si=yXhNzfLgjEdTZOzT"]], "notes": ["https://drive.google.com/file/d/1qtYJci7ny7mE2FiiIAuND68YaBXihkA9/view?usp=drive_link"]}, "4": {"unit_name": "Multiple Integration", "groups": [["https://youtu.be/3v8bU85ojSE?si=VJDevwaeJQ6NaJCw"], ["https://youtu.be/gEE10G2GaJo?si=05yPAE33s0gXhUCg"]], "notes": ["https://drive.google.com/file/d/1UTG4uJ9pwlCZulQUbZJo0v-jhqvW9K1i/view?usp=drive_link"]}, "5": {"unit_name": "Vector Calculus", "groups": [["https://www.youtube.com/live/jGJ8J4Hs8AA?si=pEHI6XhPuB5qVsM4"], ["https://youtu.be/Rr9AMlewNCc?si=x20EbhjW5IWVZ500"]], "notes": ["https://drive.google.com/file/d/1KjmN-peSSA15gqPNFD3zipAMOlSyboFd/view?usp=drive_link"]}}, "BEE101": {"1": {"unit_name": "DC Circuits", "groups": [["https://youtu.be/ih92Q6XElFQ?si=ClS7y-FgdVS3Y3dZ"]], "notes": ["https://drive.google.com/file/d/1oN-SxUPtujpGTIhutNRVsJCogZg3af2g/view?usp=drive_link"]}, "2": {"unit_name": "AC Circuits", "groups": [["https://youtu.be/HaKTxkQsEzk?si=5lwll29mEEh90_mR"], ["https://youtu.be/7Kc7aXekwA4?si=lEGtbpQvOQJ1rmXA"]], "notes": ["https://drive.google.com/file/d/1NJQtwlPmnMrcv4kAdonKiwh99ME7hQRf/view?usp=drive_link"]}, "3": {"unit_name": "Transformers", "groups": [["https://youtu.be/9xqgbpOfhG4?si=KDo-Y86I-8Kubm_d"], ["https://youtu.be/wVL5X4DSVQo?si=IdE_G4JErqS5nlSr"]], "notes": ["https://drive.google.com/file/d/1Ht2RaEb6qHVUFKMYhZf30wFCujPWFFP7/view?usp=drive_link"]}, "4": {"unit_name": "Electrical Machines", "groups": [["https://youtu.be/ijppavftKEY?si=fDtAP06QdgvRFx48"], ["https://youtu.be/XGKB74FKD6E?si=f_PJwZcfGTNbuPJA"]], "notes": ["https://drive.google.com/file/d/12_yM-7wu8VrdObcGz2fLqFi-L5i-Qg5C/view?usp=drive_link"]}, "5": {"unit_name": "Electrical Installations", "groups": [["https://youtu.be/czUrC3t3zWM?si=TBJN5hHKUSNrUamS"]], "notes": ["https://drive.google.com/file/d/1u0VuZ0UMmZjhOu84QKNnPhepy0K52AJ_/view?usp=drive_link"]}}, "BCS101": {"1": {"unit_name": "Computer Basics & C Intro", "groups": [["https://youtu.be/AMrcsLzH47o?si=-zehIbBq1Xv67e3S"], ["https://youtu.be/G2D0NAYW02s?si=TzK7ZJVaBPC7xyMf"]], "notes": ["https://drive.google.com/file/d/10cGleK3gvANfSKaFXFtJ1k60XAama1yV/view?usp=drive_link"]}, "2": {"unit_name": "Operators & Conditional Branching", "groups": [["https://youtu.be/KVeJnyyUQ74?si=O1hMiShg-tVirTJc"], ["https://youtu.be/TdZywxKb2MI?si=uZbbt4-i3sC-wN57"]], "notes": ["https://drive.google.com/file/d/1Kfjcly1Azj0nVNPMdtQqK9LcFlV87p77/view?usp=drive_link"]}, "3": {"unit_name": "Loops & Arrays", "groups": [["https://youtu.be/yxE28OdICek?si=Hb1OS0q3Ws1wDEwB"], ["https://youtu.be/GHGqd5nhHAg?si=WeTK5g2ytigHCqrc"]], "notes": ["https://drive.google.com/file/d/1oZCTpdFIpnJ9o7yK0t-WuQkoffvtEr9_/view?usp=drive_link"]}, "4": {"unit_name": "Functions & Searching/Sorting", "groups": [["https://youtu.be/9s9irykFmJE?si=DRJvmOaHPasNl9Gw"], ["https://youtu.be/wv1pVTlJe1k?si=_BwLlGCCEg83WoJX"]], "notes": ["https://drive.google.com/file/d/1kwikWtgSj6apN2OwQZ0LlPcuoak8A-zi/view?usp=drive_link"]}, "5": {"unit_name": "Pointers & File Handling", "groups": [["https://youtu.be/lnv-hA07a9Q?si=3ADhy6aEtM_A5Fkx"], ["https://youtu.be/s6jWMQsL774?si=yohF0WZuJTsffdLf"]], "notes": ["https://drive.google.com/file/d/1-BVAZD_FQhRqJasGoFfJ8nPeEzcHxY-G/view?usp=drive_link"]}}, "BAS203": {"1": {"unit_name": "Ordinary Differential Equations", "groups": [["https://youtu.be/M2y9lwcy9tc?si=9qFBR5oITwLuMuPR"], ["https://youtu.be/2ltosOs5urM?si=GZ4Zf8j0qqDaa9xV"]], "notes": ["https://drive.google.com/file/d/1Q-wYFAA6en_ADBGcv54KiT04rkp4700M/view?usp=drive_link"]}, "2": {"unit_name": "Laplace Transform", "groups": [["https://youtu.be/wLUV1G9g1XQ?si=CFNNuPaI4UkMQAc-"], ["https://youtu.be/zYkPjNKmw10?si=FJ_4N0SqjQuGPyJj"]], "notes": ["https://drive.google.com/file/d/1ydv8Jx-MoUni37r_f-p4ce7GYaYqFusz/view?usp=drive_link"]}, "3": {"unit_name": "Sequence Series & Fourier", "groups": [["https://youtu.be/-OjTNcKtmuc?si=7ZEPwsQdwnG0wFB-"], ["https://youtu.be/H7fp14MMJYc?si=l2SBBbnPXP3wGxGH"]], "notes": ["https://drive.google.com/file/d/1u2BuZhu_5Zd3vR_xSNjlyEH31jLOgbky/view?usp=drive_link"]}, "4": {"unit_name": "Complex Variable - Differentiation", "groups": [["https://www.youtube.com/live/leeYyymYcdA?si=NcATsss9HNAm33DL"], ["https://youtu.be/jVurwurn-4E?si=V-QD-3AxxXiNh2r0"]], "notes": ["https://drive.google.com/file/d/1Xeq1o0gwgKohSff-BnOJbNn4qqkfXsXV/view?usp=drive_link"]}, "5": {"unit_name": "Complex Variable - Integration", "groups": [["https://www.youtube.com/live/jGJ8J4Hs8AA?si=n8oTxuEg1UlAvqLd"], ["https://youtu.be/L-SlsGV7gbs?si=vLt4NX308UAT7ZFt"]], "notes": ["https://drive.google.com/file/d/1zHGegUOI3zATr9HIT9pDlarNcCdwC01_/view?usp=drive_link"]}}, "BEC201": {"1": {"unit_name": "Semiconductor Diode & Applications", "groups": [["https://www.youtube.com/live/8EhayVMyIf0?si=xmzHL4OeGPPl0PYX", "https://www.youtube.com/live/mbQGkg4YXGw?si=V-GQpWZV9d-kLn3E"], ["https://youtu.be/7rH3i0cB7Pk?si=--Ub20fVe8ZZLTan"]], "notes": ["https://drive.google.com/file/d/1HnhLlS8CydYqBy6uz_lkEtCEphnhdcEK/view?usp=drive_link"]}, "2": {"unit_name": "BJT & FET", "groups": [["https://youtu.be/WOluBk-myRs?si=xI0hvAY__1I0XBDI", "https://youtu.be/YcWALyhY64g?si=YRJgz_yQ3KdqWwHM"], ["https://youtu.be/9Ev0fX1TQFU?si=clvgt-KphjE7C1Zj"]], "notes": ["https://drive.google.com/file/d/1xWaDN2brvakLZ2Ubn-yJ8Pbd9BZllWdk/view?usp=drive_link"]}, "3": {"unit_name": "Operational Amplifiers", "groups": [["https://youtu.be/5UuU-ayoaUA?si=wp8hXPztw7T1RqOD"], ["https://youtu.be/uwsZGaDY-2A?si=2IMH6v0GMXR4Ffmx"]], "notes": ["https://drive.google.com/file/d/1uJiJORO6in6satxmL0BecT75JGmmny9L/view?usp=drive_link"]}, "4": {"unit_name": "Digital Electronics", "groups": [["https://youtu.be/IWsHJ65UMYw?si=9J67d3IMlsSBBMcz"], ["https://youtu.be/BqsUFmo41jo?si=NATdLcRhdL0wX0QW"]], "notes": ["https://drive.google.com/file/d/1dCoF_MFFBUB9ssLBu008p1y-3Jn5M3VH/view?usp=drive_link"]}, "5": {"unit_name": "Communication Engineering", "groups": [["https://youtu.be/8OTMJ9EOnkc?si=LWoTVhRhXSU_aG24"], ["https://youtu.be/V_141AlYJ4w?si=Dtzzi_2OSIYpJ532"]], "notes": ["https://drive.google.com/file/d/1gcls8mBmMXlujC4QnZiJgwZsHZBYXALH/view?usp=drive_link"]}}, "BME201": {"1": {"unit_name": "Introduction to Mechanics", "groups": [["https://youtu.be/axCslafAj3s?si=ZKvrU_pMaB48_0lQ"], ["https://youtu.be/T_eGhkWHfdY?si=jcSqAx5TqobbUl5I"]], "notes": ["https://drive.google.com/file/d/1YyKWYqvDjDYTo0GH4nfh5vS2Lf_htIOX/view?usp=drive_link"]}, "2": {"unit_name": "IC Engines & Electric Vehicles", "groups": [["https://www.youtube.com/live/YTn_yWAVtlk?si=1dRVoJOkLsify15B"], ["https://youtu.be/c_lt7UqpuKA?si=JnKYtGufztJyXWJp"]], "notes": ["https://drive.google.com/file/d/1xomQHRg8_dhnGBrTs1qteS3z_F-0RyiP/view?usp=drive_link"]}, "3": {"unit_name": "Refrigeration & Air Conditioning", "groups": [["https://www.youtube.com/live/BRmUpdXqgak?si=uySl2qdVxXA0FIYp"], ["https://youtu.be/zm59TjQWyZQ?si=kRCTV5PuFNxgHwAt"]], "notes": ["https://drive.google.com/file/d/1FXlHvniRoLqUgH7X3bV18OKJsmGKDJ39/view?usp=drive_link"]}, "4": {"unit_name": "Fluid Mechanics & Applications", "groups": [["https://www.youtube.com/live/LiLxenn3_c0?si=TesU-Aaf-LWeYFrq"], ["https://youtu.be/jtcqPs1gcak?si=7zRqRChwAvcMv1m-"]], "notes": ["https://drive.google.com/file/d/1Syv1QkFgyBqd6jCDitxxXDjM_4glhEaA/view?usp=drive_link"]}, "5": {"unit_name": "Measurement & Mechatronics", "groups": [["https://youtu.be/PzeYfLOSqUc?si=X-DFTV9QnfTqLIm4"], ["https://youtu.be/mxbzyB26GZU?si=Th2OWgawJQ7tG77O"]], "notes": ["https://drive.google.com/file/d/1dK8qej0U28KSn-14BXOQaUo3E5xJQW04/view?usp=drive_link"]}}, "BCS301": {"1": {"unit_name": "Intro Arrays & Linked Lists", "groups": [["https://youtu.be/MGvtT2PAy7Y?si=ykMwO8wmc88dYPS_", "https://youtu.be/3sqQ7NU27jQ?si=3-h5GqWN2geNsRa4"], ["https://youtu.be/khhbLVYj0lw?si=pHkN5MKYGBkmUk1D"]], "notes": ""}, "2": {"unit_name": "Stack Queue Hashing & Searching", "groups": [["https://youtu.be/8VABGAxd-bs?si=1k_8Lxw9ENvF1V2H", "https://youtu.be/AwuHcW4wyuc?si=YxcpZvldbFqkrO5O"], ["https://youtu.be/mRXgPKNXGkU?si=Uddaup1k5hs5Ociz"]], "notes": ""}, "3": {"unit_name": "Sorting Algorithms", "groups": [["https://youtu.be/Z0lbKQ65gaY?si=np4usrdY5DFPwZhz"], ["https://youtu.be/cdYpmSzl4Ho?si=k2_pX356Ztm8mJTN"]], "notes": ""}, "4": {"unit_name": "Trees", "groups": [["https://youtu.be/JXj2oRUh-q4?si=gRu0Fh__926cnaxW"], ["https://youtu.be/2JLWQ-y-8bQ?si=dOu6xpY_mQk9WfhE", "https://youtu.be/hwcIUJL6E0k?si=0bhc347WjeFYbweN"]], "notes": ""}, "5": {"unit_name": "Graphs", "groups": [["https://youtu.be/I5DwOT4y0og?si=3N3gCj2WZCIHLmlN"], ["https://youtu.be/ZYKhSzbyfVY?si=BrQdKpoC_HZPa4hx"]], "notes": ""}}, "BCS302": {"1": {"unit_name": "Digital Systems & Processor Org", "groups": [["https://youtu.be/f34Hkfi4XkQ?si=ZxGZqEA8aNaqlgRC"], ["https://youtube.com/playlist?list=PLbR6csVS47axPR67Wvqsfd0O1a-H1TdYE"]], "notes": ["https://drive.google.com/file/d/1rBomwQPyId3K_BYkTgpDTd-eD5YUcyLa/view?usp=drive_link"]}, "2": {"unit_name": "ALU Design", "groups": [["https://youtu.be/SnJ-B5GBaqA?si=uNEjX9w3ucMaoHIY", "https://youtu.be/zSpBLP2IRWM?si=DEzoBPHW0azfncYI", "https://youtu.be/xFUxgx_d3Go?si=5DoMXpPwpd0W5pnI"], ["https://youtube.com/playlist?list=PLbR6csVS47axEBzsW1nW2CVxKvxxbyPlL"]], "notes": ["https://drive.google.com/file/d/14lGmJwxlpOQy-tQ82sOTeLD8gzVnjclF/view?usp=drive_link"]}, "3": {"unit_name": "Control Unit & Pipelining", "groups": [["https://youtu.be/r8GBMJcY-Qg?si=A4Vtz_PIoRndw7hS"], ["https://youtube.com/playlist?list=PLbR6csVS47awMQrlhVrQUTMq6jJa77jB1"]], "notes": ["https://drive.google.com/file/d/1LBhmnKh7StIVF2f0oEzYOMpGODk8KqLZ/view?usp=drive_link"]}, "4": {"unit_name": "Memory Organization", "groups": [["https://youtu.be/HwgucKL_20I?si=NyFsxC5uuIWuKgGO"], ["https://youtube.com/playlist?list=PLbR6csVS47azErKv-r6bpgQZEBUhVyyuI"]], "notes": ["https://drive.google.com/file/d/1vW4YUYgnQn2NtyY8XKV0ArrcS9O93JxH/view?usp=drive_link"]}, "5": {"unit_name": "Input Output & Interrupts", "groups": [["https://youtu.be/N6gA__vhyto?si=mSwe9-iP8uO5IwZ5"], ["https://youtube.com/playlist?list=PLbR6csVS47ayZCsTyx6wYrK7Oe5SnFu4I"]], "notes": ["https://drive.google.com/file/d/10o1CNvfNhZkYT_rImdYNMVfKvAkgTwOP/view?usp=drive_link"]}}, "BCS303": {"1": {"unit_name": "Set Theory & Relations", "groups": [["https://www.youtube.com/live/bwQTVGmN_0Q?si=oLZt_THM1DmC41KC"], ["https://youtu.be/670qGwsOHVw?si=u15QiUIdJQ3casl4", "https://youtu.be/hosYgdNf8zE?si=ZyCAImhMwh55pUyr"]], "notes": ""}, "2": {"unit_name": "Functions & Boolean Algebra", "groups": [["https://youtu.be/gLr1rex-a6w?si=C5byOoGGcQlHNb7s"], ["https://youtu.be/QVJHZI917NQ?si=OqwKWR73Sb6LXaDU"]], "notes": ""}, "3": {"unit_name": "Propositional & Predicate Logic", "groups": [["https://youtube.com/playlist?list=PL85PVKtl_5F_nn5cyXu2K_8pYT6Y8PTCE"], ["https://youtu.be/paB_wfKbkYM?si=NOUV0HDfZIGeQqf5"]], "notes": ""}, "4": {"unit_name": "Algebraic Structures", "groups": [["https://youtube.com/playlist?list=PLiGYlU7857_p-3zQ7UutdBhlhZBcpHm0d"], ["https://youtu.be/4HaDMQmCz8Q?si=86Hv7lnbZG3RDK1p"]], "notes": ""}, "5": {"unit_name": "Graph Theory & Combinatorics", "groups": [["https://youtube.com/playlist?list=PL5Dqs90qDljVHOauiaYftbfAF4GZhLb3N"], ["https://youtu.be/asqPVwIIlPA?si=ueruBKnCGMiH9Y4h"]], "notes": ""}}, "BCS401": {"1": {"unit_name": "Process Management", "groups": [["https://youtu.be/Q75jSdVpdgA?si=9dxwUZOzKzqQthBN"], ["https://youtu.be/3Thj3z7pBO4?si=jeyMpNqg6GX2PBI5"]], "notes": ["https://drive.google.com/file/d/1LJXvOZZCZpY5dkdmNt8uRHV5zRGpXNlc/view?usp=drive_link"]}, "2": {"unit_name": "CPU Scheduling", "groups": [["https://youtu.be/c0Xv8WI6XXQ?si=xOfpdmItyc2RrpQC"], ["https://youtu.be/7GMClMclKPg?si=RsSA9C91CJZVeTHs"]], "notes": ["https://drive.google.com/file/d/11ggTcu1Kpfj7tZhqm9cQ3pyqVayoSngJ/view?usp=drive_link"]}, "3": {"unit_name": "Synchronization & Deadlock", "groups": [["https://youtu.be/1_0KlUmYj34?si=-G47LardoXjwfhJS"], ["https://youtu.be/m3X5CeecezQ?si=Rh-yMR3ShMTqbDkR"]], "notes": ["https://drive.google.com/file/d/1v2t5tiwNg3LD5tkCmxCozXCrRUSdaL3t/view?usp=drive_link"]}, "4": {"unit_name": "Memory Management", "groups": [["https://youtu.be/u10rg1IcS1g?si=eFkZ5oaw20Us2ozF"], ["https://youtube.com/playlist?list=PLmTfHZlm2zKh75ct37sAjfogKUTATmArj"]], "notes": ["https://drive.google.com/file/d/1IP_8ESQvJmY_0yN2O4GAdBiUCmp96JSc/view?usp=drive_link"]}, "5": {"unit_name": "Virtual Memory File Systems & Disk", "groups": [["https://youtu.be/NxYxGdJrx-g?si=iQd-v28WlBV2jge2"], ["https://youtu.be/eESIFJz7mJw?si=wtiELpTtICZyu7h_"]], "notes": ["https://drive.google.com/file/d/1BOCmqDQP1ikzV_k24AZVNnCt7f5sXU2m/view?usp=drive_link"]}}, "BCS402": {"1": {"unit_name": "Finite Automata", "groups": [["https://youtu.be/cSFLFLoRgHo?si=E5R2naeFEaz8DRHK"], ["https://youtu.be/GdmJ50KIDRo?si=9BgVfdPpiGLJWh05"], ["https://youtube.com/playlist?list=PLm4NqDEJsy5pxkIRROFb3rpMNTfMEqOPn"]], "notes": ["https://drive.google.com/file/d/19waynDVRWtOYHYaIrAtGfJsdoxivLdTL/view?usp=drive_link"]}, "2": {"unit_name": "Regular Expressions & Pumping Lemma", "groups": [["https://youtu.be/8k-wpd4rLYU?si=xh2EawJxqYzKYpiR"], ["https://youtu.be/lEwdIRHz4jk?si=wQ9MCVI5pxOFH4PN"], ["https://youtube.com/playlist?list=PLm4NqDEJsy5q0TxHudNPCW0cqjjK7PjEu"]], "notes": ["https://drive.google.com/file/d/1RT5NZ1_SB0Ftvvpon4KNNWYp8mTO_Un4/view?usp=drive_link"]}, "3": {"unit_name": "Context Free Grammars", "groups": [["https://youtu.be/Hf3z9S_lkKw?si=nqbzyhJ28Q_3JUXB"], ["https://youtube.com/playlist?list=PLm4NqDEJsy5oIzJdTsO9pJQOHz442SU9R"]], "notes": ["https://drive.google.com/file/d/1pxcKM4QBJaLp4YoiXj3aTIqYMGE0o4Pb/view?usp=drive_link"]}, "4": {"unit_name": "Pushdown Automata", "groups": [["https://youtu.be/zLXkEofjIGc?si=WcoSTIQnafIocgoF"], ["https://youtube.com/playlist?list=PLm4NqDEJsy5rb2C6O862nYrq2Qbn-Aki1"]], "notes": ["https://drive.google.com/file/d/1sbPTw5UWiJXBUx0kwI4OzZ8aKWe3vdE-/view?usp=drive_link"]}, "5": {"unit_name": "Turing Machines & Decidability", "groups": [["https://youtu.be/XhJLr4zNfs8?si=k-oXXdNd1wM4GIS3"], ["https://youtube.com/playlist?list=PLm4NqDEJsy5rwDrr-evysMablkUHTTyz3"]], "notes": ["https://drive.google.com/file/d/1jXEf-y0evY-QVsSkDQdGi7qUbcEX0sAB/view?usp=drive_link"]}}, "BCS403": {"1": {"unit_name": "Java Basics & OOP Intro", "groups": [["https://youtu.be/v4vgH64vARs?si=8sddNNLwe5pD_vAw"], ["https://youtu.be/32tp0Ot2JtU?si=449sFg_H9knqaWSh"]], "notes": ["https://drive.google.com/file/d/1IeGQkdPCLNlftYMaRHkQeUkK_hYN7BAP/view?usp=drive_link"]}, "2": {"unit_name": "Inheritance & Polymorphism", "groups": [["https://youtu.be/sPblRxmUSZU?si=Y3bx9sGu3wb_SZfw"], ["https://youtu.be/7iaJDKI72SY?si=9WAx1JNkYmZ4knGJ"]], "notes": ["https://drive.google.com/file/d/1VDY4fVf5Womq4qGl7-OhJiL7sA4TFnWm/view?usp=drive_link"]}, "3": {"unit_name": "Abstraction & Interfaces", "groups": [["https://youtu.be/IimSajOGlCw?si=CdJJphGajotu21zb"], ["https://youtu.be/sFn1sHiA4lQ?si=2zp_lFdl052Db7Rm"]], "notes": ["https://drive.google.com/file/d/1VGf3GLEuATHr2f0tlflLN7cKN-nc-ae9/view?usp=drive_link"]}, "4": {"unit_name": "Exception Handling & Collections", "groups": [["https://youtu.be/VKrpjLd2lT4?si=XFkTyY3nlZZPgTpF"], ["https://youtu.be/Oc9UFrMEIzc?si=WEhQnPTbwkbNTVhu", "https://youtu.be/ybBXaCQ5eWY?si=Ks-pGj-DJFiDDqBd"]], "notes": ["https://drive.google.com/file/d/1t81Dd-gtus8tbgAiv3CCYGGARZQ4Bpii/view?usp=drive_link"]}, "5": {"unit_name": "Multithreading & File IO", "groups": [["https://youtu.be/Zjz6o8YOqoo?si=fN1Rr3C2OIe6Eu2R"], ["https://youtu.be/puOpt4M1kz0?si=24a0LVcYr4ST1ZmG"]], "notes": ["https://drive.google.com/file/d/1tDdv8TFZDeF2-4Kh3aonYWijg60Bdyfe/view?usp=drive_link"]}}, "BCS501": {"1": {"unit_name": "ER Model & Database Architecture", "groups": [["https://youtube.com/playlist?list=PLFnnUST2z6IWHrHx00ozeUObEp9sWvROf"], ["https://youtu.be/ptlIJiIByMc?si=g4Fkr4w5Sx39EJ1J"], ["https://youtu.be/LovaDSejjso?si=UlvCQ7-1uOAD6UEd", "https://youtu.be/bUCk7YQIOqI?si=B5NCuhhX70cLlXM9"]], "notes": ""}, "2": {"unit_name": "Relational Model & SQL", "groups": [["https://youtu.be/N835hBBARcM?si=p4xP8WLNZ_07nHbS", "https://youtu.be/VuxvA-QZ-aU?si=pwIIOYI5MNDg2t4x"], ["https://youtu.be/jRReZoQi1hw?si=rcc1WGnbIvISml1K"], ["https://youtube.com/playlist?list=PLxiqTMxJd6p-HmxKmsj3EchCLcfrOUrfW"]], "notes": ""}, "3": {"unit_name": "Database Normalization", "groups": [["https://youtu.be/XDCnFvDSvHo?si=2HNhh2SkOH4LhkUq"], ["https://youtu.be/VAd8Audkxro?si=9EGLQvZvWkjJ11eS"], ["https://youtube.com/playlist?list=PLFnnUST2z6IVVatNtp5qm9W7p5a_Ze-Qn"]], "notes": ""}, "4": {"unit_name": "Transaction Processing", "groups": [["https://youtu.be/1o3ZTHybPB0?si=6LLG9GGn9gdgnlvH"], ["https://youtu.be/0Skq_YqrHjg?si=cAbBzH3QTx54n836"], ["https://youtube.com/playlist?list=PLxiqTMxJd6p-ek27zNTSyk7GN5ag9fva6"]], "notes": ""}, "5": {"unit_name": "Concurrency Control", "groups": [["https://youtu.be/QQBgThI4Mek?si=ILrOtQwjeXV2ihG1"], ["https://youtu.be/oR6IXFrJBEk?si=18r4rMgUgz25KlHX"]], "notes": ""}}, "BCS502": {"1": {"unit_name": "HTML XML & Web Basics", "groups": [["https://youtu.be/sgOgUFG6yag?si=J1pdarLThQmY9-xl"], ["https://youtu.be/SWuH37dcbWk?si=stVFLxfnjGq4z8wN"]], "notes": ""}, "2": {"unit_name": "CSS Basics & Advanced", "groups": [["https://youtu.be/TxH3vHjdf-U?si=qoxl-rVCwtDyx2Re"], ["https://youtu.be/SWuH37dcbWk?si=52ozbiCT4qY8TQT5"]], "notes": ""}, "3": {"unit_name": "JavaScript & Networking", "groups": [["https://youtu.be/V43FwA2-XaY?si=jSd7C7KpsdPrMc5H"], ["https://youtu.be/Xv7Nf13U8r4?si=7uHOvLBLEA2qtLWy"]], "notes": ""}, "4": {"unit_name": "Enterprise Java & NodeJS", "groups": [["https://youtu.be/TK8Arv0DRQk?si=PY4ZVL7ZLQ420IGq"], ["https://youtu.be/yPdlU8KQI-g?si=CLd64i545ETHLDKI"]], "notes": ""}, "5": {"unit_name": "Servlets & JSP", "groups": [["https://youtu.be/HibCAlJn3rw?si=PjCHuc5xKuTQ4swd"], ["https://youtu.be/KuX7nikYzEo?si=4XeY90vGLUiJ-dWB"]], "notes": ""}}, "BCS503": {"1": {"unit_name": "Complexity & Advanced Sorting", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOcTkf6OQwJHaJc1gUHHNc9o"], ["https://youtu.be/E0GNxIr7o48?si=goGLcWsF1_lBu5Ul"]], "notes": ""}, "2": {"unit_name": "Advanced Data Structures", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOeBHLQvHMrzr3I0q4QPMQ36"], ["https://youtu.be/PKNweFcxcXM?si=gE8gKibgJajEsx-v", "https://youtu.be/2D2GSD69QrA?si=tgPaGSP1HT0K546F"]], "notes": ""}, "3": {"unit_name": "Divide Conquer & Greedy", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOe135CcWKdlRjJL0g8Vhlb6"], ["https://youtu.be/Y5f7mx6ES6Q?si=Nb5xlbgLp90KQAdf"]], "notes": ""}, "4": {"unit_name": "Dynamic Programming & Backtracking", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOe5gkG4yKovhZyWNxHWs4oe"], ["https://youtu.be/HBGLo3iaD_I?si=dTQqwAEXrkK0BEcN"]], "notes": ""}, "5": {"unit_name": "NP-Completeness & Approximation", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOeJCHcCM6suu0gZK0nrRBmi"], ["https://youtu.be/TXPiiG9vAdE?si=jM-lHpagdt-qOMOU"]], "notes": ""}}, "BCS601": {"1": {"unit_name": "Introduction & SDLC Models", "groups": [["https://youtu.be/yCO4sPi_nIY?si=DTo7q795h3dcePcQ"], ["https://youtu.be/hCNPGQA_na8?si=0zYDjAS-RRJTn05m"]], "notes": ["https://drive.google.com/file/d/1dbrhOvLGrF9JD_EFxR-9te2fj_ozmDgi/view?usp=drive_link"]}, "2": {"unit_name": "SRS & Software Quality Assurance", "groups": [["https://youtu.be/46qI5yO_NEQ?si=fGLAlWA8_NQryNDC", "https://youtu.be/N1upqP0KxS8?si=0AKDWNhaM6xXHbKG", "https://youtu.be/d6qOki-dUrg?si=7GPMM1TmuaVGhM2r"], ["https://youtu.be/hCNPGQA_na8?si=NoyIYojWXIXJOkn7"]], "notes": ["https://drive.google.com/file/d/1qEWkAmvPYizMy7xrVu0JxTAbCLMVaNop/view?usp=drive_link"]}, "3": {"unit_name": "Software Design & Metrics", "groups": [["https://youtu.be/d6qOki-dUrg?si=sm5vyD8-SNFnWsOY"], ["https://youtu.be/HIVjaayA_8s?si=BpcnlE26sZ1zDD7T"]], "notes": ["https://drive.google.com/file/d/1yugTjAKKppLOFm_bXlwbNHAUuyFBi9vv/view?usp=drive_link"]}, "4": {"unit_name": "Software Testing", "groups": [["https://youtu.be/yXbi-A-IHKQ?si=qpzeY5XdPG5dy-D4"], ["https://youtu.be/1Fi5YxoenM4?si=EImr2L3C-_bduuIb"]], "notes": ["https://drive.google.com/file/d/1qgxJmXdxlwiR0S8RDq9Rr2uonzoklacI/view?usp=drive_link"]}, "5": {"unit_name": "Maintenance & Project Management", "groups": [["https://youtu.be/MzAQ8IwskHI?si=cCi6FRg3giETTlKP"], ["https://youtu.be/hHqZKan0LvU?si=8TCU8rgcwUownqqO"]], "notes": ["https://drive.google.com/file/d/1TyehjfzNEuoJvuJFGOa5tAQ2uL7Cgn5C/view?usp=drive_link"]}}, "BCS602": {"1": {"unit_name": "Lexical Analysis & Parsing Intro", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOdJv749DkBEEJp-zo6lMeJ4"], ["https://youtu.be/nzfFjhq2rjc?si=M3WnTTki_8BKZ_sh"], ["https://youtu.be/SvR_cEVGLO8?si=GyXSspJqkkw3mKOX"]], "notes": ["https://drive.google.com/file/d/1tc1P-7dub4dDtL44xTb-pIjP5qkvj5Z1/view?usp=drive_link"]}, "2": {"unit_name": "Parsing Techniques", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOczSAhInVk1rQvOoj1wTDhq"], ["https://youtu.be/6XBU5xPXjY0?si=qqQb1n31QGWPgljZ"], ["https://youtu.be/WAtnk2ibHLM?si=Fgd8WvjkLxnQMQ2R"]], "notes": ["https://drive.google.com/file/d/1GqPArhDuE-414JbTOcouJ5hb7I_F_UlL/view?usp=drive_link"]}, "3": {"unit_name": "Syntax Directed Translation", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOfXvSMw5kZj7g-OCLAXcfd0"], ["https://youtu.be/703UfTIyEys?si=zIs0lTTkf7VzfZMe"], ["https://youtu.be/3BVjW6difM4?si=64z0QB0vclBvc7S8"]], "notes": ["https://drive.google.com/file/d/1nljBkorHzylaz3zngw827RUclQf8uJsW/view?usp=drive_link"]}, "4": {"unit_name": "Symbol Tables & Runtime", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOfNye2xC8t_Bf-S7J60yfpi"], ["https://youtu.be/XGdpdmrnrRs?si=EGsJUsn-n3lO2G5a"], ["https://youtu.be/0m47tNTJ2ow?si=O57w421ViesYfdff"]], "notes": ["https://drive.google.com/file/d/1iVYXvvnEHgLmax4-ulFWI-BCq-SYl5NR/view?usp=drive_link"]}, "5": {"unit_name": "Code Generation & Optimization", "groups": [["https://youtube.com/playlist?list=PLHupihdLJYOcyqfo7W2s2dr1r66SpvpBQ"], ["https://youtu.be/tRfbUM1e9v0?si=RtDgpnC0u41_h_z8"], ["https://youtu.be/Aay6TJ-vba0?si=Yug4EWGDNp87GTY1"]], "notes": ["https://drive.google.com/file/d/1Wv4lBNEIxGhFrxpJfFPt0Diitcf8dI80/view?usp=drive_link"]}}, "BCS603": {"1": {"unit_name": "OSI Model TCP/IP & Physical Layer", "groups": [["https://youtu.be/LXgczgNPPVo?si=AuMCeoLPoAZnuysO"], ["https://youtu.be/rFGR4HvgyME?si=MrhYQZuGxf7bgLey"]], "notes": ""}, "2": {"unit_name": "Data Link Layer & MAC", "groups": [["https://youtu.be/cTyGMAMr9Wc?si=fPdg-1wnOAJExbFG", "https://youtu.be/Pw6ctwoOfPU?si=cwm4iVXTCaK2-2QH", "https://youtu.be/-h-9NE80omk?si=0yEwvaU5OorSMedl"], ["https://youtube.com/playlist?list=PLFnnUST2z6IVQHGaA0zDRZ9UgpQ4yMsMy"]], "notes": ""}, "3": {"unit_name": "Network Layer", "groups": [["https://youtu.be/VORzdPIhCTs?si=YrjVnYRl-nrm0Iiv"], ["https://youtube.com/playlist?list=PL1KcDRI9303dr0YaWBF_ngoOrBwJjhWFI"], ["https://youtu.be/tU3PWZRyN30?si=webj2Vo1Xx5RiipN"]], "notes": ""}, "4": {"unit_name": "Transport Layer", "groups": [["https://youtu.be/b50d0xUTg-8?si=R3T6qfG0i3MMNXEg"], ["https://youtu.be/SwJt5P71Cdo?si=wm8W9xFA8vaWX_qe"], ["https://youtube.com/playlist?list=PLCBBGWvyvQRuCFg1Z88kOrSwpkk5y-Y5M"]], "notes": ""}, "5": {"unit_name": "Application Layer & Security", "groups": [["https://youtu.be/VORzdPIhCTs?si=fD0jWOYZ1Nm2YLF1"], ["https://youtu.be/5vNEuPxGEAg?si=Dz-GVDbXt1NLZ_4d"], ["https://youtube.com/playlist?list=PL1KcDRI9303fnUVFrx8iDaYOlKUvwoLlK"]], "notes": ""}}, "BCS701": {"1": {"unit_name": "AI Intro & Intelligent Agents", "groups": [["https://youtu.be/2wyd_oxfq0Y?si=rNh_HdHHY8nxi2FA"], ["https://youtu.be/Nx1nlVFt1FE?si=YXAt482Psv8-LVvH"], ["https://youtu.be/JIiT_vB9YQU?si=VC3Syni7iiSsX6Yc"]], "notes": ["https://drive.google.com/file/d/1FfWOLPgH8uvRVpjH9_TnNa9xvxsYT7kt/view?usp=drive_link"]}, "2": {"unit_name": "Search Strategies & Game Playing", "groups": [["https://youtu.be/FMX_Yqd9VFM?si=5poH3ky7KwqbQ6BN"], ["https://youtu.be/Vln7x9P8QzM?si=e3Ul2JHzTVAc0F5Y"], ["https://youtu.be/a2mY3MDzVkg?si=i4roHxeYq8d9J5IA", "https://youtu.be/ajmSJcgGR-4?si=vKJiPT03v7XGR9N_"]], "notes": ["https://drive.google.com/file/d/1q6ZxzD2jlcopXhe-yO_kbl9anowek87L/view?usp=drive_link"]}, "3": {"unit_name": "Knowledge Representation & Reasoning", "groups": [["https://youtu.be/nUAndl0WkbA?si=V6uvH-btZPLm6ddx"], ["https://youtu.be/vGgGHF4VeY8?si=vvmDydGz09QzCPOJ"], ["https://youtu.be/xFVIpL1PLLw?si=q09_HjU_-Uv9u6X2"]], "notes": ["https://drive.google.com/file/d/10VjKkKPH0oKNAOHKfSbSZFsPCFYmhvLg/view?usp=drive_link"]}, "4": {"unit_name": "Uncertainty & Learning", "groups": [["https://youtu.be/vZu5Ku3D-R4?si=IOJp16O4swZCxwOq"], ["https://youtu.be/_VX7iXNpFQc?si=QCWazmnaUQqDGRPE"], ["https://youtu.be/l3eduwCzagI?si=xe0IEOfNF9mMt2UD"]], "notes": ["https://drive.google.com/file/d/1hn116m8tQFymCePYzGItF52x4l2Czh4Q/view?usp=drive_link"]}, "5": {"unit_name": "AI Applications & Multi-Agent Systems", "groups": [["https://youtu.be/QFhrLeG0u7Q?si=uQ0k7p0ntJt-7nJA"], ["https://youtu.be/gdPUGUNMoZQ?si=d9Cvcrca1HShuP_F"], ["https://youtu.be/fVaBr7-6Y6k?si=tLDxzcZ62CpttAbn"]], "notes": ""}}, "BCS070": {"1": {"unit_name": "IoT Fundamentals & M2M", "groups": [["https://youtu.be/KYTMtohl8p4?si=IIPP-r1If4dydnCm"], ["https://youtu.be/kHZe67KuomQ?si=Kl7wCB-oJ0OMtNw9"]], "notes": ["https://drive.google.com/file/d/1vJe1V6UMM8zdjk6Isb5WYjhRGOTMQW_c/view?usp=drive_link"]}, "2": {"unit_name": "IoT Hardware & Embedded Platforms", "groups": [["https://youtu.be/mSQMXXtz_Sk?si=0MYkKt7fToL-Aht0"], ["https://youtu.be/h37moQEbQUA?si=ii3lmCuF01bUjiSF"]], "notes": ["https://drive.google.com/file/d/17Dlahl9QTw5_3-m0mRnti9ZU7-LWGOWC/view?usp=drive_link"]}, "3": {"unit_name": "IoT Networking & Protocols", "groups": [["https://youtu.be/SrihBAZQw_k?si=MKdubtHOICE1GSX7"], ["https://youtu.be/O9POAGwaOGw?si=q6VIsw6WwzimYStI"]], "notes": ""}, "4": {"unit_name": "Arduino Programming for IoT", "groups": [["https://youtu.be/syWtR6FqsmM?si=crRs39CruiryPK2v"], ["https://youtu.be/E6ul2bhqYTU?si=o20YvDZxktUtLx9y"]], "notes": ["https://drive.google.com/file/d/1zG2uC9Qf4-YSMUib9OHREsqskog7wMyV/view?usp=drive_link"]}, "5": {"unit_name": "IoT Challenges & Applications", "groups": [["https://youtu.be/cEvLvf3C5r4?si=xAnCcwPMOlzN_gZb"], ["https://youtu.be/cEvLvf3C5r4?si=THjbN8OIdTnkj7sw"]], "notes": ["https://drive.google.com/file/d/1YNqTm7J9CjBrn9MpQkU6AUl7z_nxImIr/view?usp=drive_link"]}}, "BCS071": {"1": {"unit_name": "Introduction to Cloud Computing", "groups": [["https://youtu.be/XkbuolPtwwo?si=JW9WlEvedCJdzcq2"], ["https://youtu.be/f2lVHm43bFs?si=va1johGNOs5TU-tt"], ["https://youtu.be/kDfmzClPEQo?si=j_bghM6Quoa4-Jlp"]], "notes": ["https://drive.google.com/file/d/1TXLqMDhHuNFzX51Na4u09nVcZ1gHrI-C/view?usp=drive_link"]}, "2": {"unit_name": "Virtualization & SOA", "groups": [["https://youtu.be/LQwN8JuO5-U?si=jYkQNmi7wk9r9LKk"], ["https://youtu.be/sVIYGOlLfXA?si=ekxtsY1bLqOz0Enm"], ["https://youtu.be/yrw8YUk8YQE?si=_IfkyicY1fXaPJTz"]], "notes": ["https://drive.google.com/file/d/1l_MZJoDbYK3Wz3ETqX9nvigzUVBblE1H/view?usp=drive_link"]}, "3": {"unit_name": "Cloud Architecture & Storage", "groups": [["https://youtu.be/NU5x-p_3_hs?si=GyGfU9qy0dPBIaPW"], ["https://youtu.be/7E3uBBxFVkc?si=RZbbe2Mc-K6pBc_P"], ["https://youtu.be/7lYDJlsHlFU?si=gTjC6lT_D7mFOc5z"]], "notes": ["https://drive.google.com/file/d/15Y8lVnIdWf-J1CIIbnNM-JkwzETUa4bu/view?usp=drive_link"]}, "4": {"unit_name": "Resource Management & Security", "groups": [["https://youtu.be/nLTfGOIISPo?si=-w4Jk5AUAd_fF4Zw"], ["https://youtu.be/in-dFdym1Rw?si=jCGgV9DSLbiOEF2s"], ["https://youtu.be/dJmms8byBm8?si=WYjPUHg5saHx8nat"]], "notes": ["https://drive.google.com/file/d/1cepTccQ0BlHGIM506tdqj9VzOfeW8nmm/view?usp=drive_link"]}, "5": {"unit_name": "Cloud Technologies & Federation", "groups": [["https://youtu.be/DCTtTn-adrs?si=Tq4RidueVy0sMQJb"], ["https://youtu.be/rBNSEEwJnc8?si=5lhz_XvAxbfaTTQP"], ["https://youtu.be/AT1Tg33rpXg?si=rtn9IEioCnd9Q1ut"]], "notes": ["https://drive.google.com/file/d/1wvjCJQcD9VJbmvsswYkUsw78VAET-uHd/view?usp=drive_link"]}}, "BCS072": {"1": {"unit_name": "Classical & Symmetric Encryption", "groups": [["https://youtu.be/OoL1ZoyfIgg?si=9pw7ATHItVgMibaK"], ["https://youtu.be/2tkbSfTN_II?si=KsagpI4SRSTaoN0L"]], "notes": ["https://drive.google.com/file/d/1YYMGHUpZMVZ_jEuzhagyV4FcsQedkpI6/view?usp=drive_link"]}, "2": {"unit_name": "Public Key Cryptography", "groups": [["https://youtu.be/7y-49yjo3AY?si=v86PaTyssJxsv4EH"], ["https://youtu.be/wrFbxzbDlK8?si=oV8C7uhNWwH-Te16", "https://youtu.be/0ZSZGch5BoE?si=S1WcT66yq1CHnilj", "https://youtu.be/eeEjme-IIUo?si=8v-SFhcCFx7JY5Ow", "https://youtu.be/EHZXMLkj3qo?si=te3e42VCMplXBT3X"]], "notes": ["https://drive.google.com/file/d/1iyMdwTwNrL_semauDee5tTJeGod6gtqg/view?usp=drive_link"]}, "3": {"unit_name": "Hash Functions & Digital Signatures", "groups": [["https://youtu.be/EdMA1H0E4RM?si=g8lFdC8i4X3YHvCO"], ["https://youtu.be/HEkvgnNYIT0?si=OepZUYj93_x_xAGf", "https://youtu.be/5G9kkfGli-w?si=6gox1tOc07tcU4lL"]], "notes": ["https://drive.google.com/file/d/1EhH2iEOHaiPKsp-uWmgX5dAjwbivChaS/view?usp=drive_link"]}, "4": {"unit_name": "Key Management & Authentication", "groups": [["https://youtu.be/m6eoliMjJCY?si=uclc9cOAKvQwF5NE"], ["https://youtu.be/yhGgpaUOOjk?si=QA3ge0hlKLIBbzNn"]], "notes": ["https://drive.google.com/file/d/1z-A8NxZwJgZyw1QIl0B1i-D6z9UVgrnT/view?usp=drive_link"]}, "5": {"unit_name": "Network Security Protocols", "groups": [["https://youtu.be/L4M-2NRT4Tk?si=3y0XpgrVl7wCjEjS"], ["https://youtu.be/JWEls-XCpas?si=1O4Nc3ijvEoYKY1_"]], "notes": ""}}, "BCS073": {"1": {"unit_name": "Mobile App Introduction", "groups": [["https://youtu.be/ihCrr6jDabU?si=-u7zqkdYE4NvGCPj"]], "notes": ["https://drive.google.com/file/d/1nAQcUjGd2kWj9B_j2_ODR9zPmDZWjVWP/view?usp=drive_link"]}, "2": {"unit_name": "Basic Mobile App Design", "groups": [["https://youtu.be/SewRmY2F1rY?si=Aa_0M7BxWEpam6-h"]], "notes": ["https://drive.google.com/file/d/1krU0DJQS4cNNdXNVdJ34wkIf5uY96WrS/view?usp=drive_link"]}, "3": {"unit_name": "Advanced Mobile Design", "groups": [["https://youtu.be/3t0t1GVe2xE?si=4u9dMBoWxzFzPLG7"]], "notes": ["https://drive.google.com/file/d/1exhHZtAe3e-hnrcumJwTRxRmcmgHESwo/view?usp=drive_link"]}, "4": {"unit_name": "Android Development", "groups": [["https://youtu.be/Z6q498kLNpc?si=bVVOS1_O1NSYyohH"]], "notes": ["https://drive.google.com/file/d/1gwUVaSxWtQQNmeHueoChfm2JN521P7M3/view?usp=drive_link"]}, "5": {"unit_name": "iOS Development & Swift", "groups": [["https://youtu.be/sLI3QDG06q4?si=Lg3rNClANZO0pGO2"]], "notes": ["https://drive.google.com/file/d/1pP3H8qHp3dQnw2P2Ad19a2WPrEN3eG_D/view?usp=drive_link"]}}, "BAS-104": {"1": {"unit_name": "Environment", "groups": [["https://youtu.be/bsSl93-2LcM?si=ONrPVCD2NIpgV0lQ"], ["https://www.youtube.com/live/LHDbD8hDxQw?si=LoDF1BZSq9yHXIq_"]], "notes": ["https://drive.google.com/file/d/1EDX-DOk4zNUlIcBIri_yPdqAbHWVFMrg/view?usp=drive_link"]}, "2": {"unit_name": "Natural Resources", "groups": [["https://youtu.be/rHK0Rbt7NI4?si=tyL6hDDfmfdBbcgx"], ["https://youtu.be/WsWU8CVXlA0?si=XcAIBSs3WKtpuaGx"], ["https://youtu.be/BmNXoKM2VqA?si=0kQWRZ9K1aytjKMI"]], "notes": ["https://drive.google.com/file/d/1h7OI2jut-B_oNo6l5M0uuj5l1g1Y-13F/view?usp=drive_link"]}, "3": {"unit_name": "Pollution and their Effects", "groups": [["https://youtu.be/uq7-YXZhJ8k?si=CtYVAQMJo5yfh6bw"], ["https://youtu.be/rsjPoqjpz4E?si=yN47NcklBwirIaXl"], ["https://www.youtube.com/live/9Dtc6eb5bYE?si=gC7qFTa3xc7ERT0Q"]], "notes": ["https://drive.google.com/file/d/1G2J9AaUUKfR2IONik_SgAkqT02cHq2Ca/view?usp=drive_link"]}, "4": {"unit_name": "Current Environmental Issues of Importance", "groups": [["https://youtu.be/PeoBM1cBL-U?si=x3Vk34ZzPwOJlVou"], ["https://youtu.be/BYXxAhl1nsE?si=szKt7LeeNFfqK-E4"], ["https://youtu.be/VGdyOUsU5wA?si=BOZUDNl3yrnu7eVS"]], "notes": ["https://drive.google.com/file/d/1EeF-WrNNW9kn_htBMxKfhNeNUJXuRd3Z/view?usp=drive_link"]}, "5": {"unit_name": "Environmental Protection", "groups": [["https://youtu.be/UzAdOyHdAPA?si=-9xTGDRznvI0twM0"], ["https://youtu.be/0OBCaX31SDY?si=O1SDRDJWpBoshQB0"], ["https://youtu.be/2eNzHF4F54w?si=Ynteu2aDFRlOslux"]], "notes": ["https://drive.google.com/file/d/16lcKmKcDkg17n_NWfthnO1qsZzwBt5OO/view?usp=drive_link"]}}, "BAS-205": {"1": {"unit_name": "Applied Grammar and Usage", "groups": [["https://youtu.be/Ch_Nvd5y-lk?si=A3cPZbmZZdstN0I-"], ["https://youtu.be/5jGvZ6OJ6kw?si=RVCIJIKQEBV8Cf6y"]], "notes": ["https://drive.google.com/file/d/1nsMETgHxQ9WRl0zoJO-XhxGRp7rbQTtW/view?usp=drive_link"]}, "2": {"unit_name": "Listening and Speaking Skills", "groups": [["https://youtu.be/PtmQvjE-Vjo?si=L87mQdkprynzMPbs"], ["https://youtu.be/C37aYzPOIP4?si=CEdWSalkXBfU7tC9"]], "notes": ["https://drive.google.com/file/d/1pLJuaZuzR4rGdDow2ZJXiS1X4lxv0Y7l/view?usp=drive_link"]}, "3": {"unit_name": "Reading and Writing Skills", "groups": [["https://youtu.be/SakoD6FeIfM?si=FqU3xg3LjpNelB1i"], ["https://youtu.be/MRDg3wLCdKk?si=4_jQdbEqPzVr6nqs"]], "notes": ["https://drive.google.com/file/d/1bijUjYBn3WJ8lz2Wbz6gbF4pKendd7oD/view?usp=drive_link"]}, "4": {"unit_name": "Presentation and Interaction Skills", "groups": [["https://youtu.be/pC8nTkIFGgU?si=briJ8dwaIpuSBmkf"], ["https://youtu.be/TkoAIhbSW4M?si=nuP17QcuvpgIBIra"]], "notes": ["https://drive.google.com/file/d/1JA6n6aUkdXwmIRTry6TrKhhjkAa21uSw/view?usp=drive_link"]}, "5": {"unit_name": "Work- place skills", "groups": [["https://youtu.be/9mkk3pCLiVA?si=sIING0vjMyYFjn_3"], ["https://youtu.be/uZomhevXJr0?si=OqahDe9WzC45xCIy"]], "notes": ["https://drive.google.com/file/d/1R-v4uFnQqopm8FJhg4qA3VIcBxn7Wdlf/view?usp=drive_link"]}}, "BAS-301": {"1": {"unit_name": "Fundamentals of Communication and voice dynamics", "groups": [["https://youtu.be/cYi1WzF5WBU?si=Dp7yVVN8-P3AXRfP"], ["https://youtu.be/Ch_Nvd5y-lk?si=2l__oLG9nLaBjKx9"]], "notes": ""}, "2": {"unit_name": "Communication Skills for Career Building", "groups": [["https://youtu.be/3eGk6bMwEY8?si=6EHUR6ClrQ4X6mWH"], ["https://youtu.be/PtmQvjE-Vjo?si=ddKXRwipbk0Gsrvs"]], "notes": ""}, "3": {"unit_name": "Thesis,Project writing, Speech Delivery", "groups": [["https://youtu.be/I1jaJ8BVIo0?si=HFDmQ3eTJNTKMS7A"], ["https://youtu.be/SakoD6FeIfM?si=OKlTh_hFGTmcCSvk"]], "notes": ""}, "4": {"unit_name": "Communication & Leadership Devlopment", "groups": [["https://youtu.be/ekNw1sGJF6g?si=olGVZO5r1WZIWtiu"], ["https://youtu.be/pC8nTkIFGgU?si=gcHzgyoV__dBCVR_"]], "notes": ""}, "5": {"unit_name": "Digital communication & Personality Making", "groups": [["https://youtu.be/a8xvM_XZ3vk?si=xZZ6EnAN_EyVqx1_"], ["https://youtu.be/9mkk3pCLiVA?si=cY36Ta5607ut6zTW"]], "notes": ""}}, "BVE-401": {"1": {"unit_name": "Introduction to Value Education", "groups": [["https://youtu.be/5UIGlm91mg8?si=0zVqcWdKCTWx5gnK"], ["https://youtu.be/EuLSEQz7AgQ?si=Z0oHEuTPh31wAHkg"], ["https://youtu.be/HDXIsoYVclI?si=dGXrZItW0T8Guw9W"]], "notes": ""}, "2": {"unit_name": "Harmony in Human Being", "groups": [["https://youtu.be/rjyhhUyUvsg?si=qFgim20YcPVLClp_"], ["https://youtu.be/80tSiIZp-UA?si=JrQ31I2UVzrVQpaP"], ["https://youtu.be/vTS5jChA8g4?si=WhlUfQxpx9Yj0pSV"]], "notes": ""}, "3": {"unit_name": "Understanding Harmony in Family & Society", "groups": [["https://youtu.be/LRAQO8KnnXo?si=OcFrn6xRVv_Px-_t"], ["https://youtu.be/-XTzDwrZZj4?si=XTkwiJ1yZ_lY83OS"], ["https://youtu.be/0Ro50En_1zc?si=5K82e75ONJw7Acfa"]], "notes": ""}, "4": {"unit_name": "Harmony in the Nature & Existence", "groups": [["https://youtu.be/IxC9ZU_hAIg?si=Nw4puSjKHhD_JJUq"], ["https://youtu.be/6_e6EfxVJ0A?si=lPFchLpJEXx_EsAM"], ["https://youtu.be/V2g-TDMy_Gs?si=CAQdWuU_jdymD8JW"]], "notes": ""}, "5": {"unit_name": "Implications of the above Holistic Devlopment on Professional Ethics", "groups": [["https://youtu.be/N4THgWw31Mk?si=sR4SBPl8qrzrDivp"], ["https://youtu.be/tWyH1kZlOjs?si=x3Dccath-c66Zcqx"]], "notes": ""}}, "BCC-302": {"1": {"unit_name": "Introduction to Python", "groups": [["https://youtu.be/Mqb7DisNssE?si=pUE4emzdPWLXBDzQ"], ["https://youtu.be/MEiMVHOy1HM?si=0FpcT3uqGumyJqiQ"], ["https://youtu.be/Qj-dJMKmW0I?si=6N0QvmMfLhMLwuoP"]], "notes": ""}, "2": {"unit_name": "Python Program Flow Control & Conditional Blocks", "groups": [["https://youtu.be/8cuSfKeiTv4?si=q3tK7SarMJ_pEl-Y"], ["https://youtu.be/7emifNrLNxU?si=ub0MTHTLIMLFmA-I"], ["https://youtu.be/BoBqxWC80M0?si=F6rOdnLQOAe9A_SP"]], "notes": ""}, "3": {"unit_name": "Python Complex Data Types", "groups": [["https://youtu.be/F4XbFO7fWt4?si=4HivPo5Ql2fuXnj1"], ["https://youtu.be/7emifNrLNxU?si=J1nAzvgyeBvrUThy"], ["https://youtu.be/vHZ5wcG8ekc?si=q9ZkyerZFsUbd9q0"]], "notes": ""}, "4": {"unit_name": "Python File Operations", "groups": [["https://youtu.be/AVDjx-B7Feg?si=3zjdphuwYI0VgRih"], ["https://youtu.be/vFh2DtDWYDQ?si=iK_WOFTZictrb1ME"], ["https://youtu.be/Fi56mDSm30k?si=QWKCGQOxyBZlpQjt"]], "notes": ""}, "5": {"unit_name": "Python Packages", "groups": [["https://youtu.be/vrbZJ9thn-8?si=GY0zX4hlxtPjI1OE"], ["https://youtu.be/5YFauvO4JV4?si=w2UVmyK9WrqwSPS9"], ["https://youtu.be/hESpb99EAXE?si=vZlmzKE2xwqIYgLp"]], "notes": ""}}, "BCC-301": {"1": {"unit_name": "Introduction to Cyber Crime", "groups": [["https://youtu.be/g1ZfTBQn3uY?si=RkLjDD6c6vTeT8qn"], ["https://youtu.be/mq-opWuIv90?si=N-lbWdeBEhd_g3rD"]], "notes": ["https://drive.google.com/file/d/1_MQhHJiOJZA8mSf0HvwPZIkdWIL00tX5/view?usp=drive_link"]}, "2": {"unit_name": "Cyber Crime", "groups": [["https://youtu.be/W4yGnqEgqEU?si=QnXcQqpfoN3dUULq"], ["https://youtu.be/zxG1F7THqgs?si=uy8PxWgB9vZxEAeG"]], "notes": ["https://drive.google.com/file/d/1neuAwvp6rdxcY8k1EYZoTGMfAo905TLW/view?usp=drive_link"]}, "3": {"unit_name": "Tools and Methods used in Cyber Crime", "groups": [["https://youtu.be/iAUf5LyQc7o?si=_BEgwGdymWgHvz7L"], ["https://youtu.be/LZFdr3a9ICs?si=XYE_2VQCA_3XCiBw"]], "notes": ["https://drive.google.com/file/d/17DlivRPzTv4e6TBEKNkSxZRK3APEBwIK/view?usp=drive_link"]}, "4": {"unit_name": "Understanding Computer Forensics", "groups": [["https://youtu.be/fZ_fQyo1_fg?si=6XPm3Imr0stvWGap"], ["https://youtu.be/N10KcMu3TWA?si=Qu_HcIehuBvWsuH0"]], "notes": ["https://drive.google.com/file/d/1gTPq7LEaWhtOXP-ZIoPLoQxZPf2DqTHs/view?usp=drive_link"]}, "5": {"unit_name": "Introduction of Securitiy policies and laws", "groups": [["https://youtu.be/ajA4DXaqaso?si=Pd_ELz-3wka57Jom"], ["https://youtu.be/r-pX8ixkelg?si=TPjfNKX7DThEr5H5"]], "notes": ["https://drive.google.com/file/d/1nMWxt5cs4_Tx3GK2gz5pcemUGA39I693/view?usp=drive_link"]}}, "BAS-303/404": {"1": {"unit_name": "Partial Differenetial Equations", "groups": [["https://www.youtube.com/live/Rwsz6KMZzWM?si=x070TCd5guroVGVY"], ["https://youtube.com/playlist?list=PL5Dqs90qDljXYjZ8kDHtpMqPGKNGb2dxu"], ["https://youtu.be/dZFNVDExUJ4?si=GT4ZVbdA0RnZ5kbc"]], "notes": ["https://drive.google.com/file/d/1Zju6gGphqAdyIuQE5NCt-qMGXphMDxLH/view?usp=drive_link"]}, "2": {"unit_name": "Applications of PDE and Fourier Transform", "groups": [["https://youtube.com/playlist?list=PL92QhapxkNLFbjBos-MlDDORNgIbCCH6V"], ["https://youtube.com/playlist?list=PL5Dqs90qDljXzMS_nQYRxqCnNlwlEtE1_"], ["https://youtu.be/qncPh0H8VV8?si=bv1NZ4e8jCEtNUuM"]], "notes": ["https://drive.google.com/file/d/1J4j0uwKZpB7d5a5vLtDAVn8ytxMz04gv/view?usp=drive_link"]}, "3": {"unit_name": "Stasticial Techniques", "groups": [["https://youtu.be/CTjk1zz7nws?si=rF0BQZJet5KzZ3cy"], ["https://youtu.be/_-_4Q99R1nU?si=Zzdc9 glj-BrRo2t8"], ["https://youtube.com/playlist?list=PL5Dqs90qDljVF5-HxU829qWUMRFwDAu3v"]], "notes": ["https://drive.google.com/file/d/1KJycgztV-FrTdUWIP9sliiAULKhSEFjW/view?usp=drive_link"]}, "4": {"unit_name": "Stasticial Techniques-II", "groups": [["https://youtu.be/GA6xYFScxlI?si=4sdF2eKCkMHaL6KD"], ["https://youtu.be/bbujGGLLH-4?si=4TwZKAguCxr6L8bE"], ["https://youtube.com/playlist?list=PL5Dqs90qDljWiE0fK-akBQXH2yp2OWXVr"]], "notes": ["https://drive.google.com/file/d/10t7Qq2ogdeAX52TPbr1x1PrOPL5tx05q/view?usp=drive_link"]}, "5": {"unit_name": "Stasticial Techniques-III", "groups": [["https://youtu.be/kFZbmnKX5f0?si=pM7Kmc4oqk_I0nGD"], ["https://youtu.be/PKYCqV1tSYw?si=ihOYMl8cflEnDhm4"], ["https://youtu.be/kkDZFJ3E1FQ?si=QtqGLu-KejjgQkKy"]], "notes": ["https://drive.google.com/file/d/1y6L7reyJGch5AAwkL4ijAgmgE22CVH6j/view?usp=drive_link"]}}, "BOE-410": {"1": {"unit_name": "Digital Systems and Binary Numbers", "groups": [["https://youtu.be/r9USM-kdg_M?si=NgbclY4kUGbZEjGR"], ["https://youtu.be/0A9iGFPlH1k?si=j-XZcndrudf5SfNc"]], "notes": ""}, "2": {"unit_name": "Combinational Logic", "groups": [["https://youtu.be/OakjqxOFyA4?si=rEya5Hl_wbp_9IjV"], ["https://youtu.be/pD_eWi-Snv4?si=ULNjSPOfiwsA6bKW"]], "notes": ""}, "3": {"unit_name": "Sequential logic and its Applications", "groups": [["https://youtu.be/Xbg6EUZWKiY?si=rjrIx77_gMDkaW4V"]], "notes": ""}, "4": {"unit_name": "Synchronous and Asynchronous Sequential Circuit", "groups": [["https://youtu.be/s8K267-tDyY?si=N-AsmaIU-JALCxJe"]], "notes": ""}, "5": {"unit_name": "Memory and Programmable Devices", "groups": [["https://youtu.be/_HY-XMzKbGY?si=9OtrsjG7BOOPlCLM"]], "notes": ""}}};
function getCSVData(code) {
  if (!code) return null;

  // Remove wildcards like * and split by /
  const raw = code.replace(/\*/g,'').split('/').map(c=>c.trim()).filter(Boolean);

  // Build candidate list
  const candidates = new Set();
  raw.forEach(p => {
    if (!p) return;
    candidates.add(p);
    // Short suffix like "102" -> "BAS102"
    if (/^\d{3}$/.test(p) && raw[0] && raw[0].length > 3) {
      candidates.add(raw[0].slice(0, raw[0].length - 3) + p);
    }
    // Remove hyphens: BCC-301 -> BCC301
    candidates.add(p.replace(/-/g,''));
    // Add hyphens: BCC301 -> BCC-301, BAS303 -> BAS-303
    candidates.add(p.replace(/^([A-Z]+)(\d)/, '$1-$2'));
    // Handle 3-digit suffix with slash: BAS303 -> BAS-303/404
    candidates.add(p.replace(/^([A-Z]+[-]?)(\d{3})$/, '$1$2'));
  });

  for (const c of candidates) {
    if (c && VIDEO_DATA[c]) return VIDEO_DATA[c];
  }

  // Fuzzy match: normalize both sides
  const norm = s => s.replace(/[^A-Z0-9]/gi,'').toUpperCase();
  // Try each part of the slash code
  for (const p of raw) {
    const normP = norm(p);
    if (!normP) continue;
    for (const key of Object.keys(VIDEO_DATA)) {
      if (norm(key) === normP || norm(key).startsWith(normP) || normP.startsWith(norm(key).slice(0,5))) {
        return VIDEO_DATA[key];
      }
    }
  }
  return null;
}

function getCSVUnitName(code, unitNum) {
  const d = getCSVData(code);
  return (d && d[String(unitNum)]) ? d[String(unitNum)].unit_name : null;
}

function renderAnalyserVideos(code, unitNum) {
  const d = getCSVData(code);
  if (!d) return '';
  const ud = d[String(unitNum)];
  if (!ud || !ud.groups || !ud.groups.length) return '';
  const cols  = ['#06b6d4','#8b5cf6','#10b981','#f59e0b'];
  const lbls  = ['▶ Video 1','▶ Video 2','▶ Video 3','▶ Video 4'];
  let html = '<div class="analyser-vid-row">';
  ud.groups.forEach((grp, vi) => {
    const col = cols[vi % cols.length];
    const lbl = lbls[vi % lbls.length];
    if (grp.length === 1) {
      html += `<a href="${grp[0]}" target="_blank" class="analyser-vid-btn" style="border-color:${col};color:${col}">${lbl}</a>`;
    } else {
      grp.forEach((url, pi) => {
        html += `<a href="${url}" target="_blank" class="analyser-vid-btn" style="border-color:${col};color:${col}">${lbl} Pt.${pi+1}</a>`;
      });
    }
  });
  // Notes: support array (multiple files) or string (single)
  if (ud.notes) {
    const notesList = Array.isArray(ud.notes) ? ud.notes : (ud.notes ? [ud.notes] : []);
    notesList.forEach((nl, ni) => {
      if (nl) html += `<a href="${nl}" target="_blank" class="analyser-vid-btn" style="border-color:#10b981;color:#10b981">${notesList.length > 1 ? '📄 Notes Pt.'+(ni+1) : '📄 Notes'}</a>`;
    });
  }
  html += '</div>';
  return html;
}
// ══════════════════════════════════════════════

function buildWeakCard(item, idx) {
  const { subj, si, ji, marks, thresh, gap, status } = item;
  const sem = SEMESTERS[si];
  const kb  = getKB(subj);
  const id  = `wcard-${si}-${ji}`;
  const isBorder = status === 'border';
  const sc  = isBorder ? '#f59e0b' : '#ef4444';
  const barPct  = Math.max(4, Math.min(100,(marks/100)*100)).toFixed(1);
  const thPct   = (thresh/100*100).toFixed(1);
  const grade   = getGrade(marks);

  const unitsHTML = kb.units.map((u, ui) => {
    const unitNum  = ui + 1;
    const csvName  = getCSVUnitName(subj.code, unitNum);
    const dispName = csvName || u.title;
    const vidHTML  = renderAnalyserVideos(subj.code, unitNum);
    const fallback = vidHTML ? '' : `<a class="unit-vid-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(u.query)}" target="_blank" rel="noopener">▶ Watch Videos</a>`;
    return `<div class="unit-card" id="${id}-unit-${ui}">
      <div class="unit-header" onclick="toggleUnit('${id}-unit-${ui}')">
        <div class="unit-left">
          <div class="unit-num">${unitNum}</div>
          <div>
            <div class="unit-title-text">${dispName}</div>
            <div class="unit-subtitle">${u.short}</div>
          </div>
        </div>
        <span class="unit-arrow">▶</span>
      </div>
      <div class="unit-body">
        <div class="topic-list">
          ${u.topics.map(t=>`<div class="topic-item"><div class="topic-dot"></div><span>${t}</span></div>`).join('')}
        </div>
        ${vidHTML}${fallback}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="weak-card ${isBorder?'borderline':''}" id="${id}">

    <!-- HEADER -->
    <div class="wc-top">
      <div class="wc-left">
        <div class="wc-code">${subj.code.replace(/[*]+/g,'').replace(/\/[A-Z0-9*]+/g,'').trim()} &nbsp;·&nbsp; ${sem.label} &nbsp;·&nbsp; ${subj.type}</div>
        <div class="wc-name">${subj.name}</div>
        <div class="wc-sem">${subj.credits} Credits &nbsp;·&nbsp;
          <span style="color:${sc}">${isBorder?'⚠️ Borderline — only +'+gap+' above threshold':'🔴 Below threshold by '+Math.abs(gap)+' marks'}</span>
        </div>
      </div>
      <div class="wc-marks-block">
        <div class="wc-mark-pill"><div class="mpl">Your Marks</div><div class="mpv ${isBorder?'border':'low'}">${marks}</div></div>
        <div class="wc-mark-pill"><div class="mpl">Min Required</div><div class="mpv need">${thresh}</div></div>
        <div class="wc-mark-pill"><div class="mpl">Gap</div><div class="mpv ${isBorder?'border':'low'}">${gap>0?'+':''}${gap}</div></div>
        ${grade?`<div class="wc-mark-pill"><div class="mpl">Grade</div><div class="mpv" style="color:var(--purple)">${grade.grade}</div></div>`:''}
      </div>
    </div>

    <!-- MARKS BAR -->
    <div style="padding:0 1.8rem 1rem;">
      <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim);margin-bottom:4px;">
        <span>0</span><span style="color:${sc}">Min: ${thresh}</span><span>100</span>
      </div>
      <div class="wc-gap-bar" style="position:relative;">
        <div class="wc-gap-fill" style="width:${barPct}%;background:linear-gradient(90deg,${sc},${sc}77)"></div>
        <div style="position:absolute;left:${thPct}%;top:-2px;width:2px;height:12px;background:var(--cyan);border-radius:1px;"></div>
      </div>
    </div>

    <!-- MENU -->
    <div class="wc-menu-row">
      <button class="wc-menu-btn active" onclick="switchMenu('${id}','why',this)">🎯 Why Important</button>
      <button class="wc-menu-btn"        onclick="switchMenu('${id}','units',this)">📚 Unit-wise Topics</button>
      <button class="wc-menu-btn"        onclick="switchMenu('${id}','tips',this)">💡 Study Tips</button>
    </div>

    <div class="wc-panel-body">

      <!-- WHY PANEL -->
      <div class="wc-panel active" id="${id}-why">
        <p class="why-intro">${kb.importance}</p>
        <div class="why-box">
          <div class="why-box-title">Why This Subject Matters For Your Career</div>
          <ul class="why-list">${kb.whyMatters.map(w=>`<li>${w}</li>`).join('')}</ul>
        </div>
        <div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.18);border-radius:10px;padding:0.9rem 1.1rem;">
          <div style="font-size:0.68rem;color:#ef4444;letter-spacing:2px;font-weight:700;margin-bottom:6px;">📊 YOUR SITUATION</div>
          <div style="font-size:0.88rem;color:var(--text-muted);line-height:1.6;">
            You scored <strong style="color:${sc}">${marks}/100</strong> in <strong style="color:var(--text)">${subj.name}</strong>.
            Minimum expected for a ${subj.credits}-credit subject is <strong style="color:var(--cyan)">${thresh}</strong>.
            You need <strong style="color:#10b981">${Math.max(0,thresh-marks)} more marks</strong> to reach the threshold.
            Click <strong style="color:var(--cyan)">📚 Unit-wise Topics</strong> to see exactly what to study! 👉
          </div>
        </div>
      </div>

      <!-- UNITS PANEL -->
      <div class="wc-panel" id="${id}-units">
        <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:1rem;letter-spacing:0.3px;">
          Click any unit to expand topics. Click <strong style="color:#f87171">▶ Watch Videos</strong> to open YouTube for that unit.
        </div>
        <div class="units-grid">${unitsHTML}</div>
      </div>

      <!-- TIPS PANEL -->
      <div class="wc-panel" id="${id}-tips">
        <div class="tips-grid">
          ${kb.tips.map((t,i)=>`
            <div class="tip-row">
              <div class="tip-num">${i+1}</div>
              <div class="tip-txt"><strong>${t.h}:</strong> ${t.d}</div>
            </div>
          `).join('')}
        </div>
        <div class="target-box-new">
          <div class="tbn-title">🎯 YOUR PERSONAL TARGET</div>
          <div class="tbn-text">
            Current Score: <strong style="color:${sc}">${marks}</strong> &nbsp;→&nbsp;
            Minimum Required: <strong style="color:var(--cyan)">${thresh}</strong> &nbsp;→&nbsp;
            Ideal Target: <strong style="color:#10b981">${Math.min(100,thresh+15)}</strong><br>
            <span style="font-size:0.82rem;">Focus on 2–3 key units from the <strong>📚 Unit-wise Topics</strong> tab. That alone can close this gap.</span>
          </div>
        </div>
      </div>

    </div>
  </div>`;
}

function switchMenu(cardId, panel, btn) {
  document.querySelectorAll(`#${cardId} .wc-panel`).forEach(p=>p.classList.remove('active'));
  document.querySelectorAll(`#${cardId} .wc-menu-btn`).forEach(b=>b.classList.remove('active'));
  document.getElementById(`${cardId}-${panel}`).classList.add('active');
  btn.classList.add('active');
}

function toggleUnit(unitId) {
  const card = document.getElementById(unitId);
  card.classList.toggle('open');
}


function updatePictograph() {
  // Use back-aware values so the visual report always shows the LATEST result
  const { cgpa: cgpaBack, hasAnyBack: pictoHasBack } = calcCGPAWithBack();
  const cgpaBase = calcCGPA();
  const cgpa = (pictoHasBack && cgpaBack > cgpaBase) ? cgpaBack : cgpaBase;

  // Build per-semester SGPA array using back-aware values where available
  const allSGPAs = SEMESTERS.map((_, si) => {
    const base = calcSGPA(si);
    const { sgpa: withBack, hasAnyBack } = calcSGPAWithBack(si);
    return (hasAnyBack && withBack > base) ? withBack : base;
  });

  const filledSems = allSGPAs.filter(s => s > 0);

  // Big ring
  const circumference = 534;
  const pct = cgpa / 10;
  document.getElementById('big-gauge-fill').style.strokeDashoffset = circumference - pct * circumference;
  document.getElementById('big-cgpa-text').textContent = cgpa.toFixed(2);

  // Grade label for CGPA
  const cgpaGrade = cgpa === 0 ? '–' : (cgpa >= 9 ? 'A+' : cgpa >= 8 ? 'A' : cgpa >= 7 ? 'B+' : cgpa >= 6 ? 'B' : cgpa >= 5 ? 'C' : cgpa >= 4 ? 'D' : 'F');
  document.getElementById('big-cgpa-grade').textContent = cgpaGrade;

  // Stat cards
  if (filledSems.length > 0) {
    const best = Math.max(...filledSems);
    const bestIdx = allSGPAs.indexOf(best);
    document.getElementById('ps-best-val').textContent = best.toFixed(2);
    document.getElementById('ps-best-sem').textContent = `Semester ${bestIdx + 1}`;
    document.getElementById('ps-sems-val').textContent = `${filledSems.length}/8`;

    // Trend
    if (filledSems.length >= 2) {
      const last = allSGPAs.filter(s => s > 0);
      const trend = last[last.length - 1] - last[last.length - 2];
      document.getElementById('ps-trend-val').textContent = (trend >= 0 ? '↑ ' : '↓ ') + Math.abs(trend).toFixed(2);
      document.getElementById('ps-trend-sub').textContent = trend >= 0 ? 'Improving' : 'Dropped';
      document.getElementById('ps-trend-val').style.color = trend >= 0 ? '#10b981' : '#ef4444';
    }
  }

  // Bar chart — uses back-aware SGPAs
  const bars = document.getElementById('picto-bars');
  const gradColors = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#3b82f6','#ec4899','#22d3ee','#a78bfa'];
  bars.innerHTML = allSGPAs.map((s, i) => {
    const h = s > 0 ? Math.max((s / 10) * 140, 6) : 4;
    const col = s > 0 ? gradColors[i] : 'rgba(100,116,139,0.2)';
    return `
      <div class="picto-bar-col">
        <div class="picto-bar-val">${s > 0 ? s.toFixed(1) : ''}</div>
        <div class="picto-bar" style="height:${h}px; background: linear-gradient(180deg, ${col}, ${col}88);" title="Sem ${i+1}: ${s > 0 ? s.toFixed(2) : 'N/A'}"></div>
      </div>
    `;
  }).join('');

  // Grade distribution — must pass subj so grace logic applies correctly
  const gradeCounts = {};
  GRADING.forEach(g => gradeCounts[g.grade] = 0);
  gradeCounts['E#'] = 0; // ensure E# slot exists
  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit) return;
      const entry = marksData[si][ji];
      // Use back paper external if available (latest result)
      const backExt = backData[si] && backData[si][ji];
      const backNum = parseFloat(backExt);
      let g;
      if (!isNaN(backNum) && backExt !== '' && (subj.type === 'Theory' || subj.type === 'Elective')) {
        // Only use back result if original was F or E# — ignore stale back data for passing subjects
        const origGrade = getGrade(entry, subj);
        const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
        if (origIsFailOrGrace) {
          const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
          const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) };
          g = getGradeNoGrace(backEntry);
        } else {
          g = origGrade;
        }
      } else if (subj.internalOnly) {
        g = getGradeForInternalOnly(entry, subj);
      } else {
        g = getGrade(entry, subj); // subj passed → grace applies correctly
      }
      if (g) gradeCounts[g.grade] = (gradeCounts[g.grade] || 0) + 1;
    });
  });

  const gradeColors = { 'A+': '#06b6d4', 'A': '#8b5cf6', 'B+': '#818cf8', 'B': '#10b981', 'C': '#f59e0b', 'D': '#f97316', 'E#': '#fb923c', 'F': '#ef4444' };
  const gradeEmoji = { 'A+': '🏆', 'A': '⭐', 'B+': '✅', 'B': '👍', 'C': '📚', 'D': '⚠️', 'E#': '🔶', 'F': '❌' };

  document.getElementById('picto-grade-dist').innerHTML = Object.entries(gradeCounts)
    .filter(([, cnt]) => cnt > 0)
    .map(([grade, cnt]) => {
      const color = gradeColors[grade] || '#64748b';
      const dots = Array(Math.min(cnt, 12)).fill(`<div class="pgb-dot" style="background:${color}"></div>`).join('');
      return `
        <div class="picto-grade-block">
          <div class="pgb-grade" style="color:${color}">${gradeEmoji[grade] || ''} ${grade}</div>
          <div class="pgb-icons">${dots}</div>
          <div class="pgb-count">${cnt}</div>
          <div class="pgb-label">subjects</div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text-dim);text-align:center;padding:1rem;">Enter marks to see grade distribution</div>';

  // Journey stars — use back-aware SGPAs (same allSGPAs computed above)
  const journeyIcons = ['🌱','📖','🔥','💡','🚀','⚡','🎯','🏁'];
  document.getElementById('picto-stars').innerHTML = SEMESTERS.map((sem, i) => {
    const s = allSGPAs[i];
    const isDone = s > 0;
    const isActive = i === currentSem;
    const g = isDone ? (s >= 9 ? 'A+' : s >= 8 ? 'A' : s >= 7 ? 'B+' : s >= 6 ? 'B' : s >= 5 ? 'C' : 'F') : '–';
    return `
      <div class="journey-card ${isDone ? 'done' : ''} ${isActive ? 'active-sem' : ''}">
        <div class="jc-sem">SEM ${i + 1}</div>
        <div class="jc-icon">${journeyIcons[i]}</div>
        <div class="jc-sgpa">${isDone ? s.toFixed(2) : '–'}</div>
        <div class="jc-grade">${g}</div>
      </div>
    `;
  }).join('');
}

// ========================
// EXPORT
// ========================
function exportReport() {
  const user = JSON.parse(localStorage.getItem('aktu_user') || '{}');
  // Use back-aware values so the exported report reflects the LATEST result
  const { cgpa: cgpaBack, hasAnyBack: exportHasBack } = calcCGPAWithBack();
  const cgpaBase = calcCGPA();
  const cgpa = (exportHasBack && cgpaBack > cgpaBase) ? cgpaBack : cgpaBase;
  const allSGPAs = SEMESTERS.map((_, si) => {
    const base = calcSGPA(si);
    const { sgpa: withBack, hasAnyBack } = calcSGPAWithBack(si);
    return (hasAnyBack && withBack > base) ? withBack : base;
  });
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

  const gradeColors = {
    'A+': '#06b6d4', 'A': '#8b5cf6', 'B+': '#818cf8',
    'B': '#10b981', 'C': '#f59e0b', 'D': '#f97316', 'E#': '#fb923c', 'F': '#ef4444'
  };

  const cgpaColor = cgpa >= 9 ? '#06b6d4' : cgpa >= 8 ? '#8b5cf6' : cgpa >= 7 ? '#10b981' : cgpa >= 6 ? '#f59e0b' : '#ef4444';

  // Build semester rows
  // Check if this semester has any back paper data to show
  const semesterSections = SEMESTERS.map((sem, si) => {
    const sgpa = allSGPAs[si];
    if (sgpa === 0) return ''; // skip empty semesters

    // Detect if this semester has any active back paper entries
    const semHasBack = sem.subjects.some((subj, ji) => {
      if (subj.audit || (subj.type !== 'Theory' && subj.type !== 'Elective')) return false;
      const backExt = backData[si] && backData[si][ji];
      if (!backExt || backExt === '') return false;
      const origGrade = getGrade(marksData[si][ji], subj);
      return origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
    });

    const rows = sem.subjects.map((subj, ji) => {
      const entry = marksData[si][ji];
      const total = getTotal(entry);
      const origGrade = getGrade(entry, subj);
      const effTotal = getEffectiveTotal(entry, subj);
      const intVal = (typeof entry === 'object' && entry.internal !== '') ? entry.internal : null;
      const extVal = (typeof entry === 'object' && entry.external !== '') ? entry.external : null;

      // ── Back paper logic ──
      const backExt = backData[si] && backData[si][ji];
      const backNum = parseFloat(backExt);
      const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
      const hasValidBack = !isNaN(backNum) && backExt !== '' && origIsFailOrGrace &&
                           (subj.type === 'Theory' || subj.type === 'Elective');

      // Effective grade to show (back paper result if valid)
      let effectiveGrade = origGrade;
      let backTotal = null;
      if (hasValidBack) {
        const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
        const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) };
        effectiveGrade = getGradeNoGrace(backEntry);
        backTotal = isNaN(internal) ? backNum : (internal + backNum);
      }

      const gradeLabel = subj.audit
        ? (total !== null ? total : '–')
        : (effectiveGrade ? effectiveGrade.grade : '–');

      // Show grace-adjusted total for E# subjects
      const marksVal = (origGrade && origGrade.grade === 'E#' && effTotal !== null && !hasValidBack)
        ? `${effTotal}*`
        : (hasValidBack ? (backTotal !== null ? backTotal : total !== null ? total : '–') : (total !== null ? total : '–'));

      const gradeColor = effectiveGrade ? (gradeColors[effectiveGrade.grade] || '#374151') : '#6b7280';

      // Row background: if originally failed and back paper clears it → green tint; still fail → red tint
      let rowBg = '#ffffff';
      if (hasValidBack) {
        rowBg = effectiveGrade && effectiveGrade.grade !== 'F'
          ? 'rgba(16,185,129,0.06)'   // cleared via back paper → green tint
          : 'rgba(220,38,38,0.07)';   // still failing → red tint
      } else if (origGrade && origGrade.grade === 'F') {
        rowBg = 'rgba(220,38,38,0.07)';
      } else if (origGrade && origGrade.grade === 'E#') {
        rowBg = 'rgba(234,88,12,0.06)';
      }

      // Back paper cell
      const backCell = semHasBack
        ? (hasValidBack
            ? `<td style="padding:8px 10px; text-align:center; font-family:'Courier New',monospace; font-size:14px; color:#059669; font-weight:800; background:rgba(16,185,129,0.06);">
                ${backNum}
                <div style="font-size:9px; color:#059669; letter-spacing:1px; font-weight:700; margin-top:1px;">BACK</div>
               </td>`
            : `<td style="padding:8px 10px; text-align:center; color:#d1d5db; font-size:13px;">–</td>`)
        : '';

      return `
        <tr style="border-bottom:1px solid #e5e7eb; background:${rowBg};">
          <td style="padding:8px 10px; font-family:'Courier New',monospace; font-size:14px; font-weight:800; color:#0284c7;">${subj.code}</td>
          <td style="padding:8px 10px; font-size:14px; color:#111827; font-weight:700;">${subj.name}</td>
          <td style="padding:8px 10px; text-align:center; font-size:13px; color:#374151; font-weight:600;">${subj.type}</td>
          <td style="padding:8px 10px; text-align:center; font-size:14px; color:#111827; font-weight:800;">${subj.credits === 0 ? 'Audit' : subj.credits}</td>
          <td style="padding:8px 10px; text-align:center; font-family:'Courier New',monospace; font-size:14px; color:#1f2937; font-weight:700;">${intVal !== null ? intVal : '–'}</td>
          <td style="padding:8px 10px; text-align:center; font-family:'Courier New',monospace; font-size:14px; color:#1f2937; font-weight:700;">${extVal !== null ? extVal : '–'}</td>
          ${backCell}
          <td style="padding:8px 10px; text-align:center; font-family:'Courier New',monospace; font-size:15px; font-weight:900; color:#111827;">${marksVal}</td>
          <td style="padding:8px 10px; text-align:center;">
            <span style="background:${gradeColor}18; color:${gradeColor}; border:2px solid ${gradeColor}66; border-radius:6px; padding:4px 12px; font-size:14px; font-weight:900; font-family:'Courier New',monospace;">${gradeLabel}</span>
          </td>
        </tr>`;
    }).join('');

    const sgpaColor = sgpa >= 9 ? '#0284c7' : sgpa >= 8 ? '#7c3aed' : sgpa >= 7 ? '#059669' : sgpa >= 6 ? '#d97706' : '#dc2626';

    // Back paper column header (only if this semester has back paper data)
    const backColHeader = semHasBack
      ? `<th style="padding:10px 10px; text-align:center; font-size:12px; color:#059669; letter-spacing:2px; font-weight:800; text-transform:uppercase; background:rgba(16,185,129,0.06);">Back Ext</th>`
      : '';

    return `
      <div style="margin-bottom:28px; break-inside:avoid;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid rgba(6,182,212,0.4);">
          <div>
            <div style="font-family:'Courier New',monospace; font-size:16px; font-weight:800; color:#0284c7; letter-spacing:2px; text-transform:uppercase;">${sem.label}</div>
            <div style="font-size:13px; color:#374151; margin-top:2px; font-weight:600;">Total Credits: ${sem.totalCredits}${semHasBack ? ' &nbsp;|&nbsp; <span style="color:#059669;">📋 Back Paper Result Included</span>' : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#4b5563; letter-spacing:2px; text-transform:uppercase; font-weight:700;">SGPA</div>
            <div style="font-family:'Courier New',monospace; font-size:26px; font-weight:900; color:${sgpaColor};">${sgpa.toFixed(2)}</div>
          </div>
        </div>
        <table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="background:#f0f9ff; border-bottom:2px solid rgba(6,182,212,0.3);">
              <th style="padding:10px 10px; text-align:left; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Code</th>
              <th style="padding:10px 10px; text-align:left; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Subject</th>
              <th style="padding:10px 10px; text-align:center; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Type</th>
              <th style="padding:10px 10px; text-align:center; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Cr.</th>
              <th style="padding:10px 10px; text-align:center; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Int</th>
              <th style="padding:10px 10px; text-align:center; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Ext</th>
              ${backColHeader}
              <th style="padding:10px 10px; text-align:center; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Total</th>
              <th style="padding:10px 10px; text-align:center; font-size:12px; color:#0284c7; letter-spacing:2px; font-weight:800; text-transform:uppercase;">Grade</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  // SGPA bar chart (text-based visual)
  const sgpaBars = allSGPAs.map((s, i) => {
    if (s === 0) return '';
    const barColor = s >= 9 ? '#0284c7' : s >= 8 ? '#7c3aed' : s >= 7 ? '#059669' : s >= 6 ? '#d97706' : '#dc2626';
    const barWidth = Math.round((s / 10) * 100);
    return `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div style="width:55px; font-size:13px; color:#1f2937; font-family:'Courier New',monospace; flex-shrink:0; font-weight:700;">Sem ${i+1}</div>
        <div style="flex:1; background:#e5e7eb; border-radius:4px; height:12px; overflow:hidden;">
          <div style="width:${barWidth}%; height:100%; background:linear-gradient(90deg,${barColor},${barColor}99); border-radius:4px;"></div>
        </div>
        <div style="width:45px; font-family:'Courier New',monospace; font-size:14px; font-weight:900; color:${barColor}; text-align:right;">${s.toFixed(2)}</div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AKTU CGPA Report – ${user.name || 'Student'}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: #ffffff;
    color: #111827;
    font-family: 'Segoe UI', Arial, sans-serif;
    padding: 40px;
    min-height: 100vh;
  }
  @media print {
    body { padding: 20px; background: #ffffff !important; color: #111827 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; visibility: hidden !important; }
    button { display: none !important; }
  }
</style>
</head>
<body>

<!-- PRINT BUTTON -->
<div class="no-print" style="position:fixed; top:20px; right:20px; z-index:999; display:flex; gap:10px;">
  <button onclick="window.print()" style="background:linear-gradient(135deg,#06b6d4,#8b5cf6); border:none; border-radius:10px; padding:12px 24px; color:white; font-size:14px; font-weight:700; cursor:pointer; letter-spacing:2px;">🖨️ PRINT / SAVE PDF</button>
  <button onclick="window.close()" style="background:rgba(100,116,139,0.2); border:1px solid rgba(100,116,139,0.3); border-radius:10px; padding:12px 18px; color:#94a3b8; font-size:14px; cursor:pointer;">✕ Close</button>
</div>

<div style="max-width:900px; margin:0 auto;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,rgba(6,182,212,0.08),rgba(139,92,246,0.08)); border:2px solid rgba(6,182,212,0.4); border-radius:20px; padding:32px 36px; margin-bottom:28px; position:relative; overflow:hidden;">
    <div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,transparent,#06b6d4,#8b5cf6,transparent);"></div>

    <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:20px;">
      <div>
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
          <div style="width:48px; height:48px; background:linear-gradient(135deg,rgba(6,182,212,0.3),rgba(139,92,246,0.3)); border:2px solid #06b6d4; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:14px; color:#06b6d4; font-family:'Courier New',monospace;">AK</div>
          <div>
            <div style="font-family:'Courier New',monospace; font-size:18px; font-weight:900; color:#06b6d4; letter-spacing:3px; text-shadow:0 0 20px rgba(6,182,212,0.4);">AKTU CSE CGPA REPORT</div>
            <div style="font-size:12px; color:#64748b; letter-spacing:1px; margin-top:2px;">Dr. A.P.J. Abdul Kalam Technical University</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px;">
          <div><span style="font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Student</span><br><span style="font-size:16px; font-weight:800; color:#111827;">${user.name || '–'}</span></div>
          <div><span style="font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Roll Number</span><br><span style="font-size:16px; font-weight:800; color:#111827; font-family:'Courier New',monospace;">${user.roll || '–'}</span></div>
          <div><span style="font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; font-weight:700;">College</span><br><span style="font-size:14px; color:#1f2937; font-weight:600;">${user.college || '–'}</span></div>
          <div><span style="font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; font-weight:700;">University</span><br><span style="font-size:14px; color:#1f2937; font-weight:600;">${user.university || 'AKTU'}</span></div>
          <div><span style="font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Email</span><br><span style="font-size:13px; color:#1f2937; font-weight:600;">${user.email || '–'}</span></div>
          <div><span style="font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Generated On</span><br><span style="font-size:13px; color:#1f2937; font-weight:600;">${dateStr}</span></div>
        </div>
      </div>

      <!-- BIG CGPA -->
      <div style="text-align:center; background:rgba(6,182,212,0.08); border:2px solid rgba(6,182,212,0.35); border-radius:16px; padding:24px 32px; flex-shrink:0;">
        <div style="font-size:11px; color:#4b5563; letter-spacing:3px; text-transform:uppercase; margin-bottom:8px; font-weight:700;">Overall CGPA</div>
        <div style="font-family:'Courier New',monospace; font-size:52px; font-weight:900; color:${cgpaColor}; line-height:1;">${cgpa.toFixed(2)}</div>
        <div style="font-size:12px; color:#4b5563; margin-top:6px; font-weight:600;">out of 10.00</div>
        <div style="margin-top:12px; padding:6px 16px; background:${cgpaColor}22; border:2px solid ${cgpaColor}55; border-radius:20px; display:inline-block;">
          <span style="font-size:13px; font-weight:800; color:${cgpaColor};">
            ${cgpa >= 9 ? '🏆 Outstanding' : cgpa >= 8 ? '⭐ Excellent' : cgpa >= 7 ? '✅ Good' : cgpa >= 6 ? '📚 Average' : '⚠️ Needs Work'}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- SGPA OVERVIEW -->
  <div style="background:#f8fafc; border:2px solid rgba(6,182,212,0.3); border-radius:16px; padding:24px 28px; margin-bottom:28px;">
    <div style="font-family:'Courier New',monospace; font-size:13px; color:#0284c7; letter-spacing:3px; text-transform:uppercase; margin-bottom:16px; font-weight:800;">📊 Semester-wise SGPA Performance</div>
    ${sgpaBars || '<div style="color:#6b7280;font-size:13px;">No data entered yet.</div>'}
  </div>

  <!-- GRADING LEGEND -->
  <div style="background:#f8fafc; border:2px solid rgba(6,182,212,0.3); border-radius:16px; padding:20px 28px; margin-bottom:28px;">
    <div style="font-family:'Courier New',monospace; font-size:13px; color:#0284c7; letter-spacing:3px; text-transform:uppercase; margin-bottom:14px; font-weight:800;">📋 Grading Scale</div>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${[
        {range:'90–100', g:'A+', c:'#0284c7', pts:10},
        {range:'80–89',  g:'A',  c:'#7c3aed', pts:9},
        {range:'70–79',  g:'B+', c:'#4f46e5', pts:8},
        {range:'60–69',  g:'B',  c:'#059669', pts:7},
        {range:'50–59',  g:'C',  c:'#d97706', pts:6},
        {range:'40–49',  g:'D',  c:'#ea580c', pts:5},
        {range:'Grace',  g:'E#', c:'#c2410c', pts:0, note:'full cr'},
        {range:'< 40',   g:'F',  c:'#dc2626', pts:0, note:'full cr'},
      ].map(r => `
        <div style="display:flex; align-items:center; gap:8px; background:${r.c}18; border:1.5px solid ${r.c}55; border-radius:8px; padding:7px 14px;">
          <span style="font-family:'Courier New',monospace; font-size:15px; font-weight:900; color:${r.c};">${r.g}</span>
          <span style="font-size:13px; color:#cbd5e1; font-weight:600;">${r.range}</span>
          <span style="font-size:12px; color:#94a3b8; font-weight:700;">${r.pts}pts${r.note ? ' · ' + r.note : ''}</span>
        </div>`).join('')}
    </div>
  </div>

  <!-- DETAILED SEMESTER SECTIONS -->
  <div style="font-family:'Courier New',monospace; font-size:13px; color:#0284c7; letter-spacing:3px; text-transform:uppercase; margin-bottom:16px; font-weight:800;">📚 Detailed Subject-wise Report</div>
  ${semesterSections || '<div style="color:#64748b;padding:2rem;text-align:center;">No marks entered yet.</div>'}

  <!-- FOOTER -->
  <div style="text-align:center; padding:20px; border-top:1px solid #e5e7eb; margin-top:10px;">
    <div style="font-family:'Courier New',monospace; font-size:10px; color:#6b7280; letter-spacing:2px;">GENERATED BY AKTU CSE CGPA CALCULATOR · ${dateStr}</div>
  </div>

</div>
<\/body>
<\/html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}


// ========================
// THEME TOGGLE
// ========================
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('aktu_theme', isLight ? 'light' : 'dark');
  updateToggleIcons(isLight);
}

function updateToggleIcons(isLight) {
  const emoji = isLight ? '☀️' : '🌙';
  ['toggle-thumb','toggle-thumb-2','toggle-thumb-login'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = emoji;
  });
}

function loadTheme() {
  const saved = localStorage.getItem('aktu_theme');
  const isLight = saved === 'light';
  if (isLight) document.body.classList.add('light-mode');
  updateToggleIcons(isLight);
}


// ════════════════════════════════════════
// RESOURCES PAGE
// ════════════════════════════════════════
function openResources() {
  ['appPage','analyserPage','dashboardPage','internshipsPage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  document.getElementById('resourcesPage').classList.add('active');
  window.scrollTo(0,0);
  const firstTab = document.querySelector('.res-sem-tab');
  if (firstTab) {
    const sem = firstTab.id.replace('res-tab-','');
    switchResSem(parseInt(sem));
  }
  const isLight = document.body.classList.contains('light-mode');
  const t = document.getElementById('toggle-thumb-res');
  if (t) t.textContent = isLight ? '☀️' : '🌙';
  gwTrackVisit('resources');
}

function closeResources(target) {
  document.getElementById('resourcesPage').classList.remove('active');
  if (target === 'internships') { openInternships(); return; }
  document.getElementById('dashboardPage').classList.add('active');
  refreshDashboard();
  window.scrollTo(0,0);
}

function switchResSem(sem) {
  sem = (sem === 'elective') ? 'elective' : parseInt(sem);
  // hide all panels
  document.querySelectorAll('.res-sem-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.res-sem-tab').forEach(t => t.classList.remove('active'));
  // show selected
  const panel = document.getElementById('res-panel-' + sem);
  const tab   = document.getElementById('res-tab-' + sem);
  if (panel) panel.style.display = 'block';
  if (tab)   tab.classList.add('active');
}

function toggleResSubj(id) {
  const body  = document.getElementById(id + '-body');
  const arrow = document.getElementById(id + '-arrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

function toggleResUnit(id) {
  const body  = document.getElementById(id + '-body');
  const arrow = document.getElementById(id + '-arrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

// ========================
// AUTO LOGIN
// ========================
window.addEventListener('load', () => {
  loadTheme();
  const saved = localStorage.getItem('aktu_user');
  if (saved) {
    try {
      const u = JSON.parse(saved); applyGroupToSemesters(u.group || ''); initApp(u);
    } catch(e) {}
  }
});

// ════════════════════════════════════════
// SCAN RESULT SHEET — PDF.js Parser
// ════════════════════════════════════════
// ════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// SCAN RESULT SHEET  —  No-API, PDF.js Column-Aware Parser
// Uses positional text extraction to correctly read AKTU result
// tables without any external API or key required.
// ════════════════════════════════════════════════════════════

let scanFile      = null;
let scanExtracted = null;

// ── Modal open / close ──────────────────────────────────────
function openScanModal() {
  clearScanFile();
  document.getElementById('scanStatus').className = 'scan-status';
  document.getElementById('scanStatus').textContent = '';
  document.getElementById('scanResultsArea').innerHTML = '';
  document.getElementById('scanModal').classList.add('open');
}

function closeScanModal() {
  document.getElementById('scanModal').classList.remove('open');
  scanFile      = null;
  scanExtracted = null;
}

// ── File selection / drag-drop ──────────────────────────────
function onScanFileSelected(input) {
  const f = input.files[0];
  if (!f) return;
  scanFile = f;
  document.getElementById('scanPreviewName').textContent = f.name;
  document.getElementById('scanPreviewWrap').classList.add('show');
  document.getElementById('scanStatus').className = 'scan-status';
  document.getElementById('scanStatus').textContent = '';
  document.getElementById('scanResultsArea').innerHTML = '';
  scanExtracted = null;
}

function clearScanFile() {
  scanFile      = null;
  scanExtracted = null;
  const fi = document.getElementById('scanFileInput');
  if (fi) fi.value = '';
  const pw = document.getElementById('scanPreviewWrap');
  if (pw) pw.classList.remove('show');
  const ss = document.getElementById('scanStatus');
  if (ss) { ss.className = 'scan-status'; ss.textContent = ''; }
  const ra = document.getElementById('scanResultsArea');
  if (ra) ra.innerHTML = '';
}

// Drag-drop
(function setupDragDrop() {
  const dz = document.getElementById('scanDropZone');
  if (!dz) return;
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', ()=> dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) onScanFileSelected({ files: [f] });
  });
})();

// ── PDF.js loader ────────────────────────────────────────────
let pdfJsReady = false;
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (pdfJsReady) { resolve(); return; }
    if (window.pdfjsLib) { pdfJsReady = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfJsReady = true; resolve();
    };
    s.onerror = () => reject(new Error('Failed to load PDF.js library.'));
    document.head.appendChild(s);
  });
}

// ── Positional text extraction ───────────────────────────────
// Instead of joining all tokens into one flat string (which loses
// column info), we keep each token with its X position on the page.
// This lets us correctly identify which column a number is in.
async function extractPositionalText(file) {
  await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const vp      = page.getViewport({ scale: 1 });
    const items   = content.items.map(it => ({
      text: it.str.trim(),
      x:    Math.round(it.transform[4]),          // left edge in pts
      y:    Math.round(vp.height - it.transform[5]), // top-down Y
      w:    Math.round(it.width)
    })).filter(it => it.text.length > 0);

    // Group tokens into logical lines by Y proximity (±4 pts = same line)
    const lines = [];
    items.forEach(tok => {
      let found = false;
      for (const ln of lines) {
        if (Math.abs(ln.y - tok.y) <= 2) {
          ln.tokens.push(tok);
          ln.y = (ln.y + tok.y) / 2; // average Y
          found = true; break;
        }
      }
      if (!found) lines.push({ y: tok.y, tokens: [tok] });
    });

    // Sort lines top-to-bottom, tokens left-to-right within each line
    lines.sort((a, b) => a.y - b.y);
    lines.forEach(ln => ln.tokens.sort((a, b) => a.x - b.x));

    pages.push({ pageNum: p, lines, pageWidth: Math.round(vp.width) });
  }
  return pages;
}

// ── Build subject code lookup ─────────────────────────────────
function buildCodeIndex() {
  const idx = new Map();

  // Helper: register a normalised code string into the index
  function reg(codeStr, si, ji, subj) {
    const key = codeStr.toUpperCase().replace(/-/g, '').trim();
    if (key && !idx.has(key)) idx.set(key, { si, ji, subj });
  }

  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      // ── Register the subject's own code (all slash-variants) ──
      const raw   = subj.code.toUpperCase().replace(/-/g, '');
      const parts = raw.split('/');
      const base  = parts[0].trim();
      reg(base, si, ji, subj);
      if (parts[1]) {
        const sec = parts[1].trim();
        if (/^\d+$/.test(sec)) {
          // numeric-only suffix → inherit letter prefix from base
          reg(base.replace(/\d+$/, '') + sec, si, ji, subj);
        } else {
          reg(sec, si, ji, subj);
        }
      }

      // ── For elective slots: also register every option code ──
      // This lets the scanner match BCDS501, BCS054, BOE068, BCS072,
      // BAI701, BOE074, BCDS601, BCDS062 etc. directly to their slot.
      if (subj.options) {
        subj.options.forEach(opt => {
          // Option format: "BCS054 - OO System Design with C++"
          const optCode = opt.split(/[\s\-–]/)[0].trim();
          if (optCode) reg(optCode, si, ji, subj);
        });
      }
    });
  });
  return idx;
}

// ── AKTU result row parser ────────────────────────────────────
// AKTU One View PDFs have this exact column layout (NO "Total" column):
//
//   Code | Subject Name | Type | Internal | External | Back Paper | Grade
//
// Column X-positions (in PDF points at scale=1) are consistent:
//   Internal  ≈ 345–370
//   External  ≈ 390–415
//   Back Paper≈ 435–480
//   Grade     ≈ 495–520
//
// The parser detects these column boundaries dynamically from the header row
// "Internal" / "External" on each page, then classifies every number token
// by X-zone instead of using arithmetic. This correctly handles:
//   - External = ABS (absent) → 0 marks in External column
//   - Back paper = 42* → student passed via supplementary; use as effective external
//   - External = 0 → genuine zero, not "no column"
//   - Multiple sessions on same PDF (regular + back results)

function parseMarksFromPages(pages) {
  const codeIdx = buildCodeIndex();

  // Map: key="si-ji" → keeps the HIGHEST total seen for that subject
  const bestResult = new Map();

  // Matches all AKTU code formats: BCS301, BCDS501, BAI701, BOE074, BCS054
  const CODE_RE = /^([A-Z]{2,5})-?(\d{3,4}[A-Z]?)$/;

  // ── Column X-boundary detection ───────────────────────────────
  // Looks for the header row that has both "Internal" and "External"
  // tokens to anchor the column layout for that page.
  // Returns { intX, extX, bpX } where each is the centre X of that column.
  function detectColumns(lines) {
    for (const line of lines) {
      const texts = line.tokens.map(t => t.text.toLowerCase());
      const intIdx = texts.indexOf('internal');
      const extIdx = texts.findIndex(t => t === 'external');
      if (intIdx === -1 || extIdx === -1) continue;

      const intX = line.tokens[intIdx].x;
      const extX = line.tokens[extIdx].x;
      // Back Paper column is roughly same offset further right
      const bpX  = extX + (extX - intX);

      return { intX, extX, bpX };
    }
    // Fallback: well-known typical positions from observed AKTU PDFs
    return { intX: 352, extX: 398, bpX: 446 };
  }

  // ── Classify a token's X into a column ───────────────────────
  // Returns 'internal', 'external', 'backpaper', or 'other'
  function classifyX(x, cols) {
    const HALF = (cols.extX - cols.intX) / 2;  // ~23 pts
    if (Math.abs(x - cols.intX) <= HALF) return 'internal';
    if (Math.abs(x - cols.extX) <= HALF) return 'external';
    if (Math.abs(x - cols.bpX)  <= HALF + 10) return 'backpaper';
    return 'other';
  }

  for (const page of pages) {
    // Detect column layout from this page's header row
    const cols = detectColumns(page.lines);

    for (const line of page.lines) {
      const tokens = line.tokens;
      if (tokens.length < 2) continue;

      // Find subject code token (usually leftmost)
      let codeHit    = null;
      let codeTokIdx = -1;

      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti].text.toUpperCase().replace(/-/g, '');
        const m = CODE_RE.exec(t);
        if (!m) continue;
        const full = m[1] + m[2];
        if (codeIdx.has(full)) {
          codeHit    = { ...codeIdx.get(full), rawCode: full };
          codeTokIdx = ti;
          break;
        }
      }

      if (!codeHit) continue;

      const { si, ji, subj, rawCode } = codeHit;

      // ── Extract marks by column X-position ────────────────────
      // Scan tokens to the right of the code token.
      // For each token: classify by X → assign to intMarks / extMarks / bpMarks.
      //
      // "ABS" in any column → 0 for that column (student was absent)
      // "42*" (back paper)  → numeric value, treated as effective external

      let intMarks = null;
      let extMarks = null;
      let bpMarks  = null;

      for (let ti = codeTokIdx + 1; ti < tokens.length; ti++) {
        const tok = tokens[ti];
        const raw = tok.text.trim();

        // Determine numeric value: strip trailing * (back-paper marker)
        let val = null;
        if (/^ABS$/i.test(raw)) {
          val = 0;
        } else {
          const stripped = raw.replace(/\*$/, '');
          if (/^\d+(\.\d+)?$/.test(stripped)) {
            val = Math.round(parseFloat(stripped));
            // BCS753 Project-I is out of 150; BCS851 external is out of 350
            const absMax = (subj && subj.code === 'BCS753') ? 150
                         : (subj && subj.code === 'BCS851') ? 450
                         : 100;
            if (val > absMax) continue; // skip impossible values
          }
        }

        if (val === null) continue; // non-numeric, non-ABS token

        const col = classifyX(tok.x, cols);

        if (col === 'internal' && intMarks === null) {
          intMarks = val;
        } else if (col === 'external' && extMarks === null) {
          extMarks = val;
        } else if (col === 'backpaper' && bpMarks === null) {
          bpMarks = val;
        }
      }

      // ── Compute marks ─────────────────────────────────────────
      // Back paper marks (42*) stay SEPARATE — they go into backData,
      // NOT into the main external field. The original external (0/ABS) is preserved.
      const effectiveExt = (bpMarks !== null && bpMarks > 0)
        ? bpMarks
        : extMarks;

      // For internalOnly subjects (Internship, Mini Project, Project):
      // only internal marks appear; no external exam.
      let total = null;
      let finalInt = intMarks;
      let finalExt = null;
      let finalBp  = bpMarks; // back paper goes to backData, not main external

      if (subj.internalOnly) {
        // Single internal mark = the total for this subject
        if (intMarks !== null) {
          total    = intMarks;
          finalInt = intMarks;
          finalExt = null;
          finalBp  = null;
        }
      } else if (subj.code === 'BCS851') {
        // BCS851 Project-II: internal/100 + external/350
        if (intMarks !== null || extMarks !== null) {
          finalInt = intMarks;
          finalExt = extMarks;
          total    = (intMarks !== null ? intMarks : 0) + (extMarks !== null ? extMarks : 0);
        }
      } else {
        // Theory / Practical
        if (intMarks !== null && effectiveExt !== null) {
          total    = intMarks + effectiveExt;
          finalInt = intMarks;
          // If back paper exists, store 0 as external (original was fail/absent)
          finalExt = (bpMarks !== null && bpMarks > 0) ? 0 : extMarks;
        } else if (intMarks !== null && effectiveExt === null) {
          // Only internal arrived (e.g. CA-only audit subject) — treat as total
          total    = intMarks;
          finalInt = intMarks;
          finalExt = null;
          finalBp  = null;
        } else if (intMarks === null && effectiveExt !== null) {
          // Only external arrived — skip (incomplete row, likely a header echo)
          continue;
        } else {
          // No marks found at all
          continue;
        }
      }

      // Allow higher totals for special subjects
      const maxTotal = (subj && subj.code === 'BCS753') ? 150
                     : (subj && subj.code === 'BCS851') ? 450
                     : 100;
      if (total === null || total < 0 || total > maxTotal) continue;

      // ── Keep highest result across multiple sessions ───────────
      const key = `${si}-${ji}`;
      const existing = bestResult.get(key);

      // Resolve elective option name
      let matchedOption = null;
      if (subj.options) {
        matchedOption = subj.options.find(opt =>
          opt.toUpperCase().replace(/-/g,'').startsWith(rawCode.toUpperCase().replace(/-/g,''))
        ) || null;
      }

      if (!existing || total > existing.marks) {
        bestResult.set(key, {
          si, ji, marks: total,
          internal: finalInt !== null ? finalInt : null,
          external: finalExt !== null ? finalExt : null,
          backPaper: finalBp !== null && finalBp !== undefined ? finalBp : null,
          subjectCode: rawCode,
          subjectName: matchedOption
            ? matchedOption.replace(/^[A-Z0-9]+\s*[-–]\s*/i, '')
            : subj.name,
          matchedOption
        });
      }
    }
  }

  // Return sorted by semester → subject index
  return [...bestResult.values()].sort((a, b) =>
    a.si !== b.si ? a.si - b.si : a.ji - b.ji
  );
}

// ── Main scan runner ─────────────────────────────────────────
async function runScan() {
  if (!scanFile) {
    showScanStatus('error', '⚠️ Please upload a result sheet first.');
    return;
  }
  if (scanFile.type !== 'application/pdf') {
    showScanStatus('error', '⚠️ Please upload the PDF from AKTU One View portal.');
    return;
  }

  const semIdx = parseInt(document.getElementById('scanSemSelect').value);
  const btn    = document.getElementById('scanGoBtn');
  btn.disabled = true;
  document.getElementById('scanResultsArea').innerHTML = '';

  try {
    showScanStatus('loading', '📄 Reading PDF layout…');
    const pages = await extractPositionalText(scanFile);

    showScanStatus('loading', '🔍 Scanning result table for marks…');
    let extracted = parseMarksFromPages(pages);

    // Apply semester filter if user selected a specific one
    if (semIdx !== -1) {
      extracted = extracted.filter(r => r.si === semIdx);
    }

    if (extracted.length === 0) {
      throw new Error(
        'No subject marks found in this PDF. Make sure you uploaded the ' +
        'result sheet (not fee receipt/admit card) from AKTU One View (erp.aktu.ac.in). ' +
        (semIdx !== -1 ? 'Also try switching semester filter to "All Semesters".' : '')
      );
    }

    scanExtracted = extracted;

    const semsFound = [...new Set(extracted.map(r => r.si + 1))];
    const semLabel  = semsFound.length > 1
      ? 'Semesters ' + semsFound.join(', ')
      : 'Semester '  + semsFound[0];

    showScanStatus('success',
      `✅ Found ${extracted.length} subject(s) across ${semLabel}! Review below and click "Fill All Marks".`
    );
    renderScanResults(extracted);

  } catch(err) {
    showScanStatus('error', '❌ ' + (err.message || 'Something went wrong. Please try again.'));
  } finally {
    btn.disabled = false;
  }
}

function renderScanResults(items) {
  const area = document.getElementById('scanResultsArea');
  const rows = items.map(item => {
    const sem      = SEMESTERS[item.si !== undefined ? item.si : item.semIdx];
    const semLabel = sem ? sem.label.replace('Semester ', 'Sem ') : '?';
    const name     = item.subjectName || '?';
    const m        = item.marks;
    const sem2     = SEMESTERS[item.si !== undefined ? item.si : item.semIdx];
    const subj2    = sem2 && sem2.subjects[item.ji !== undefined ? item.ji : item.subjIdx];
    const mMax     = subj2 && subj2.code === 'BCS753' ? 150
                   : subj2 && subj2.code === 'BCS851' ? 450 : 100;
    const mPct     = (m / mMax) * 100;
    const mColor   = mPct >= 60 ? '#10b981' : mPct >= 40 ? '#f59e0b' : '#ef4444';
    const mBg      = mPct >= 60 ? 'rgba(16,185,129,0.12)' : mPct >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
    const intDisp  = item.internal !== null && item.internal !== undefined ? item.internal : '–';
    const extDisp  = item.external !== null && item.external !== undefined ? item.external : '–';
    return `<tr>
      <td style="color:var(--text-dim);font-size:0.78rem;">${semLabel}</td>
      <td style="color:var(--cyan);font-family:var(--font-mono);font-size:0.73rem;white-space:nowrap;">${item.subjectCode}</td>
      <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.82rem;" title="${name}">${name}</td>
      <td style="text-align:center;font-size:0.82rem;color:var(--text-muted);">${intDisp}</td>
      <td style="text-align:center;font-size:0.82rem;color:var(--text-muted);">${extDisp}</td>
      <td style="text-align:right;">
        <span style="font-weight:700;font-size:0.92rem;color:${mColor};background:${mBg};padding:2px 8px;border-radius:6px;">${m}</span>
      </td>
    </tr>`;
  }).join('');

  const fillBtn = `<button onclick="fillAllScannedMarks()"
    style="width:100%;padding:0.8rem;border:none;border-radius:10px;
           background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;
           font-size:0.95rem;font-weight:700;cursor:pointer;font-family:var(--font-body);
           box-shadow:0 4px 15px rgba(16,185,129,0.3);">
    ✅ Fill All Marks into Calculator
  </button>`;
  area.innerHTML = `
    <div style="margin-top:1rem;">
      ${fillBtn}
      <div class="scan-results-table-wrap" style="margin-top:0.8rem;">
        <table class="scan-result-table" style="width:100%;border-collapse:collapse;">
          <thead style="position:sticky;top:0;background:var(--bg-card);z-index:1;">
            <tr style="border-bottom:1px solid rgba(6,182,212,0.2);">
              <th style="text-align:left;padding:8px 10px;font-size:0.75rem;color:var(--text-dim);">Sem</th>
              <th style="text-align:left;padding:8px 10px;font-size:0.75rem;color:var(--text-dim);">Code</th>
              <th style="text-align:left;padding:8px 10px;font-size:0.75rem;color:var(--text-dim);">Subject</th>
              <th style="text-align:center;padding:8px 10px;font-size:0.75rem;color:var(--text-dim);">Int</th>
              <th style="text-align:center;padding:8px 10px;font-size:0.75rem;color:var(--text-dim);">Ext</th>
              <th style="text-align:right;padding:8px 10px;font-size:0.75rem;color:var(--text-dim);">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Fill marks into main calculator ─────────────────────────
function fillAllScannedMarks() {
  if (!scanExtracted || scanExtracted.length === 0) return;

  // 0. Determine which semesters are being filled BEFORE writing marks,
  //    so we can clear stale backData for those semesters.
  //    When fresh marks are scanned in, any previously stored back paper
  //    data for those semesters is no longer valid (could belong to a
  //    different student or a prior attempt).
  const affectedSemsSet = new Set(scanExtracted.map(r =>
    r.si !== undefined ? r.si : r.semIdx
  ));
  affectedSemsSet.forEach(si => {
    if (!backData[si]) backData[si] = {};
    SEMESTERS[si].subjects.forEach((_, ji) => {
      backData[si][ji] = '';
    });
  });

  // 1. Write ALL extracted marks into marksData in one pass
  scanExtracted.forEach(item => {
    const si = item.si !== undefined ? item.si : item.semIdx;
    const ji = item.ji !== undefined ? item.ji : item.subjIdx;
    const subj = SEMESTERS[si] && SEMESTERS[si].subjects[ji];

    // If this was an elective slot matched via option code, auto-set the choice
    if (item.matchedOption && subj && subj.options) {
      if (!electiveChoices[si]) electiveChoices[si] = {};
      electiveChoices[si][ji] = item.matchedOption;
    }

    // internalOnly subjects (Internship, Mini Project, Project)
    if (subj && subj.internalOnly) {
      if (subj.code === 'BCS851') {
        // BCS851: internal/100 + external/350 — store both fields
        const intVal = item.internal !== null && item.internal !== undefined ? String(item.internal) : '';
        const extVal = item.external !== null && item.external !== undefined ? String(item.external) : '';
        marksData[si][ji] = { internal: intVal, external: extVal };
      } else {
        // All others (BCS753, BCS752, BCS754, BCC351, BCS554):
        // single internal mark — store in 'internal' field
        const val = item.internal !== null && item.internal !== undefined
          ? String(item.internal)
          : String(item.marks);
        marksData[si][ji] = { internal: val, external: '' };
      }
      return;
    }

    // Store as { internal, external } — PDF parser gives us both
    if (item.internal !== null && item.internal !== undefined
        && item.external !== null && item.external !== undefined) {
      marksData[si][ji] = { internal: String(item.internal), external: String(item.external) };
    } else {
      // Fallback: total only → put in external field
      marksData[si][ji] = { internal: '', external: String(item.marks) };
    }

    // If the PDF had a back paper mark (42*), auto-fill the back paper input field
    if (item.backPaper !== null && item.backPaper !== undefined) {
      if (!backData[si]) backData[si] = {};
      backData[si][ji] = String(item.backPaper);
    }
  });

  // 2. Persist to localStorage immediately
  saveData();

  // 3. Close the scan modal
  closeScanModal();

  // 4. Make sure we are on the GPA calculator page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('appPage').classList.add('active');

  // 5. Collect all affected semesters
  const affectedSems = [...new Set(scanExtracted.map(r =>
    r.si !== undefined ? r.si : r.semIdx
  ))].sort();

  // 6. Switch to first affected semester — this triggers renderSemester()
  //    which rebuilds all subject cards fresh from marksData, so every
  //    input box gets value= filled in correctly
  switchSem(affectedSems[0]);

  // 7. For every OTHER affected semester, patch any input elements that
  //    are already mounted in the DOM (safety net for future changes)
  affectedSems.slice(1).forEach(si => {
    SEMESTERS[si].subjects.forEach((subj, ji) => {
      const entry = marksData[si][ji] || { internal: '', external: '' };
      const inpI  = document.getElementById('inp-' + si + '-' + ji + '-i');
      const inpE  = document.getElementById('inp-' + si + '-' + ji + '-e');
      const pill  = document.getElementById('grade-' + si + '-' + ji);
      const totalD= document.getElementById('total-' + si + '-' + ji);
      const card  = document.getElementById('card-' + si + '-' + ji);
      if (inpI) inpI.value = (typeof entry === 'object' ? entry.internal : '') || '';
      if (inpE) inpE.value = (typeof entry === 'object' ? entry.external : entry) || '';
      const total = getTotal(entry);
      const g = getGrade(entry, subj);
      const effTotal = getEffectiveTotal(entry, subj);
      if (pill) {
        pill.textContent = g ? g.grade : '–';
        pill.className = 'grade-pill ' + (g ? g.cls : '');
      }
      if (totalD) {
        const dispVal = effTotal !== null ? effTotal : total;
        if (dispVal !== null) {
          const graceTag = (g && g.grade === 'E#')
            ? ' <span style="font-size:0.65rem;color:#fb923c;font-weight:700;vertical-align:middle;">★grace</span>'
            : '';
          totalD.innerHTML = `${dispVal}/100${graceTag}`;
          totalD.className = 'marks-total-disp';
        } else {
          totalD.textContent = '–/100';
          totalD.className = 'marks-total-disp marks-total-empty';
        }
      }
      if (card) card.classList.toggle('filled', isFilled(entry));
    });
  });

  // 8. updatePanels() was already called inside switchSem (CGPA/SGPA update)
  const cgpa    = calcCGPA();
  const semsLbl = affectedSems.map(si => 'Sem ' + (si + 1)).join(', ');
  const cgpaStr = cgpa > 0 ? '  ·  CGPA: ' + cgpa.toFixed(2) : '';
  showScanToast('\u2705 ' + scanExtracted.length + ' marks filled (' + semsLbl + ')' + cgpaStr);
}

// ── Status / toast helpers ───────────────────────────────────
function showScanStatus(type, msg) {
  const el = document.getElementById('scanStatus');
  el.className = 'scan-status ' + type;
  el.textContent = msg;
}

function showScanToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed; bottom:2rem; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,#10b981,#06b6d4);
    color:white; padding:0.8rem 1.6rem; border-radius:40px;
    font-family:var(--font-body); font-size:0.95rem; font-weight:700;
    z-index:99999; box-shadow:0 8px 30px rgba(16,185,129,0.3);
    animation:slideUp 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}

// Deferred modal backdrop listeners — elements may not exist yet at script parse time
window.addEventListener('load', function() {
  var scanModal = document.getElementById('scanModal');
  if (scanModal) scanModal.addEventListener('click', function(e) {
    if (e.target === this) closeScanModal();
  });
  var plannerModal = document.getElementById('plannerModal');
  if (plannerModal) plannerModal.addEventListener('click', function(e) {
    if (e.target === this) closePlannerModal();
  });
  var configModal = document.getElementById('configModal');
  if (configModal) configModal.addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
});



// ════════════════════════════════════════════════════════════
// NAVIGATION — Unified page routing
// ════════════════════════════════════════════════════════════
const ALL_PAGES = ['loginPage','dashboardPage','appPage','resourcesPage','analyserPage','internshipsPage'];

function hideAllPages(except) {
  ALL_PAGES.forEach(id => {
    if (id === except) return;
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
}

function showDashboard() {
  hideAllPages('dashboardPage');
  document.getElementById('dashboardPage').classList.add('active');
  window.scrollTo(0,0);
  refreshDashboard();
  document.querySelectorAll('.app-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const dashBtn = document.getElementById('dash-nav-dashboard');
  if (dashBtn) dashBtn.classList.add('active');
  const isLight = document.body.classList.contains('light-mode');
  const t = document.getElementById('toggle-thumb-dash');
  if (t) t.textContent = isLight ? '☀️' : '🌙';
  gwTrackVisit('dashboard');
}

function openGrades() {
  hideAllPages('appPage');
  document.getElementById('appPage').classList.add('active');
  window.scrollTo(0,0);
  document.querySelectorAll('.app-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const gradesBtn = document.getElementById('grades-nav-btn');
  if (gradesBtn) gradesBtn.classList.add('active');
  gwTrackVisit('grades');
}

function refreshDashboard() {
  // Sync username
  const nm = document.getElementById('user-nm');
  const av = document.getElementById('user-av');
  if (nm) {
    document.getElementById('dash-user-nm').textContent = nm.textContent;
    document.getElementById('dash-greeting').textContent = 'WELCOME, ' + nm.textContent.toUpperCase();
  }
  if (av) document.getElementById('dash-user-av').textContent = av.textContent;

  // Compute CGPA/SGPA for dashboard — use back-paper-aware versions
  if (typeof calcCGPA === 'function') {
    const cgpa = calcCGPA();
    const { cgpa: cgpaBack, hasAnyBack } = typeof calcCGPAWithBack === 'function' ? calcCGPAWithBack() : { cgpa: 0, hasAnyBack: false };
    const displayCGPA = (hasAnyBack && cgpaBack > cgpa) ? cgpaBack : cgpa;
    document.getElementById('dash-cgpa').textContent = displayCGPA > 0 ? displayCGPA.toFixed(2) : '—';
    document.getElementById('dash-cgpa-hero').textContent = displayCGPA > 0 ? displayCGPA.toFixed(2) : '—';
  }
  if (typeof calcSGPA === 'function' && typeof currentSem !== 'undefined') {
    const sgpa = calcSGPA(currentSem);
    const { sgpa: sgpaBack, hasAnyBack: semHasBack } = typeof calcSGPAWithBack === 'function' ? calcSGPAWithBack(currentSem) : { sgpa: 0, hasAnyBack: false };
    const displaySGPA = (semHasBack && sgpaBack > sgpa) ? sgpaBack : sgpa;
    document.getElementById('dash-sgpa').textContent = displaySGPA > 0 ? displaySGPA.toFixed(2) : '—';
    if (typeof SEMESTERS !== 'undefined')
      document.getElementById('dash-sem-lbl').textContent = SEMESTERS[currentSem] ? SEMESTERS[currentSem].label : '';
  }

  // Count completed sems and credits
  if (typeof SEMESTERS !== 'undefined' && typeof marksData !== 'undefined') {
    let doneSems = 0, totalCr = 0;
    SEMESTERS.forEach((sem, si) => {
      if (typeof isSemComplete === 'function' && isSemComplete(si)) {
        doneSems++;
        sem.subjects.forEach(subj => { if (!subj.audit) totalCr += subj.credits; });
      }
    });
    document.getElementById('dash-sems-done').textContent = doneSems;
    document.getElementById('dash-credits').textContent = totalCr;

    // Build semester strip
    const strip = document.getElementById('dash-sem-strip');
    if (strip) {
      strip.innerHTML = SEMESTERS.map(function(sem, i) {
        var sgpa = typeof calcSGPA === 'function' ? calcSGPA(i) : 0;
        var done = typeof isSemComplete === 'function' && isSemComplete(i);
        var isActiveSem = i === (typeof currentSem !== 'undefined' ? currentSem : 0);
        var cls = 'dash-sem-chip' + (done ? ' done' : '') + (isActiveSem ? ' active-sem' : '');
        var val = sgpa > 0 ? sgpa.toFixed(2) : '\u2014';
        return '<div class="' + cls + '" onclick="openGrades();switchSem(' + i + ')">' +
          '<span class="dash-sem-chip-lbl">SEM ' + sem.sem + '</span>' +
          '<span class="dash-sem-chip-val">' + val + '</span>' +
          '</div>';
      }).join('');
    }
  }
}

// Update openInternships to also sync dashboard data
const _origOpenInternships = typeof openInternships === 'function' ? openInternships : null;
function openInternships() {
  hideAllPages('internshipsPage');
  document.getElementById('internshipsPage').classList.add('active');
  window.scrollTo(0,0);
  document.querySelectorAll('.app-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const internBtn = document.getElementById('intern-nav-main');
  if (internBtn) internBtn.classList.add('active');
  const nm = document.getElementById('user-nm');
  const av = document.getElementById('user-av');
  if (nm) document.getElementById('intern-user-nm').textContent = nm.textContent;
  if (av) document.getElementById('intern-user-av').textContent = av.textContent;
  if (typeof allInternships !== 'undefined' && allInternships.length === 0) {
    if (typeof fetchInternships === 'function') fetchInternships();
  } else if (typeof updateCounts === 'function') {
    updateCounts();
  }
  gwTrackVisit('internships');
}

// goToDashboard / goToResources for internships page compat
function goToDashboard() { showDashboard(); }
function goToResources() { openResources(); }

// ── Legacy internships init kept for compatibility
function _legacyInternshipsInit() {
  ['appPage','resourcesPage','analyserPage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  document.getElementById('internshipsPage').classList.add('active');
  window.scrollTo(0,0);
  // Sync username
  const nm = document.getElementById('user-nm');
  const av = document.getElementById('user-av');
  if (nm) document.getElementById('intern-user-nm').textContent = nm.textContent;
  if (av) document.getElementById('intern-user-av').textContent = av.textContent;
  // Init internships if not already done
  if (typeof allInternships !== 'undefined' && allInternships.length === 0) {
    fetchInternships();
  } else if (typeof updateCounts === 'function') {
    updateCounts();
  }
}
// goToDashboard moved to nav section above
// goToResources moved to nav section above


// ===== LOCAL BACKEND ENGINE =====
// Calls your local Python server at http://localhost:5050
// The server scrapes Internshala + Unstop + LinkedIn.
// Start the server first: python server.py

const BACKEND_URL = 'http://localhost:5050';

function getInitialsLogo(company) {
  const words = (company || 'Co').replace(/[^a-zA-Z\s]/g,'').trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : words[0].slice(0,2).toUpperCase();
  const colors = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];
  const color = colors[Math.abs((company.charCodeAt(0)||0) + (company.charCodeAt(1)||0)) % colors.length];
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${color}22;border:1.5px solid ${color}44;border-radius:8px;font-weight:700;font-size:0.85rem;color:${color};font-family:var(--font-display)">${initials}</div>`;
}

let allInternships = [];
let filteredInternships = [];
let savedIds = new Set();
let currentSource = 'all';
let showSavedOnly = false;
let _fetchInProgress = false;

// ===== FETCH FROM LOCAL BACKEND =====
async function fetchInternships(forceRefresh = false) {
  if (_fetchInProgress) return;
  _fetchInProgress = true;

  const btn = document.getElementById('refreshBtn');
  const icon = document.getElementById('refreshIcon');
  if (btn) btn.classList.add('spinning');
  if (icon) icon.textContent = '⟳';

  const grid = document.getElementById('internGrid');
  const empty = document.getElementById('emptyState');
  if (empty) empty.style.display = 'none';

  if (grid) grid.innerHTML = `
    <div class="loading-wrap" style="grid-column:1/-1">
      <div class="ai-spinner"></div>
      <div class="loading-label">SCRAPING LIVE PORTALS…</div>
      <div class="loading-steps">
        <div class="loading-step active" id="step1"><span class="step-icon">🔍</span> Connecting to local backend…</div>
        <div class="loading-step" id="step2"><span class="step-icon">🟠</span> Scraping Internshala listings…</div>
        <div class="loading-step" id="step3"><span class="step-icon">🔴</span> Scraping Unstop listings…</div>
        <div class="loading-step" id="step4"><span class="step-icon">💼</span> Scraping LinkedIn listings…</div>
        <div class="loading-step" id="step5"><span class="step-icon">✨</span> Processing & deduplicating…</div>
      </div>
    </div>`;

  // Animate loading steps every 2s (server takes time to scrape)
  let stepIdx = 2;
  const stepTimer = setInterval(() => {
    if (stepIdx > 6) { clearInterval(stepTimer); return; }
    const prev = document.getElementById('step' + (stepIdx - 1));
    if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
    const cur = document.getElementById('step' + stepIdx);
    if (cur) cur.classList.add('active');
    stepIdx++;
  }, 2200);

  try {
    const url = `${BACKEND_URL}/api/internships${forceRefresh ? '?refresh=true' : ''}`;
    // Reduced to 15s — server now responds immediately (background scrape)
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

    clearInterval(stepTimer);

    const json = await res.json();

    // ── 202: scrape started in background, no data yet — keep step animation going ──
    if (res.status === 202 && json.scraping) {
      const retryIn = (json.retry_in || 15) * 1000;
      let countdown = Math.round(retryIn / 1000);

      // Rebuild the step UI fresh so steps animate from the top
      if (grid) grid.innerHTML = `
        <div class="loading-wrap" style="grid-column:1/-1">
          <div class="ai-spinner"></div>
          <div class="loading-label">SCRAPING LIVE PORTALS…</div>
          <div class="loading-steps">
            <div class="loading-step done"  id="step1"><span class="step-icon">🔍</span> Connected to backend ✓</div>
            <div class="loading-step active" id="step2"><span class="step-icon">🟠</span> Scraping Internshala listings…</div>
            <div class="loading-step"        id="step3"><span class="step-icon">🔴</span> Scraping Unstop listings…</div>
            <div class="loading-step"        id="step4"><span class="step-icon">💼</span> Scraping LinkedIn listings…</div>
            <div class="loading-step"        id="step5"><span class="step-icon">✨</span> Processing & deduplicating…</div>
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted);margin:14px 0 4px">
            Auto-checking in <span id="cdTimer">${countdown}</span>s…
          </p>
          <button onclick="fetchInternships()" style="margin-top:6px;padding:7px 20px;background:var(--cyan);color:var(--bg-deep);border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem">↺ Check Now</button>
        </div>`;

      // Keep cycling through steps so it looks alive
      let liveStep = 2;
      const liveTimer = setInterval(() => {
        if (liveStep > 6) { liveStep = 2; } // loop back if scrape is still going
        const prev = document.getElementById('step' + (liveStep - 1 < 1 ? 6 : liveStep - 1));
        if (prev && !prev.classList.contains('done')) { prev.classList.remove('active'); }
        const cur = document.getElementById('step' + liveStep);
        if (cur) cur.classList.add('active');
        liveStep++;
      }, 2200);

      // Countdown
      const cdInterval = setInterval(() => {
        countdown--;
        const el = document.getElementById('cdTimer');
        if (el) el.textContent = countdown;
        if (countdown <= 0) { clearInterval(cdInterval); clearInterval(liveTimer); }
      }, 1000);

      _fetchInProgress = false;
      if (btn) btn.classList.remove('spinning');
      if (icon) icon.textContent = '⟳';
      setTimeout(() => { clearInterval(liveTimer); clearInterval(cdInterval); fetchInternships(); }, retryIn);
      return;
    }

    // Mark all steps done
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById('step' + i);
      if (el) { el.classList.remove('active'); el.classList.add('done'); }
    }

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    if (!json.success) throw new Error(json.error || 'Backend returned failure');

    // Attach initials logos (server doesn't generate HTML)
    const jobs = (json.data || []).map(job => ({
      ...job,
      logo: getInitialsLogo(job.company),
    }));

    allInternships = jobs;

    // If server said it's still refreshing in the background, quietly re-poll later
    if (json.refreshing && jobs.length > 0) {
      setTimeout(() => { _fetchInProgress = false; fetchInternships(); }, 30000);
    }

  } catch (err) {
    clearInterval(stepTimer);
    _fetchInProgress = false;
    if (btn) btn.classList.remove('spinning');
    if (icon) icon.textContent = '⟳';

    const isOffline = err.name === 'TypeError' || err.name === 'AbortError' || err.message.includes('fetch');
    if (grid) grid.innerHTML = `
      <div class="loading-wrap" style="grid-column:1/-1;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">${isOffline ? '🔌' : '⚠️'}</div>
        <div class="loading-label" style="color:var(--red)">${isOffline ? 'BACKEND NOT RUNNING' : 'FETCH FAILED'}</div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin:12px 0;line-height:1.6">
          ${isOffline
            ? 'Start your backend server first:<br><code style="background:rgba(6,182,212,0.1);padding:4px 10px;border-radius:4px;color:var(--cyan)">python server.py</code><br><br>Then click Retry.'
            : err.message}
        </p>
        <button onclick="fetchInternships()" style="padding:9px 24px;background:var(--cyan);color:var(--bg-deep);border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.9rem">↺ Retry</button>
      </div>`;
    return;
  }

  _fetchInProgress = false;
  if (btn) btn.classList.remove('spinning');
  if (icon) icon.textContent = '⟳';

  applyFilters();
  updateCounts();

  const total = allInternships.length;
  const newToday = allInternships.filter(i => i.isNew).length;
  const remote = allInternships.filter(i => i.type === 'remote').length;

  const now = new Date();
  const ls = document.getElementById('lastSync');
  const sc = document.getElementById('statScanned');
  const sf = document.getElementById('statFiltered');
  const sn = document.getElementById('statNew');
  const sm = document.getElementById('statAvgMatch');
  if (ls) ls.textContent = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  if (sc) sc.textContent = total;
  if (sf) sf.textContent = total;
  if (sn) sn.textContent = newToday;
  if (sm) sm.textContent = remote + ' remote';

  showToast(`✅ ${total} live internships loaded`, 'success');
}

// ===== FILTERS =====
function applyFilters() {
  const searchEl = document.getElementById('searchInput');
  const domainEl = document.getElementById('domainFilter');
  const typeEl = document.getElementById('typeFilter');
  const sortEl = document.getElementById('sortFilter');

  const search = searchEl ? searchEl.value.toLowerCase() : '';
  const domain = domainEl ? domainEl.value : '';
  const type = typeEl ? typeEl.value : '';
  const sort = sortEl ? sortEl.value : '';

  let result = [...allInternships];

  if (currentSource !== 'all') result = result.filter(i => i.source === currentSource);
  if (domain) result = result.filter(i => i.domain === domain);
  if (type) result = result.filter(i => i.type === type);
  if (search) result = result.filter(i =>
    i.title.toLowerCase().includes(search) ||
    i.company.toLowerCase().includes(search) ||
    i.skills.some(s => s.toLowerCase().includes(search))
  );
  if (showSavedOnly) result = result.filter(i => savedIds.has(i.id));

  if (sort === 'new') result.sort((a,b) => (a.posted === 'Today' ? -1 : b.posted === 'Today' ? 1 : 0));
  else if (sort === 'stipend') result.sort((a,b) => b.stipend - a.stipend);
  else if (sort === 'deadline') result.sort((a,b) => new Date(a.deadline) - new Date(b.deadline));

  filteredInternships = result;
  renderGrid();
}

function filterBySource(src) {
  currentSource = src;
  showSavedOnly = false;
  ['all','internshala','unstop','linkedin'].forEach(s => {
    document.getElementById('tab-'+s)?.classList.toggle('active', s === src);
  });
  ['internshala','unstop','linkedin'].forEach(s => {
    document.getElementById('nav-'+s)?.classList.toggle('active', s === src);
  });
  applyFilters();
}

function filterByType(t) {
  const el = document.getElementById('typeFilter');
  if (el) el.value = t;
  applyFilters();
}

function showSaved() {
  showSavedOnly = true;
  currentSource = 'all';
  applyFilters();
}

// ===== RENDER =====
function renderGrid() {
  const grid = document.getElementById('internGrid');
  const empty = document.getElementById('emptyState');

  if (filteredInternships.length === 0) {
    if (grid) grid.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = filteredInternships.map((intern, idx) => {
    const isSaved = savedIds.has(intern.id);
    const urgencyClass = intern.urgency === 'urgent' ? 'urgent' : intern.urgency === 'soon' ? 'soon' : '';
    const stipendStr = intern.stipend > 0 ? `₹${(intern.stipend/1000).toFixed(0)}K/mo` : 'Unpaid';
    const sourceName = intern.source.charAt(0).toUpperCase() + intern.source.slice(1);

    return `
    <div class="intern-card" data-source="${intern.source}" style="animation-delay:${idx*0.06}s">
      <div class="card-top">
        <div class="company-logo">${intern.logo}</div>
        <div class="card-top-info">
          <div class="intern-title" title="${intern.title}">${intern.title}</div>
          <div class="company-name">${intern.company}</div>
        </div>
        <span class="source-pill ${intern.source}">${sourceName}</span>
      </div>
      <div class="skills-row">
        ${intern.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
      </div>
      <div class="card-meta">
        <span class="meta-chip ${intern.stipend > 0 ? 'stipend' : ''}">
          <span class="icon">💰</span> ${stipendStr}
        </span>
        <span class="meta-chip">
          <span class="icon">📍</span> ${intern.location}
        </span>
        <span class="meta-chip">
          <span class="icon">🗓️</span> ${intern.duration}
        </span>
        ${intern.type === 'remote' ? '<span class="meta-chip new"><span class="icon">🏠</span> Remote</span>' : ''}
        ${intern.isNew ? '<span class="meta-chip new"><span class="icon">✨</span> New</span>' : ''}
      </div>
      <div class="intern-desc">${intern.description}</div>
      <div class="deadline-wrap">
        <span class="deadline ${urgencyClass}">
          ${intern.urgency === 'urgent' ? '🔴' : intern.urgency === 'soon' ? '🟡' : '⚪'} Deadline: ${intern.deadline} • Posted ${intern.posted}
        </span>
      </div>
      <div class="card-footer">
        <a class="btn-apply" href="${intern.apply_url !== '#' ? intern.apply_url : 'javascript:void(0)'}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:flex;align-items:center;justify-content:center;">APPLY NOW</a>
        <button class="btn-save ${isSaved ? 'saved' : ''}" id="save-${intern.id}" onclick="toggleSave('${intern.id}')" title="${isSaved ? 'Remove from saved' : 'Save internship'}">
          ${isSaved ? '⭐' : '☆'}
        </button>
      </div>
    </div>`;
  }).join('');

  updateCounts();
}

// ===== ACTIONS =====
function toggleSave(id) {
  if (savedIds.has(id)) {
    savedIds.delete(id);
    showToast('Removed from saved', '');
  } else {
    savedIds.add(id);
    showToast('⭐ Saved internship!', 'success');
  }
  const el = document.getElementById('savedCount');
  if (el) el.textContent = savedIds.size;
  renderGrid();
}

function applyNow(source, id) {
  const intern = allInternships.find(i => i.id === id);
  if (!intern) return;
  const url = intern.apply_url && intern.apply_url !== '#' ? intern.apply_url : null;
  if (!url) { showToast('No direct link available.', ''); return; }
  window.open(url, '_blank');
}

function updateCounts() {
  const total = allInternships.length;
  const remote = allInternships.filter(i => i.type === 'remote').length;
  const paid = allInternships.filter(i => i.stipend > 0).length;
  const newToday = allInternships.filter(i => i.isNew).length;

  const tc = document.getElementById('totalCount');
  const hc = document.getElementById('highMatchCount');
  const rc = document.getElementById('remoteCount');
  const pc = document.getElementById('paidCount');
  const sbc = document.getElementById('sidebarCount');
  const tca = document.getElementById('tab-count-all');
  const sf = document.getElementById('statFiltered');

  if (tc) tc.textContent = total;
  if (hc) hc.textContent = newToday;  // repurpose "high match" to show "new today"
  if (rc) rc.textContent = remote;
  if (pc) pc.textContent = paid;
  if (sbc) sbc.textContent = total;
  if (tca) tca.textContent = total;
  if (sf) sf.textContent = filteredInternships.length || total;

  const srcCounts = {internshala:0, unstop:0, linkedin:0};
  allInternships.forEach(i => { if (srcCounts[i.source] !== undefined) srcCounts[i.source]++; });
  ['internshala','unstop','linkedin'].forEach(s => {
    const el = document.getElementById('cnt-'+s);
    const tabEl = document.getElementById('tab-count-'+s);
    if (el) el.textContent = srcCounts[s];
    if (tabEl) tabEl.textContent = srcCounts[s];
  });
}

// ===== MODAL =====
function openModal() {
  document.getElementById('configModal').classList.add('open');
}
function closeModal() {
  document.getElementById('configModal').classList.remove('open');
}
function toggleCheck(src) {
  const wrap = document.getElementById('chk-'+src+'-wrap');
  const chk = document.getElementById('chk-'+src);
  if (chk.checked) wrap.classList.add('checked');
  else wrap.classList.remove('checked');
}
function saveConfig() {
  closeModal();
  showToast('✅ Config saved! Re-syncing…', 'success');
  setTimeout(fetchInternships, 800);
}

// ===== TOAST =====
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.style.display = 'flex';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.style.display='none', 3000);
}

// Close modal on overlay click
// (configModal backdrop listener moved to window load handler above)


// ===== MOBILE SIDEBAR =====
// ── App/Dashboard sidebar toggle (3-dot button) ──────────────
let _appSidebarOpen = true;
function toggleAppSidebar() {
  _appSidebarOpen = !_appSidebarOpen;
  const sidebar = document.querySelector('#appPage .app-sidebar');
  const layout  = document.querySelector('#appPage .main-layout');
  const btn     = document.getElementById('appSidebarToggle');
  if (sidebar) sidebar.classList.toggle('collapsed', !_appSidebarOpen);
  if (layout)  layout.classList.toggle('sidebar-collapsed', !_appSidebarOpen);
  if (btn)     btn.classList.toggle('open', _appSidebarOpen);
}
let _dashSidebarOpen = true;
function toggleDashSidebar() {
  _dashSidebarOpen = !_dashSidebarOpen;
  const sidebar = document.querySelector('#dashboardPage .app-sidebar');
  const layout  = document.querySelector('#dashboardPage .dash-layout');
  const btn     = document.getElementById('dashSidebarToggle');
  if (sidebar) sidebar.classList.toggle('collapsed', !_dashSidebarOpen);
  if (btn)     btn.classList.toggle('open', _dashSidebarOpen);
}

function toggleMobSidebar() {
  const sidebar = document.querySelector('#internshipsPage .sidebar');
  const backdrop = document.getElementById('mobSidebarBackdrop');
  const hamburger = document.getElementById('internHamburger');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('mob-open');
  if (isOpen) {
    sidebar.classList.remove('mob-open');
    if (backdrop) backdrop.style.display = 'none';
    if (hamburger) hamburger.classList.remove('open');
  } else {
    sidebar.classList.add('mob-open');
    if (backdrop) backdrop.style.display = 'block';
    if (hamburger) hamburger.classList.add('open');
  }
}
function closeMobSidebar() {
  const sidebar = document.querySelector('#internshipsPage .sidebar');
  const backdrop = document.getElementById('mobSidebarBackdrop');
  const hamburger = document.getElementById('internHamburger');
  if (sidebar) sidebar.classList.remove('mob-open');
  if (backdrop) backdrop.style.display = 'none';
  if (hamburger) hamburger.classList.remove('open');
}
// Close sidebar when any nav button is clicked on mobile
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('#internshipsPage .nav-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      if (window.innerWidth <= 900) closeMobSidebar();
    });
  });
});


// ── Target CGPA Planner ─────────────────────────────────────
function calcTargetSGPA(fromModal) {
  const inputId = fromModal ? 'target-cgpa-input-modal' : 'target-cgpa-input';
  const boxId   = fromModal ? 'target-result-box-modal'  : 'target-result-box';
  const valId   = fromModal ? 'trb-needed-val-modal'     : 'trb-needed-val';
  const msgId   = fromModal ? 'trb-msg-modal'            : 'trb-msg';
  const semsId  = fromModal ? 'trb-sems-info-modal'      : 'trb-sems-info';

  const box   = document.getElementById(boxId);
  const valEl = document.getElementById(valId);
  const msgEl = document.getElementById(msgId);
  const semsEl= document.getElementById(semsId);

  const raw = parseFloat(document.getElementById(inputId).value);
  if (isNaN(raw) || raw < 0 || raw > 10) { box.className = 'target-result-box'; return; }
  const targetCGPA = Math.min(10, Math.max(0, raw));

  // Gather completed semester data — use back paper marks where entered
  let completedCredits = 0, completedPoints = 0, completedSems = 0;
  SEMESTERS.forEach((sem, si) => {
    if (!isSemComplete(si)) return;
    completedSems++;
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit || subj.credits === 0) return;
      const entry = marksData[si][ji];
      const backExt = backData[si] && backData[si][ji];
      const backNum = parseFloat(backExt);
      let gradeToUse, creditsToUse;

      if (!isNaN(backNum) && backExt !== '' && (subj.type === 'Theory' || subj.type === 'Elective')) {
        const origGrade = getGrade(entry, subj);
        const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#');
        if (origIsFailOrGrace) {
          const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN;
          const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) };
          gradeToUse = getGradeNoGrace(backEntry);
          creditsToUse = getBackCredits(gradeToUse, subj);
        } else {
          gradeToUse = origGrade;
          creditsToUse = getEffectiveCredits(entry, subj);
        }
      } else if (subj.internalOnly) {
        gradeToUse = getGradeForInternalOnly(entry, subj);
        creditsToUse = getEffectiveCredits(entry, subj);
      } else {
        gradeToUse = getGrade(entry, subj);
        creditsToUse = getEffectiveCredits(entry, subj);
      }

      if (gradeToUse === null) return;
      completedCredits += creditsToUse;
      completedPoints  += getEffectivePoints(gradeToUse) * creditsToUse;
    });
  });

  const totalSems     = SEMESTERS.length;
  const remainingSems = totalSems - completedSems;
  const currentCGPA   = completedCredits > 0 ? completedPoints / completedCredits : 0;

  if (remainingSems <= 0) {
    box.className = 'target-result-box show ' + (currentCGPA >= targetCGPA ? 'achievable' : 'impossible');
    valEl.textContent = 'Done';
    const iconEl2 = document.getElementById(fromModal ? 'trb-icon-modal' : 'trb-icon');
    if (iconEl2) iconEl2.textContent = currentCGPA >= targetCGPA ? '🏆' : '❌';
    msgEl.textContent = currentCGPA >= targetCGPA
      ? '🎓 All semesters complete! Target achieved with CGPA ' + currentCGPA.toFixed(2) + '.'
      : '🎓 All semesters complete. Final CGPA is ' + currentCGPA.toFixed(2) + ' — target not reached.';
    semsEl.textContent = ''; return;
  }

  if (completedSems === 0) {
    box.className = 'target-result-box show ' + (targetCGPA <= 10 ? 'achievable' : 'impossible');
    valEl.textContent = targetCGPA.toFixed(2);
    const iconEl3 = document.getElementById(fromModal ? 'trb-icon-modal' : 'trb-icon');
    if (iconEl3) iconEl3.textContent = '🎯';
    msgEl.textContent = 'Maintain an SGPA of ' + targetCGPA.toFixed(2) + ' every semester to reach CGPA ' + targetCGPA.toFixed(2) + '.';
    semsEl.textContent = 'Across all 8 semesters'; return;
  }

  // Estimate remaining credits using average per completed sem
  const avgCreditsPerSem   = completedCredits / completedSems;
  const remainingCredits   = avgCreditsPerSem * remainingSems;
  const totalCreditsEst    = completedCredits + remainingCredits;
  const neededPoints       = targetCGPA * totalCreditsEst - completedPoints;
  const requiredSGPA       = neededPoints / remainingCredits;

  const iconEl = document.getElementById(fromModal ? 'trb-icon-modal' : 'trb-icon');
  valEl.textContent = requiredSGPA > 10 ? '> 10 ✗' : requiredSGPA < 0 ? '✓ Done' : requiredSGPA.toFixed(2);
  semsEl.textContent = 'Based on ' + completedSems + ' completed sem' + (completedSems > 1 ? 's' : '') + ' · ' + remainingSems + ' remaining';

  if (requiredSGPA > 10) {
    box.className = 'target-result-box show impossible';
    if (iconEl) iconEl.textContent = '❌';
    msgEl.textContent = 'Not achievable. Even a perfect 10 in all remaining ' + remainingSems + ' semester' + (remainingSems > 1 ? 's' : '') + ' won\'t reach ' + targetCGPA.toFixed(2) + '.';
  } else if (requiredSGPA < 0) {
    box.className = 'target-result-box show already';
    valEl.textContent = '✓ Already';
    if (iconEl) iconEl.textContent = '🏆';
    msgEl.textContent = 'Your current CGPA (' + currentCGPA.toFixed(2) + ') already exceeds your target of ' + targetCGPA.toFixed(2) + '. Keep it up!';
  } else if (requiredSGPA > 9.5) {
    box.className = 'target-result-box show tough';
    if (iconEl) iconEl.textContent = '🔥';
    msgEl.textContent = 'Very challenging! You\'ll need near-perfect scores every semester from here.';
  } else if (requiredSGPA > currentCGPA + 0.5) {
    box.className = 'target-result-box show tough';
    if (iconEl) iconEl.textContent = '⚡';
    msgEl.textContent = 'Needs significant improvement from your current average of ' + currentCGPA.toFixed(2) + '.';
  } else {
    box.className = 'target-result-box show achievable';
    if (iconEl) iconEl.textContent = '✅';
    msgEl.textContent = 'Totally within reach! Stay consistent and you\'ll hit CGPA ' + targetCGPA.toFixed(2) + '.';
  }
}

function openPlannerModal() {
  document.getElementById('plannerModal').classList.add('open');
  const v = document.getElementById('target-cgpa-input').value;
  if (v) { document.getElementById('target-cgpa-input-modal').value = v; calcTargetSGPA(true); }
  setTimeout(() => document.getElementById('target-cgpa-input-modal').focus(), 200);
}
function closePlannerModal() {
  document.getElementById('plannerModal').classList.remove('open');
}

function togglePanelSection(bodyId, arrowId) {
  const body  = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
}

/* ===== next script block ===== */

(async function restoreSession() {
  // Handle Google OAuth redirect (hash contains access_token)
  const { data: { session }, error } = await _sb.auth.getSession();

  if (!session) return; // no active session → stay on login page

  const uid = session.user.id;
  const authEmail = session.user.email;

  // Check if we have a local profile; if not (Google OAuth first login), fetch from DB
  let saved = localStorage.getItem('aktu_user');
  let user = saved ? JSON.parse(saved) : null;

  if (!user) {
    // Google / GitHub OAuth user — fetch their profile from DB
    const { data: profile } = await _sb.from('profiles').select('*').eq('id', uid).single();
    if (profile) {
      user = {
        uid,
        name: profile.name || session.user.user_metadata?.full_name || session.user.user_metadata?.user_name || authEmail.split('@')[0],
        email: authEmail,
        university: profile.university || '',
        course: profile.course || '',
        college: profile.college || '',
        roll: profile.roll_number || '',
        branch: profile.branch || '',
        domain: profile.domain || '',
        group: profile.batch_group || ''
      };
      localStorage.setItem('aktu_user', JSON.stringify(user));
    } else {
      // New OAuth user — pre-fill name/email from provider metadata
      const meta = session.user.user_metadata || {};
      const prefillName  = meta.full_name || meta.name || meta.user_name || '';
      const prefillEmail = authEmail || '';
      const provider     = session.user.app_metadata?.provider || 'oauth';
      setTimeout(() => {
        const ni = document.getElementById('inp-name');
        const ei = document.getElementById('inp-email');
        if (ni && prefillName)  ni.value = prefillName;
        if (ei && prefillEmail) ei.value = prefillEmail;
        const hero = document.querySelector('.hero-tagline');
        const providerLabel = provider === 'github' ? '🐙 GitHub' : '🔵 Google';
        if (hero) hero.textContent = `✅ ${providerLabel} sign-in successful! Just fill in your college details below.`;
      }, 200);
      return;
    }
  } else {
    user.uid = uid;
  }

  // ── Log session to Supabase ──
  try {
    await _sb.from('sessions').insert({
      user_id: uid,
      user_email: authEmail,
      user_name: user.name,
      login_at: new Date().toISOString(),
      device: navigator.userAgent.substring(0, 200),
      provider: session.user.app_metadata?.provider || 'oauth'
    });
    // Upsert full profile (keeps it fresh)
    await _sb.from('profiles').upsert({
      id: uid,
      name: user.name,
      email: authEmail,
      university: user.university || '',
      course: user.course || '',
      college: user.college || '',
      roll_number: user.roll || '',
      branch: user.branch || '',
      domain: user.domain || '',
      batch_group: user.group || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  } catch(e) {}

  // ── Track visit ──
  gwTrackVisit('app_load', uid);

  applyGroupToSemesters(user.group || '');
  await loadMarksFromDB();
  initApp(user);
})();

/* ===== next script block ===== */

// ══ ADMIN — secret trigger: type "admin" anywhere while holding Ctrl+Shift ══
const ADMIN_EMAIL = 'psinghal651@gmail.com'; // ← your admin email here
const ADMIN_EMAIL_2 = 'dakashchoudhary2005@gmail.com'; // ← secondary admin
let _adminKeyBuf = '';
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey) {
    _adminKeyBuf += e.key.toLowerCase();
    if (_adminKeyBuf.length > 5) _adminKeyBuf = _adminKeyBuf.slice(-5);
    if (_adminKeyBuf.endsWith('admin')) openAdmin();
  } else {
    _adminKeyBuf = '';
  }
});

async function openAdmin() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { alert('Please log in first.'); return; }
  if (session.user.email !== ADMIN_EMAIL && session.user.email !== ADMIN_EMAIL_2) {
    alert('⛔ Access denied. Admin only.');
    return;
  }
  document.getElementById('adminPanel').style.display = 'block';
  adminTab('users');
  loadAdminStats();
}

function closeAdmin() {
  document.getElementById('adminPanel').style.display = 'none';
}

function adminTab(tab) {
  ['users','sessions','visits','marks'].forEach(t => {
    document.getElementById('admin-' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('atab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'users')    loadAdminUsers();
  if (tab === 'sessions') loadAdminSessions();
  if (tab === 'visits')   loadAdminVisits();
  if (tab === 'marks')    loadAdminMarks();
}

async function loadAdminStats() {
  const [usersRes, sessionsRes, visitsRes] = await Promise.all([
    _sb.from('profiles').select('id', { count: 'exact', head: true }),
    _sb.from('sessions').select('id', { count: 'exact', head: true }),
    _sb.from('page_visits').select('id', { count: 'exact', head: true }),
  ]);
  // unique users today
  const today = new Date().toISOString().slice(0,10);
  const { count: todayLogins } = await _sb
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .gte('login_at', today);

  const stats = [
    { label: 'Total Users',    val: usersRes.count ?? '—',    color: 'var(--cyan)' },
    { label: 'Total Logins',   val: sessionsRes.count ?? '—', color: 'var(--purple)' },
    { label: 'Total Visits',   val: visitsRes.count ?? '—',   color: 'var(--green)' },
    { label: 'Logins Today',   val: todayLogins ?? '—',       color: 'var(--yellow)' },
  ];
  document.getElementById('adminStats').innerHTML = stats.map(s => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:1rem 1.2rem;">
      <div style="font-size:0.68rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;font-weight:600;">${s.label}</div>
      <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:800;color:${s.color};margin-top:4px;">${s.val}</div>
    </div>
  `).join('');
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-body');
  tbody.innerHTML = '<tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-dim);">Loading…</td></tr>';
  const { data, error } = await _sb
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) { tbody.innerHTML = `<tr><td colspan="8" style="padding:1rem;text-align:center;color:var(--red);">Error: ${error?.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-dim);">No users yet.</td></tr>'; return; }
  tbody.innerHTML = data.map(u => `
    <tr class="admin-tr-row">
      <td><strong style="color:var(--text);">${esc(u.name || '—')}</strong></td>
      <td style="color:var(--cyan);">${esc(u.email || '—')}</td>
      <td>${esc(u.university || '—')}</td>
      <td>${esc(u.course || '—')}</td>
      <td>${esc(u.branch || '—')}</td>
      <td>${esc(u.college || '—')}</td>
      <td><span style="font-family:var(--font-mono);font-size:0.75rem;">${esc(u.roll_number || '—')}</span></td>
      <td style="color:var(--text-dim);font-size:0.75rem;">${u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—'}</td>
    </tr>`).join('');
}

async function loadAdminSessions() {
  const tbody = document.getElementById('admin-sessions-body');
  tbody.innerHTML = '<tr><td colspan="4" style="padding:2rem;text-align:center;color:var(--text-dim);">Loading…</td></tr>';
  const { data, error } = await _sb
    .from('sessions')
    .select('*')
    .order('login_at', { ascending: false })
    .limit(300);
  if (error || !data) { tbody.innerHTML = `<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--red);">Error: ${error?.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:var(--text-dim);">No sessions yet.</td></tr>'; return; }
  tbody.innerHTML = data.map(s => {
    const providerColors = { github: '#fff', google: '#4285F4', email: 'var(--cyan)', oauth: 'var(--purple)' };
    const providerBg     = { github: 'rgba(255,255,255,0.08)', google: 'rgba(66,133,244,0.12)', email: 'rgba(6,182,212,0.1)', oauth: 'rgba(139,92,246,0.1)' };
    const providerIcons  = { github: '🐙', google: '🔵', email: '📧', oauth: '🔑' };
    const prov = s.provider || 'email';
    return `<tr class="admin-tr-row">
      <td><strong style="color:var(--text);">${esc(s.user_name || '—')}</strong></td>
      <td style="color:var(--cyan);">${esc(s.user_email || '—')}</td>
      <td><span style="background:${providerBg[prov]||'rgba(100,116,139,0.1)'};color:${providerColors[prov]||'var(--text-muted)'};border:1px solid ${providerColors[prov]||'var(--border)'}44;border-radius:6px;padding:2px 9px;font-size:0.72rem;font-weight:700;">${providerIcons[prov]||'🔑'} ${prov}</span></td>
      <td style="color:var(--text-dim);font-size:0.78rem;">${s.login_at ? new Date(s.login_at).toLocaleString('en-IN') : '—'}</td>
      <td style="color:var(--text-dim);font-size:0.7rem;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc((s.device || '—').substring(0,80))}</td>
    </tr>`;
  }).join('');
}

async function loadAdminVisits() {
  const tbody = document.getElementById('admin-visits-body');
  tbody.innerHTML = '<tr><td colspan="3" style="padding:2rem;text-align:center;color:var(--text-dim);">Loading…</td></tr>';
  const { data, error } = await _sb
    .from('page_visits')
    .select('*')
    .order('visited_at', { ascending: false })
    .limit(500);
  if (error || !data) { tbody.innerHTML = `<tr><td colspan="3" style="padding:1rem;text-align:center;color:var(--red);">Error: ${error?.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="3" style="padding:2rem;text-align:center;color:var(--text-dim);">No visits yet.</td></tr>'; return; }
  const pageColors = { dashboard:'var(--cyan)', grades:'var(--purple)', resources:'var(--green)', internships:'var(--yellow)', analyser:'#f97316', login:'var(--text-muted)', app_load:'var(--text-dim)' };
  tbody.innerHTML = data.map(v => {
    const col = pageColors[v.page] || 'var(--text-muted)';
    return `<tr class="admin-tr-row">
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);">${esc((v.user_id||'').substring(0,18))}…</td>
      <td><span style="background:${col}18;color:${col};border:1px solid ${col}44;border-radius:6px;padding:2px 10px;font-size:0.75rem;font-weight:700;font-family:var(--font-mono);">${esc(v.page||'—')}</span></td>
      <td style="color:var(--text-dim);font-size:0.75rem;">${v.visited_at ? new Date(v.visited_at).toLocaleString('en-IN') : '—'}</td>
    </tr>`;
  }).join('');
}

async function loadAdminMarks() {
  const tbody = document.getElementById('admin-marks-body');
  tbody.innerHTML = '<tr><td colspan="4" style="padding:2rem;text-align:center;color:var(--text-dim);">Loading…</td></tr>';
  const { data, error } = await _sb
    .from('marks_snapshots')
    .select('*')
    .order('saved_at', { ascending: false })
    .limit(200);
  if (error || !data) { tbody.innerHTML = `<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--red);">Error: ${error?.message}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="4" style="padding:2rem;text-align:center;color:var(--text-dim);">No snapshots yet.</td></tr>'; return; }
  tbody.innerHTML = data.map(m => {
    const sgpa = Array.isArray(m.sgpa_per_sem)
      ? m.sgpa_per_sem.map((v,i) => v > 0 ? `<span style="font-size:0.7rem;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:4px;padding:1px 6px;margin:1px;">S${i+1}:${v}</span>` : '').join('')
      : '—';
    const cgpaColor = m.cgpa >= 8.5 ? 'var(--green)' : m.cgpa >= 7 ? 'var(--cyan)' : m.cgpa >= 6 ? 'var(--yellow)' : 'var(--red)';
    return `<tr class="admin-tr-row">
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);">${esc((m.user_id||'').substring(0,18))}…</td>
      <td><span style="font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:${cgpaColor};">${m.cgpa ?? '—'}</span></td>
      <td style="max-width:260px;">${sgpa}</td>
      <td style="color:var(--text-dim);font-size:0.75rem;">${m.saved_at ? new Date(m.saved_at).toLocaleString('en-IN') : '—'}</td>
    </tr>`;
  }).join('');
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}