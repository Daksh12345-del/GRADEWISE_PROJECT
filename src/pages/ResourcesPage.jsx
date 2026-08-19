import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEMESTERS } from '../lib/gradesData'
import { VIDEO_DATA, PYQ_LINKS, SUBJECT_NOTES } from '../lib/resourcesData'
import { BATCH_SWAP_COMBINED_CODES, BATCH_SWAP_OVERRIDE } from '../lib/batchGroups'
import { fetchAiExplain } from '../lib/api'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { useAuthUser, useLogout } from '../lib/useAuthUser'
import { useLiveContentVersion } from '../lib/LiveContentGate'
import ScanModal from './components/ScanModal'
import Logo from './components/Logo'
import { RevealOnScroll } from './components/motionKit'

// Violet→gold spectrum (matches the brand duotone used everywhere else)
// instead of the previous true-rainbow mix (cyan/violet/green/amber/blue/
// pink), which read as random "confetti" rather than a deliberate palette.
// Still varied enough to tell consecutive video cards apart at a glance.
const VIDEO_COLORS = ['#a78bfa','#fbbf24','#8b5cf6','#f59e0b','#c4b5fd','#facc15','#7c3aed','#fcd34d']

// Batch-group swap tables now live in ../lib/batchGroups.js — shared with
// the PDF scanner, which uses the same data to auto-detect a student's
// group straight from their result sheet. See that file for the full
// Physics-first/Chemistry-first explanation.


// Some of the swapped subjects genuinely have different content per half
// (Physics vs Chemistry, Electrical vs Electronics) — those need real,
// separately-authored resource data (still missing for a few, see chat).
// Others are the SAME course regardless of which semester a given batch
// happens to take it in (Programming, Mechanical, Environment, Soft Skills,
// UHV, Technical Communication, Cyber Security, Python) — for those we just
// point the "other semester's" code at the existing data instead of waiting
// on duplicate resource links for identical content.
const CODE_ALIASES = {
  BME101: 'BME201', BCS201: 'BCS101',
  BAS105: 'BAS-205', BAS204: 'BAS-104',
  BVE301: 'BVE-401', BAS401: 'BAS-301',
  BCC402: 'BCC-302', BCC401: 'BCC-301',
  BAS303: 'BAS-303/404', BAS404: 'BAS-303/404',
}

function resolveCode(p) {
  return CODE_ALIASES[p] || p
}

// Applies the batch-group swap + drops practicals/labs/audit subjects for one
// semester. Shared by the per-semester tab view AND the new global search
// (so both always show the same "your actual subject" resolution).
function getSwappedSubjects(sem, semIndex, group) {
  let base = sem.subjects.filter(s => !s.audit && s.type !== 'Practical')
  const combinedCodes = BATCH_SWAP_COMBINED_CODES[semIndex]
  if (combinedCodes && (group === 'A' || group === 'B')) {
    base = base.map(s => {
      if (!combinedCodes.includes(s.code)) return s
      const pick = BATCH_SWAP_OVERRIDE[semIndex][s.code][group]
      return { ...s, code: pick.code, name: pick.name }
    })
  }
  return base
}

// Hyphen-agnostic lookup: some resourcesData keys are hyphenated (BAS-104)
// while the matching gradesData subject code isn't (BAS104), or vice versa.
// Comparing both sides with hyphens stripped means either style matches.
function lookup(dict, raw) {
  const parts = raw.replace(/\*/g,'').split('/').map(s => s.trim())
  for (const p of parts) {
    const key = resolveCode(p)
    if (dict[key]) return dict[key]
    const noHyphen = key.replace(/-/g,'')
    for (const k of Object.keys(dict)) {
      if (k.replace(/-/g,'') === noHyphen) return dict[k]
    }
  }
  return null
}

function getVideoData(raw) {
  return lookup(VIDEO_DATA, raw)
}

function getPYQ(raw) {
  return lookup(PYQ_LINKS, raw)
}

function getSubjectNotes(raw) {
  return lookup(SUBJECT_NOTES, raw)
}

// All Dept/Open Elective specific subjects that have data.
// NOTE: this used to be a module-level IIFE that ran once at import time —
// which meant it would freeze on the bundled fallback data even after live
// Supabase content replaced SEMESTERS/VIDEO_DATA/PYQ_LINKS. It's now a plain
// function, called from inside the component (see useMemo below) so it can
// recompute once live content lands.
function computeDeptElectiveSubjects() {
  const out = []
  SEMESTERS.forEach(sem => {
    sem.subjects.forEach(subj => {
      if (subj.options) {
        subj.options.forEach(opt => {
          const code = opt.split(' - ')[0].trim()
          const vd = getVideoData(code)
          const pyq = getPYQ(code)
          if (vd || pyq) out.push({ code, name: opt.split(' - ').slice(1).join(' - '), sem: sem.label, vd, pyq })
        })
      }
    })
  })
  return out
}

// Every theory subject across every semester (I–VIII), batch-group resolved,
// flattened into one list — this is what the global search searches through.
function buildAllSubjects(group, deptElectiveSubjects) {
  const out = []
  SEMESTERS.forEach((sem, si) => {
    getSwappedSubjects(sem, si, group).forEach(s => {
      if (s.type === 'Elective') return // electives are listed separately below, per option
      out.push({ code: s.code, name: s.name, semLabel: sem.label })
    })
  })
  deptElectiveSubjects.forEach(e => {
    out.push({ code: e.code, name: e.name, semLabel: e.sem })
  })
  return out
}

function tileStyle(color, active, disabled) {
  return {
    flex: '1 1 90px', minWidth: 84, padding: '0.7rem 0.5rem', borderRadius: 10, textAlign: 'center',
    border: `1.5px solid ${active ? color : color + '40'}`, background: active ? color + '22' : 'rgba(0,0,0,0.12)',
    color, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: '1.25rem',
  }
}

// Global-search result card: click the subject → a little "folder" opens with
// three tiles (🎥 Videos / 📝 Notes / 📄 PYQ). Click a tile to open just that
// resource — Videos/Notes expand inline, PYQ opens straight in a new tab.
function AllSubjectCard({ subj }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(null) // null | 'videos' | 'notes' | 'pyq' | 'explain'
  const [explainState, setExplainState] = useState({ status: 'idle' }) // idle | loading | ready | error

  async function handleExplainClick() {
    const willOpen = activeTab !== 'explain'
    setActiveTab(willOpen ? 'explain' : null)
    if (willOpen && explainState.status === 'idle') {
      setExplainState({ status: 'loading' })
      try {
        const explanation = await fetchAiExplain(subj.name)
        setExplainState({ status: 'ready', text: explanation })
      } catch (e) {
        setExplainState({ status: 'error', error: e.message || 'Failed to get explanation' })
      }
    }
  }
  const vd = getVideoData(subj.code)
  const pyq = getPYQ(subj.code)
  const fullNotes = getSubjectNotes(subj.code)
  const units = vd ? Object.entries(vd) : []
  const totalVideos = units.reduce((acc, [, u]) => acc + (u.groups || []).flat().length, 0)
  const notesUnits = units.filter(([, u]) => Array.isArray(u.notes) ? u.notes.length > 0 : !!u.notes)
  const hasNotesAnywhere = notesUnits.length > 0 || !!fullNotes
  const hasAnything = totalVideos > 0 || hasNotesAnywhere || !!pyq

  return (
    <div className="res-subj-card">
      <div className="res-subj-header" onClick={() => setOpen(v => !v)}>
        <div className="res-subj-left">
          <SubjectIcon code={subj.code} name={subj.name} size={34} />
          <span className="res-subj-code">{subj.code}</span>
          <span className="res-subj-name">{subj.name}</span>
        </div>
        <div className="res-subj-meta">
          <span className="res-badge" style={{ background: 'rgba(124,58,237,0.12)', color: '#c4b5fd', fontSize: '0.65rem' }}>
            {subj.semLabel}
          </span>
          {!hasAnything && (
            <span className="res-badge" style={{ background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>Coming Soon</span>
          )}
          <span className="res-subj-arrow">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="res-subj-body">
          {hasAnything ? (
            <>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setActiveTab(t => t === 'videos' ? null : 'videos')}
                  disabled={totalVideos === 0}
                  style={tileStyle('#8b5cf6', activeTab === 'videos', totalVideos === 0)}
                >
                  🎥<div style={{ fontSize: '0.7rem', marginTop: 2 }}>Videos</div>
                  <div style={{ fontSize: '0.6rem', opacity: 0.75 }}>{totalVideos || '—'}</div>
                </button>
                <button
                  onClick={() => setActiveTab(t => t === 'notes' ? null : 'notes')}
                  disabled={!hasNotesAnywhere}
                  style={tileStyle('#10b981', activeTab === 'notes', !hasNotesAnywhere)}
                >
                  📝<div style={{ fontSize: '0.7rem', marginTop: 2 }}>Notes</div>
                </button>
                <button
                  onClick={() => setActiveTab(t => t === 'pyq' ? null : 'pyq')}
                  disabled={!pyq}
                  style={tileStyle('#f59e0b', activeTab === 'pyq', !pyq)}
                >
                  📄<div style={{ fontSize: '0.7rem', marginTop: 2 }}>PYQ</div>
                </button>
                <button
                  onClick={handleExplainClick}
                  style={tileStyle('#818cf8', activeTab === 'explain', false)}
                  title="Get a quick AI explanation of this subject"
                >
                  ✨<div style={{ fontSize: '0.7rem', marginTop: 2 }}>Explain</div>
                </button>
              </div>

              {activeTab === 'explain' && (
                <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', borderRadius: 10, background: 'var(--bg-card2)', border: '1px solid var(--border)' }}>
                  {explainState.status === 'loading' && <div className="dsa-idle">Asking AI Coach…</div>}
                  {explainState.status === 'error' && <div className="dsa-error">⚠️ {explainState.error}</div>}
                  {explainState.status === 'ready' && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>{explainState.text}</div>
                  )}
                </div>
              )}

              {activeTab === 'videos' && (
                <div style={{ marginTop: '1rem' }}>
                  {units.map(([unitNum, unitData]) => (
                    <UnitRow key={unitNum} unitNum={unitNum} unitData={unitData} subjectTopic={subj.name} />
                  ))}
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="res-videos-row" style={{ marginTop: '1rem' }}>
                  {fullNotes && <NotesCard url={fullNotes} label="Full Notes" subjectTopic={subj.name} />}
                  {notesUnits.map(([unitNum, u]) => {
                    const list = Array.isArray(u.notes) ? u.notes : [u.notes]
                    return list.map((n, ni) => (
                      <NotesCard key={`${unitNum}-${ni}`} url={n} subjectTopic={subj.name}
                        label={`Unit ${unitNum} Notes${list.length > 1 ? ` ${ni + 1}` : ''}`} />
                    ))
                  })}
                </div>
              )}

              {activeTab === 'pyq' && pyq && (
                <div className="res-videos-row" style={{ marginTop: '1rem' }}>
                  <PyqCard url={pyq} subjectTopic={subj.name} />
                </div>
              )}
            </>
          ) : (
            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.5rem 0 0.8rem' }}>
                Resources coming soon for this subject — but you can still get a quick AI explanation:
              </div>
              <button
                onClick={handleExplainClick}
                style={tileStyle('#818cf8', activeTab === 'explain', false)}
                title="Get a quick AI explanation of this subject"
              >
                ✨<div style={{ fontSize: '0.7rem', marginTop: 2 }}>Explain</div>
              </button>
              {activeTab === 'explain' && (
                <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', borderRadius: 10, background: 'var(--bg-card2)', border: '1px solid var(--border)' }}>
                  {explainState.status === 'loading' && <div className="dsa-idle">Asking AI Coach…</div>}
                  {explainState.status === 'error' && <div className="dsa-error">⚠️ {explainState.error}</div>}
                  {explainState.status === 'ready' && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>{explainState.text}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Per-subject "AI-style" visual generator ──────────────────────────────
// No real image-gen API here, so instead we deterministically derive a
// unique look for every subject: a topic-relevant icon + a seeded abstract
// background pattern (colors/shapes vary per subject code) — same subject
// always renders the same way, every subject looks different.
function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

const ICON_RULES = [
  [/physic/i, '⚛️'], [/chemistr/i, '🧪'], [/mathemat/i, '➗'],
  [/electron/i, '🔌'], [/electric/i, '⚡'], [/mechanic/i, '⚙️'],
  [/artificial|deep learning|machine learn/i, '🤖'], [/database/i, '🗄️'],
  [/network/i, '🌐'], [/cyber|security|cryptograph/i, '🔒'],
  [/cloud/i, '☁️'], [/compiler|automata|formal language/i, '🔤'],
  [/operating system/i, '🖥️'], [/data structure|algorithm/i, '🌳'],
  [/java|python|programming|c\+\+|oop/i, '💻'], [/web|html|javascript/i, '🕸️'],
  [/software engineer/i, '🛠️'], [/mobile|android|ios/i, '📱'],
  [/iot|embedded|sensor/i, '📡'], [/environment/i, '🌱'],
  [/human values|ethics/i, '🕊️'], [/communication|soft skill|english/i, '💬'],
  [/graphic|workshop|design/i, '📐'], [/constitution/i, '⚖️'],
]
function iconFor(name = '') {
  for (const [re, icon] of ICON_RULES) if (re.test(name)) return icon
  return '📘'
}

const PALETTE = [
  ['#06b6d4', '#0891b2'], ['#8b5cf6', '#7c3aed'], ['#10b981', '#059669'],
  ['#f59e0b', '#d97706'], ['#ec4899', '#db2777'], ['#3b82f6', '#2563eb'],
  ['#22d3ee', '#0e7490'], ['#a78bfa', '#6d28d9'], ['#f97316', '#c2410c'],
]

// Small seeded abstract-pattern badge with a topic icon on top. size in px.
function SubjectIcon({ code, name, size = 34 }) {
  const seed = hashSeed(code || name || 'x')
  const [c1, c2] = PALETTE[seed % PALETTE.length]
  const icon = iconFor(name)
  const patternType = seed % 3 // 0 dots, 1 diagonal lines, 2 rings
  const uid = `si-${seed}`

  return (
    <svg width={size} height={size} viewBox="0 0 44 44" style={{ borderRadius: size * 0.26, flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="44" height="44" fill={`url(#${uid})`} />
      {patternType === 0 && [...Array(5)].map((_, i) => (
        <circle key={i} cx={((seed >> (i * 3)) % 40) + 2} cy={((seed >> (i * 5)) % 40) + 2} r={1.6} fill="rgba(255,255,255,0.35)" />
      ))}
      {patternType === 1 && [...Array(4)].map((_, i) => (
        <line key={i} x1={-4 + i * 14} y1="48" x2={i * 14 + 10} y2="-4" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
      ))}
      {patternType === 2 && (
        <>
          <circle cx="34" cy="10" r="12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <circle cx="8" cy="36" r="8" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
        </>
      )}
      <text x="22" y="29" fontSize="19" textAnchor="middle">{icon}</text>
    </svg>
  )
}

// ── Topic-relevant chalk/ink sketch, reused across video/notes thumbnails ──
const DIAGRAM_RULES = [
  [/data structure|algorithm/i, 'tree'],
  [/physic/i, 'atom'],
  [/chemistr/i, 'flask'],
  [/mathemat/i, 'graph'],
  [/electron|electric/i, 'circuit'],
  [/mechanic/i, 'gear'],
  [/artificial|deep learning|machine learn/i, 'neural'],
  [/database/i, 'db'],
  [/network/i, 'network'],
  [/cyber|security|cryptograph/i, 'lock'],
  [/cloud/i, 'cloud'],
  [/compiler|automata|formal language/i, 'code'],
  [/operating system/i, 'monitor'],
  [/java|python|programming|c\+\+|oop|web|html|javascript/i, 'code'],
  [/software engineer/i, 'flowchart'],
  [/mobile|android|ios/i, 'phone'],
  [/iot|embedded|sensor/i, 'wave'],
  [/environment/i, 'leaf'],
  [/human values|ethics|constitution/i, 'scale'],
  [/communication|soft skill|english/i, 'chat'],
  [/graphic|workshop|design/i, 'ruler'],
]
function diagramFor(name = '') {
  for (const [re, key] of DIAGRAM_RULES) if (re.test(name)) return key
  return 'book'
}

// Drawn inside a local 100x60 box; `ink` sets the sketch color (chalk-white on
// the video whiteboard, dark ink on the notebook page).
function BoardDiagram({ type, ink = 'rgba(30,41,59,0.75)' }) {
  const p = { stroke: ink, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  switch (type) {
    case 'tree': return (
      <g {...p}>
        <circle cx="50" cy="10" r="5" fill={ink} stroke="none" /><circle cx="28" cy="32" r="5" fill={ink} stroke="none" /><circle cx="72" cy="32" r="5" fill={ink} stroke="none" />
        <circle cx="16" cy="52" r="4" fill={ink} stroke="none" /><circle cx="40" cy="52" r="4" fill={ink} stroke="none" /><circle cx="84" cy="52" r="4" fill={ink} stroke="none" />
        <line x1="50" y1="15" x2="28" y2="27" /><line x1="50" y1="15" x2="72" y2="27" />
        <line x1="28" y1="37" x2="16" y2="48" /><line x1="28" y1="37" x2="40" y2="48" /><line x1="72" y1="37" x2="84" y2="48" />
      </g>
    )
    case 'atom': return (
      <g {...p}>
        <circle cx="50" cy="30" r="4" fill={ink} stroke="none" />
        <ellipse cx="50" cy="30" rx="42" ry="16" />
        <ellipse cx="50" cy="30" rx="42" ry="16" transform="rotate(60 50 30)" />
        <ellipse cx="50" cy="30" rx="42" ry="16" transform="rotate(120 50 30)" />
      </g>
    )
    case 'flask': return (
      <g {...p}>
        <path d="M42 8 L42 24 L26 52 Q24 56 30 56 L70 56 Q76 56 74 52 L58 24 L58 8" />
        <line x1="38" y1="8" x2="62" y2="8" />
        <circle cx="42" cy="44" r="2" fill={ink} stroke="none" /><circle cx="54" cy="48" r="1.6" fill={ink} stroke="none" /><circle cx="48" cy="40" r="1.6" fill={ink} stroke="none" />
      </g>
    )
    case 'graph': return (
      <g {...p}>
        <line x1="14" y1="52" x2="14" y2="8" /><line x1="14" y1="52" x2="90" y2="52" />
        <path d="M14 44 Q35 8 55 32 T90 14" />
      </g>
    )
    case 'circuit': return (
      <g {...p}>
        <line x1="10" y1="30" x2="30" y2="30" />
        <path d="M30 30 L36 18 L44 42 L52 18 L60 30" />
        <line x1="60" y1="30" x2="76" y2="30" />
        <circle cx="82" cy="30" r="6" />
      </g>
    )
    case 'gear': return (
      <g {...p}>
        <circle cx="50" cy="30" r="14" />
        <circle cx="50" cy="30" r="4" fill={ink} stroke="none" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <line key={a}
            x1={50 + 14 * Math.cos(a * Math.PI / 180)} y1={30 + 14 * Math.sin(a * Math.PI / 180)}
            x2={50 + 20 * Math.cos(a * Math.PI / 180)} y2={30 + 20 * Math.sin(a * Math.PI / 180)} />
        ))}
      </g>
    )
    case 'neural': return (
      <g {...p} strokeWidth="1">
        {[14, 30, 46].map(y => <circle key={'a' + y} cx="20" cy={y} r="3.5" fill={ink} stroke="none" />)}
        {[8, 22, 36, 50].map(y => <circle key={'b' + y} cx="50" cy={y} r="3.5" fill={ink} stroke="none" />)}
        {[16, 32, 48].map(y => <circle key={'c' + y} cx="80" cy={y} r="3.5" fill={ink} stroke="none" />)}
        {[14, 30, 46].flatMap(y1 => [8, 22, 36, 50].map(y2 => <line key={`n1-${y1}-${y2}`} x1="20" y1={y1} x2="50" y2={y2} />))}
        {[8, 22, 36, 50].flatMap(y1 => [16, 32, 48].map(y2 => <line key={`n2-${y1}-${y2}`} x1="50" y1={y1} x2="80" y2={y2} />))}
      </g>
    )
    case 'db': return (
      <g {...p}>
        <ellipse cx="50" cy="14" rx="26" ry="8" />
        <path d="M24 14 L24 46 Q24 54 50 54 Q76 54 76 46 L76 14" />
        <path d="M24 30 Q24 38 50 38 Q76 38 76 30" />
      </g>
    )
    case 'network': return (
      <g {...p}>
        <circle cx="50" cy="14" r="4" fill={ink} stroke="none" /><circle cx="20" cy="46" r="4" fill={ink} stroke="none" />
        <circle cx="50" cy="46" r="4" fill={ink} stroke="none" /><circle cx="80" cy="46" r="4" fill={ink} stroke="none" />
        <line x1="50" y1="14" x2="20" y2="46" /><line x1="50" y1="14" x2="50" y2="46" /><line x1="50" y1="14" x2="80" y2="46" />
      </g>
    )
    case 'lock': return (
      <g {...p}>
        <rect x="30" y="26" width="40" height="30" rx="4" />
        <path d="M36 26 L36 16 Q36 4 50 4 Q64 4 64 16 L64 26" />
        <circle cx="50" cy="40" r="3" fill={ink} stroke="none" />
      </g>
    )
    case 'cloud': return (
      <g {...p}>
        <path d="M26 46 Q14 46 14 36 Q14 26 26 26 Q28 12 46 12 Q62 12 66 26 Q80 26 80 38 Q80 46 68 46 Z" />
      </g>
    )
    case 'code': return (
      <g {...p}>
        <path d="M34 14 L16 30 L34 46" /><path d="M66 14 L84 30 L66 46" />
        <line x1="56" y1="10" x2="44" y2="50" />
      </g>
    )
    case 'flowchart': return (
      <g {...p}>
        <rect x="34" y="4" width="32" height="14" rx="3" />
        <line x1="50" y1="18" x2="50" y2="26" />
        <path d="M50 26 L34 40 L50 54 L66 40 Z" />
      </g>
    )
    case 'monitor': return (
      <g {...p}>
        <rect x="16" y="10" width="68" height="40" rx="3" />
        <line x1="50" y1="50" x2="50" y2="56" /><line x1="34" y1="56" x2="66" y2="56" />
        <circle cx="64" cy="26" r="7" />
      </g>
    )
    case 'phone': return (
      <g {...p}>
        <rect x="36" y="4" width="28" height="52" rx="5" />
        <line x1="46" y1="50" x2="54" y2="50" />
      </g>
    )
    case 'wave': return (
      <g {...p}>
        <circle cx="20" cy="30" r="3" fill={ink} stroke="none" />
        <path d="M28 30 Q34 18 40 30 T52 30" />
        <path d="M28 30 Q36 8 44 30 T60 30" />
        <path d="M28 30 Q40 -2 50 30 T70 30" />
      </g>
    )
    case 'leaf': return (
      <g {...p}>
        <path d="M20 52 Q20 12 70 8 Q66 46 20 52 Z" />
        <line x1="22" y1="50" x2="66" y2="10" />
      </g>
    )
    case 'scale': return (
      <g {...p}>
        <line x1="50" y1="6" x2="50" y2="50" /><line x1="24" y1="14" x2="76" y2="14" />
        <path d="M14 14 L24 14 L19 32 Q10 34 14 14 Z" /><path d="M76 14 L86 14 L81 32 Q72 34 76 14 Z" />
        <line x1="36" y1="50" x2="64" y2="50" />
      </g>
    )
    case 'chat': return (
      <g {...p}>
        <rect x="10" y="8" width="46" height="30" rx="8" />
        <path d="M22 38 L18 48 L34 38" />
        <rect x="40" y="24" width="46" height="26" rx="8" />
      </g>
    )
    case 'ruler': return (
      <g {...p}>
        <g transform="rotate(-10 50 30)">
          <rect x="14" y="22" width="72" height="14" rx="2" />
          <line x1="24" y1="20" x2="24" y2="30" /><line x1="40" y1="20" x2="40" y2="30" /><line x1="56" y1="20" x2="56" y2="30" />
        </g>
      </g>
    )
    default: return (
      <g {...p}>
        <path d="M18 12 L50 12 L50 52 L18 52 Q14 52 14 48 L14 16 Q14 12 18 12 Z" />
        <path d="M50 12 L82 12 Q86 12 86 16 L86 48 Q86 52 82 52 L50 52" />
        <line x1="24" y1="24" x2="42" y2="24" /><line x1="24" y1="32" x2="42" y2="32" />
        <line x1="58" y1="24" x2="76" y2="24" /><line x1="58" y1="32" x2="76" y2="32" />
      </g>
    )
  }
}

// Small flat-style teacher, standing and pointing at the board with a stick.
function TeacherFigure({ shirt, skin }) {
  return (
    <g>
      <rect x="8" y="150" width="10" height="26" rx="3" fill="#334155" />
      <rect x="24" y="150" width="10" height="26" rx="3" fill="#334155" />
      <path d="M4 110 Q4 96 20 96 Q36 96 36 110 L36 154 L4 154 Z" fill={shirt} />
      <path d="M32 108 Q46 100 58 92" stroke={shirt} strokeWidth="7" strokeLinecap="round" fill="none" />
      <line x1="58" y1="92" x2="78" y2="80" stroke="#92400e" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 112 Q0 124 4 138" stroke={shirt} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="80" r="14" fill={skin} />
      <path d="M6 76 Q6 62 20 62 Q34 62 34 76 Q28 70 20 70 Q12 70 6 76 Z" fill="#1e293b" />
    </g>
  )
}

const SKIN_TONES = ['#f1c27d', '#d9a066', '#8d5524', '#f4c9a0']

// The topic thumbnail: same subject always gets the same colors + diagram,
// but the scene composition changes with `kind` so video/notes/pyq for the
// SAME subject each look distinct — teacher-at-whiteboard, open notebook, or
// exam sheet on a clipboard.
function TopicThumbnail({ topic, kind, label }) {
  const seed = hashSeed(topic || 'x')
  const [c1, c2] = PALETTE[seed % PALETTE.length]
  const skin = SKIN_TONES[seed % SKIN_TONES.length]
  const diagram = diagramFor(topic)
  const uid = `tt-${seed}-${kind}`
  const shortLabel = label.length > 24 ? label.slice(0, 24) + '…' : label
  const chipWidth = Math.min(220, 20 + shortLabel.length * 6.3)
  const badgeText = kind === 'video' ? 'VIDEO' : kind === 'notes' ? 'NOTES' : 'PYQ'
  const badgeWidth = kind === 'pyq' ? 36 : 52

  return (
    <svg viewBox="0 0 320 180" width="100%" style={{ display: 'block', borderRadius: '8px 8px 0 0' }}>
      <defs>
        <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid})`} />

      {kind === 'video' && (
        <>
          <circle cx="280" cy="20" r="70" fill="rgba(255,255,255,0.06)" />
          <rect x="130" y="16" width="175" height="110" rx="8" fill="rgba(248,250,252,0.95)" stroke="rgba(15,23,42,0.15)" strokeWidth="2" />
          <g transform="translate(155,26) scale(1.35)"><BoardDiagram type={diagram} /></g>
          <g transform="translate(14,4) scale(0.82)"><TeacherFigure shirt={c2} skin={skin} /></g>
          <circle cx="284" cy="148" r="20" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
          <polygon points="278,139 278,157 296,148" fill="white" />
        </>
      )}

      {kind === 'notes' && (
        <g transform="rotate(-1.5 160 90)">
          <rect x="20" y="14" width="280" height="152" rx="6" fill="#fdfaf3" stroke="rgba(15,23,42,0.15)" strokeWidth="2" />
          <line x1="160" y1="14" x2="160" y2="166" stroke="rgba(15,23,42,0.15)" strokeWidth="2" />
          {[26, 60, 94, 128, 156].map(y => <circle key={y} cx="160" cy={y} r="3" fill="none" stroke="rgba(15,23,42,0.3)" strokeWidth="1.5" />)}
          <line x1="34" y1="34" x2="120" y2="34" stroke={c2} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <line x1="34" y1="46" x2="140" y2="46" stroke="#334155" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
          <line x1="34" y1="58" x2="100" y2="58" stroke="#334155" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
          <line x1="34" y1="76" x2="130" y2="76" stroke="#334155" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <line x1="34" y1="88" x2="90" y2="88" stroke="#334155" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <g transform="translate(178,30) scale(0.95)"><BoardDiagram type={diagram} ink="#334155" /></g>
          <line x1="45" y1="140" x2="270" y2="118" stroke="#d97706" strokeWidth="6" strokeLinecap="round" />
          <polygon points="266,113 280,116 268,124" fill="#78350f" />
        </g>
      )}

      {kind === 'pyq' && (
        <>
          <rect x="66" y="10" width="188" height="24" rx="4" fill="#94a3b8" />
          <rect x="76" y="0" width="30" height="16" rx="3" fill="#64748b" />
          <rect x="76" y="30" width="168" height="140" fill="#fdfaf3" stroke="rgba(15,23,42,0.15)" strokeWidth="2" />
          <line x1="94" y1="52" x2="226" y2="52" stroke="#334155" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          <line x1="94" y1="68" x2="180" y2="68" stroke="#334155" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <rect x="94" y="84" width="12" height="12" rx="2" fill="none" stroke="#334155" strokeWidth="2" opacity="0.6" />
          <line x1="94" y1="112" x2="226" y2="112" stroke="#334155" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          <line x1="94" y1="128" x2="180" y2="128" stroke="#334155" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <rect x="94" y="144" width="12" height="12" rx="2" fill="none" stroke="#334155" strokeWidth="2" opacity="0.6" />
          <path d="M97 87 L100 91 L106 82" stroke="#059669" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M228 138 Q246 128 258 106" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" fill="none" />
          <circle cx="255" cy="112" r="16" fill="none" stroke="#dc2626" strokeWidth="2.5" opacity="0.8" transform="rotate(-12 255 112)" />
        </>
      )}

      <rect x="10" y="150" width={chipWidth} height="20" rx="10" fill="rgba(0,0,0,0.45)" />
      <text x="18" y="164" fontSize="10.5" fontWeight="700" fill="white" fontFamily="Arial">{shortLabel}</text>

      <rect x="4" y="4" width={badgeWidth} height="18" rx="9" fill="rgba(0,0,0,0.4)" />
      <text x={4 + badgeWidth / 2} y="16.5" fontSize="9" fontWeight="700" fill="white" textAnchor="middle" fontFamily="Arial">{badgeText}</text>
    </svg>
  )
}

function VideoCard({ group, idx, unitName, subjectTopic }) {
  const color = VIDEO_COLORS[idx % VIDEO_COLORS.length]
  const primaryUrl = group[0]
  const isPlaylist = primaryUrl.includes('playlist')
  const multiPart = group.length > 1
  const label = isPlaylist ? `Playlist ${idx + 1}` : unitName
  return (
    <div className="res-video-card" style={{ borderColor: color + '50', background: 'rgba(0,0,0,0.15)' }}>
      <a href={primaryUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <TopicThumbnail topic={subjectTopic || unitName} kind="video" label={label} />
      </a>
      <div className="res-video-label" style={{ color }}>{isPlaylist ? `Playlist ${idx+1}` : `Video ${idx+1}`}</div>
      <div className="res-part-row">
        {multiPart ? (
          group.map((url, pi) => (
            <a key={pi} href={url} target="_blank" rel="noopener noreferrer"
               className="res-watch-btn res-part-btn" style={{ borderColor: color, color }}>
              ▶ Part {pi + 1}
            </a>
          ))
        ) : (
          <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="res-watch-btn" style={{ borderColor: color, color }}>
            {isPlaylist ? '📋 Playlist' : '▶ Watch'}
          </a>
        )}
      </div>
    </div>
  )
}

// Same card shell as VideoCard, but for a notes PDF/link — thumbnail shows an
// open-notebook scene instead of a whiteboard.
function NotesCard({ url, label, subjectTopic }) {
  return (
    <div className="res-video-card" style={{ borderColor: '#10b98150', background: 'rgba(0,0,0,0.15)' }}>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <TopicThumbnail topic={subjectTopic} kind="notes" label={label} />
      </a>
      <div className="res-video-label" style={{ color: '#10b981' }}>{label}</div>
      <div className="res-part-row">
        <a href={url} target="_blank" rel="noopener noreferrer" className="res-watch-btn" style={{ borderColor: '#10b981', color: '#10b981' }}>
          📄 Open Notes
        </a>
      </div>
    </div>
  )
}

// Same card shell again, for the PYQ link — thumbnail shows an exam sheet.
function PyqCard({ url, subjectTopic, label = 'Previous Year Qs' }) {
  return (
    <div className="res-video-card" style={{ borderColor: '#f59e0b50', background: 'rgba(0,0,0,0.15)' }}>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <TopicThumbnail topic={subjectTopic} kind="pyq" label={label} />
      </a>
      <div className="res-video-label" style={{ color: '#f59e0b' }}>PYQ</div>
      <div className="res-part-row">
        <a href={url} target="_blank" rel="noopener noreferrer" className="res-watch-btn" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
          📝 View PYQ
        </a>
      </div>
    </div>
  )
}

function UnitRow({ unitNum, unitData, subjectTopic }) {
  const [open, setOpen] = useState(false)
  const groups = unitData.groups || []
  const videoCount = groups.flat().length
  const notes = Array.isArray(unitData.notes) ? unitData.notes : (unitData.notes ? [unitData.notes] : [])

  return (
    <div className="res-unit">
      <div className="res-unit-header" onClick={() => setOpen(v => !v)}>
        <span className="res-unit-num">Unit {unitNum}</span>
        <span className="res-unit-name">{unitData.unit_name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
          {notes.length > 0 && <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>📄</span>}
          {videoCount > 0 && <span style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 700 }}>{videoCount}▶</span>}
          <span className={`res-unit-arrow ${open ? 'open' : ''}`}>▼</span>
        </div>
      </div>
      {open && (
        <div className="res-unit-body">
          {groups.length > 0 && (
            <div className="res-videos-row">
              {groups.map((group, gi) => (
                <VideoCard key={gi} group={group} idx={gi} unitName={unitData.unit_name} subjectTopic={subjectTopic} />
              ))}
            </div>
          )}
          {notes.length > 0 && (
            <div className="res-videos-row">
              {notes.map((n, ni) => (
                <NotesCard key={ni} url={n} subjectTopic={subjectTopic}
                  label={`Unit ${unitNum} Notes${notes.length > 1 ? ` ${ni + 1}` : ''}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SubjectCard({ subj, gold }) {
  const [open, setOpen] = useState(false)
  const vd = getVideoData(subj.code)
  const pyq = getPYQ(subj.code)
  const fullNotes = getSubjectNotes(subj.code)
  const units = vd ? Object.entries(vd) : []
  const totalVideos = units.reduce((acc, [, u]) => acc + (u.groups || []).flat().length, 0)
  const hasNotes = units.some(([, u]) => Array.isArray(u.notes) ? u.notes.length > 0 : !!u.notes)

  return (
    <div className="res-subj-card" style={gold ? { borderColor: 'rgba(245,158,11,0.3)' } : undefined}>
      <div className="res-subj-header" onClick={() => setOpen(v => !v)}>
        <div className="res-subj-left">
          <SubjectIcon code={subj.code} name={subj.name} size={32} />
          <span className="res-subj-code" style={gold ? { color: '#f59e0b' } : undefined}>{subj.code}</span>
          <span className="res-subj-name">{subj.name}</span>
        </div>
        <div className="res-subj-meta">
          {gold && subj.sem && (
            <span className="res-badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '0.65rem' }}>
              {subj.sem}
            </span>
          )}
          {units.length > 0 && <span className="res-badge">{units.length} units</span>}
          {totalVideos > 0 && (
            <span className="res-badge" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
              {totalVideos} videos
            </span>
          )}
          {hasNotes && (
            <span className="res-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>📄 Notes</span>
          )}
          {fullNotes && (
            <a href={fullNotes} target="_blank" rel="noopener noreferrer"
               className="res-badge" onClick={e => e.stopPropagation()}
               style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', textDecoration: 'none' }}>
              📚 Full Notes
            </a>
          )}
          {pyq && (
            <a href={pyq} target="_blank" rel="noopener noreferrer"
               className="res-badge" onClick={e => e.stopPropagation()}
               style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', textDecoration: 'none' }}>
              📝 PYQ
            </a>
          )}
          {!vd && !pyq && (
            <span className="res-badge" style={{ background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>Coming Soon</span>
          )}
          <span className="res-subj-arrow">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (vd || pyq || fullNotes) && (
        <div className="res-subj-body">
          {(pyq || fullNotes) && (
            <div className="res-videos-row" style={{ marginBottom: '0.8rem' }}>
              {fullNotes && <NotesCard url={fullNotes} label="Full Notes" subjectTopic={subj.name} />}
              {pyq && <PyqCard url={pyq} subjectTopic={subj.name} />}
            </div>
          )}
          {units.map(([unitNum, unitData]) => (
            <UnitRow key={unitNum} unitNum={unitNum} unitData={unitData} subjectTopic={subj.name} />
          ))}
        </div>
      )}
    </div>
  )
}

// Elective slot (Dept. Elective-I/II/III/IV, Open Elective-I/II, etc.) shown
// inline in its semester tab. Instead of listing every possible option as its
// own card, the student picks the one they're actually enrolled in from a
// dropdown. Whatever data exists for that subject — unit videos, PYQ — is
// shown. (No "Full Notes" quick-link here — per-unit notes still show inside
// each unit row.) If a given option has no data yet, we say so instead of
// silently showing nothing.
function ElectiveSubjectCard({ subj }) {
  const [selected, setSelected] = useState('')
  const selectedCode = selected ? selected.split(' - ')[0].trim() : ''
  const selectedName = selected ? selected.split(' - ').slice(1).join(' - ') : ''
  const vd = selectedCode ? getVideoData(selectedCode) : null
  const pyq = selectedCode ? getPYQ(selectedCode) : null
  const units = vd ? Object.entries(vd) : []

  return (
    <div className="res-subj-card">
      <div className="res-subj-header" style={{ cursor: 'default' }}>
        <div className="res-subj-left">
          <SubjectIcon code={subj.code} name={subj.name} size={32} />
          <span className="res-subj-code" style={{ color: '#f59e0b' }}>{subj.code}</span>
          <span className="res-subj-name">{subj.name}</span>
        </div>
      </div>
      <div style={{ padding: '0 1rem 1rem' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          aria-label={`${subj.name} - Select elective subject`}
          style={{
            width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none',
          }}
        >
          <option value="">— Select your subject —</option>
          {subj.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {selected && (
          <div style={{ marginTop: '0.7rem' }}>
            <span className="res-subj-name" style={{ fontSize: '0.85rem' }}>{selectedName}</span>
            {(vd || pyq) ? (
              <>
                {pyq && (
                  <div className="res-videos-row" style={{ marginTop: '0.6rem' }}>
                    <PyqCard url={pyq} subjectTopic={selectedName} />
                  </div>
                )}
                {units.map(([unitNum, unitData]) => (
                  <UnitRow key={unitNum} unitNum={unitNum} unitData={unitData} subjectTopic={selectedName} />
                ))}
              </>
            ) : (
              <div style={{ marginTop: '0.5rem' }}>
                <span className="res-badge" style={{ background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>Coming Soon</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ResourcesPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const { user } = useAuthUser()
  const logout = useLogout()
  const [activeSem, setActiveSem] = useState(0)
  const sidebarToggle = useSidebarToggle()
  const [search, setSearch] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const contentVersion = useLiveContentVersion()

  const displayName = user?.name || 'Student'
  const initial = displayName[0]?.toUpperCase() || 'U'

  const currentSem = SEMESTERS[activeSem]
  const isElectiveTab = activeSem === 8
  const isSearching = search.trim().length > 0

  const filteredSubjects = useMemo(() => {
    return currentSem ? getSwappedSubjects(currentSem, activeSem, user?.group) : []
  }, [currentSem, activeSem, user, contentVersion])

  // Recomputed whenever live content replaces the bundled fallback data.
  const filteredElectives = useMemo(() => computeDeptElectiveSubjects(), [contentVersion])

  // Global search — every subject, every semester, batch-group resolved.
  const allSubjectsFlat = useMemo(
    () => buildAllSubjects(user?.group, filteredElectives),
    [user, filteredElectives]
  )
  const globalSearchResults = useMemo(() => {
    if (!isSearching) return []
    const q = search.toLowerCase()
    return allSubjectsFlat.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
  }, [isSearching, search, allSubjectsFlat])

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="resourcesPage">
      {/* Header */}
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div className="h-logo-text">Gradewallah</div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle Light/Dark Mode" />
          <button className="hdr-res-btn" onClick={() => navigate('/app')} title="Grades">📚 <span>Grades</span></button>
          <button
            className="hdr-res-btn"
            onClick={() => navigate('/internships')}
            title="Internships"
            style={{ borderColor: 'rgba(139,92,246,0.4)', color: '#a78bfa', background: 'rgba(139,92,246,0.1)' }}
          >
            💼 <span>Internships</span>
          </button>
          <button className="hdr-scan-btn" title="Scan Result Sheet" onClick={() => setScanOpen(true)}>📷 <span>Scan Result</span></button>
          <div className="user-badge">
            <div className="user-avatar">{initial}</div>
            <div className="user-name">
              {displayName}
              {user?.group && (
                <span
                  style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, marginLeft: 4,
                    ...(user.group === 'A'
                      ? { background: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)' }
                      : { background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }),
                  }}
                >
                  Group {user.group}
                </span>
              )}
            </div>
          </div>
          <button className="btn-logout hdr-logout-text" onClick={logout}><span>Sign Out</span></button>
        </div>
      </header>
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} />

      <div className="dash-layout">
      {/* Sidebar overlay */}
      <Sidebar
        activePath="/resources"
        navigate={navigate}
        open={sidebarToggle.open}
        mobileOpen={sidebarToggle.mobileOpen}
        closeMobile={sidebarToggle.closeMobile}
      />

      {/* Main content — uses res-body just like the original, NOT main-layout */}
      <div className="res-body">
        {/* Big centered global search bar — Google-style */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 1rem' }}>
          <div
            style={{
              width: '100%', maxWidth: 640, position: 'relative', display: 'flex', alignItems: 'center',
              background: 'var(--bg-card2)', border: `1.5px solid ${isSearching ? 'var(--violet)' : 'var(--border)'}`,
              borderRadius: 999, padding: '0.85rem 1.4rem', boxShadow: isSearching ? '0 4px 24px rgba(124,58,237,0.2)' : '0 2px 10px rgba(0,0,0,0.08)',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          >
            <span style={{ fontSize: '1.2rem', marginRight: '0.7rem', flexShrink: 0 }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search any subject — all semesters, both groups…"
              aria-label="Search any subject, all semesters, both groups"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: '1.05rem', minWidth: 0,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                title="Clear"
                aria-label="Clear search"
                style={{
                  background: 'var(--bg-card)', border: 'none', borderRadius: '50%', width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: '0.9rem', flexShrink: 0, marginLeft: '0.5rem',
                }}
              >✕</button>
            )}
          </div>
        </div>

        {/* Semester tabs */}
        <div className="res-tabs-wrap" style={isSearching ? { opacity: 0.45 } : undefined}>
          <div className="res-tabs">
            {SEMESTERS.map((sem, i) => (
              <button
                key={i}
                className={`res-sem-tab ${activeSem === i ? 'active' : ''}`}
                onClick={() => { setActiveSem(i); setSearch('') }}
              >
                {sem.label}
              </button>
            ))}
            <button
              className={`res-sem-tab ${activeSem === 8 ? 'active' : ''}`}
              onClick={() => { setActiveSem(8); setSearch('') }}
              style={{
                background: activeSem === 8
                  ? 'linear-gradient(135deg,rgba(245,158,11,0.25),rgba(239,68,68,0.2))'
                  : 'linear-gradient(135deg,rgba(245,158,11,0.1),rgba(239,68,68,0.1))',
                borderColor: '#f59e0b', color: '#f59e0b',
              }}
            >
              🎓 Dept. Electives
            </button>
          </div>
        </div>

        {/* Subject cards */}
        {isSearching ? (
          <>
            <div style={{ marginBottom: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem', letterSpacing: 1 }}>
              🔍 SEARCH RESULTS — {globalSearchResults.length} subject{globalSearchResults.length !== 1 ? 's' : ''} found across all semesters
            </div>
            {globalSearchResults.length === 0
              ? <div style={{ color: 'var(--text-dim)', padding: '2rem', textAlign: 'center' }}>No subjects match "{search}"</div>
              : globalSearchResults.map(subj => <AllSubjectCard key={subj.code + subj.semLabel} subj={subj} />)
            }
          </>
        ) : !isElectiveTab ? (
          filteredSubjects.length === 0
            ? <div style={{ color: 'var(--text-dim)', padding: '2rem', textAlign: 'center' }}>No subjects in this semester</div>
            : filteredSubjects.map((subj, i) => (
                <RevealOnScroll key={subj.code} delay={Math.min(i, 5) * 0.05}>
                  {subj.type === 'Elective' && subj.options
                    ? <ElectiveSubjectCard subj={subj} />
                    : <SubjectCard subj={subj} />}
                </RevealOnScroll>
              ))
        ) : (
          <>
            <div style={{ marginBottom: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem', letterSpacing: 1 }}>
              DEPARTMENTAL ELECTIVE SUBJECTS — {filteredElectives.length} available
            </div>
            {filteredElectives.length === 0
              ? <div style={{ color: 'var(--text-dim)', padding: '2rem', textAlign: 'center' }}>No electives available</div>
              : filteredElectives.map(subj => (
                  <SubjectCard key={subj.code} subj={{ code: subj.code, name: subj.name, sem: subj.sem }} gold vd={subj.vd} pyq={subj.pyq} />
                ))
            }
          </>
        )}
      </div>
      </div>
    </div>
  )
}
