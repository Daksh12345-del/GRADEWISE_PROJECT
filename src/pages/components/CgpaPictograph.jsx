import { SEMESTERS } from '../../lib/gradesData'
import {
  calcAllSGPAs, calcCGPAWithBack, calcSGPAWithBack,
  getGrade, getGradeNoGrace, getGradeForInternalOnly,
} from '../../lib/gradesEngine'

const BIG_CIRCUMFERENCE = 534 // matches r=85 SVG ring, same as original
const BAR_COLORS = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#22d3ee', '#a78bfa']
const JOURNEY_ICONS = ['🌱', '📖', '🔥', '💡', '🚀', '⚡', '🎯', '🏁']
const GRADE_COLORS = { 'A+': '#06b6d4', 'A': '#8b5cf6', 'B+': '#818cf8', 'B': '#10b981', 'C': '#f59e0b', 'D': '#f97316', 'E#': '#fb923c', 'F': '#ef4444' }
const GRADE_EMOJI = { 'A+': '🏆', 'A': '⭐', 'B+': '✅', 'B': '👍', 'C': '📚', 'D': '⚠️', 'E#': '🔶', 'F': '❌' }

function cgpaGradeLabel(cgpa) {
  if (cgpa === 0) return '–'
  if (cgpa >= 9) return 'A+'
  if (cgpa >= 8) return 'A'
  if (cgpa >= 7) return 'B+'
  if (cgpa >= 6) return 'B'
  if (cgpa >= 5) return 'C'
  if (cgpa >= 4) return 'D'
  return 'F'
}

// SVG line graph of SGPA across semesters — segments are colored green when
// trending up, red when trending down, cyan when flat, so the shape of
// improvement/decline reads at a glance (like a stock chart for grades).
function TrendLineChart({ values }) {
  const W = 700
  const H = 180
  const PAD_X = 36
  const PAD_TOP = 26
  const PAD_BOTTOM = 30
  const plotW = W - PAD_X * 2
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const n = values.length

  const xFor = (i) => PAD_X + (i / (n - 1)) * plotW
  const yFor = (v) => PAD_TOP + plotH - (Math.max(v, 0) / 10) * plotH

  const filledIdx = values.map((v, i) => ({ v, i })).filter((p) => p.v > 0)
  const points = filledIdx.map((p) => ({ x: xFor(p.i), y: yFor(p.v), v: p.v, i: p.i }))

  const segments = []
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1]
    // Only connect genuinely consecutive semesters — a gap (skipped sem) breaks the line
    if (b.i !== a.i + 1) continue
    const color = b.v > a.v ? '#10b981' : b.v < a.v ? '#ef4444' : '#06b6d4'
    segments.push({ a, b, color })
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
      {/* Gridlines at 2/4/6/8/10 */}
      {[0, 2, 4, 6, 8, 10].map((g) => (
        <line
          key={g}
          x1={PAD_X} x2={W - PAD_X} y1={yFor(g)} y2={yFor(g)}
          stroke="rgba(148,163,184,0.12)" strokeWidth="1"
        />
      ))}

      {/* X-axis semester labels */}
      {values.map((_, i) => (
        <text
          key={i} x={xFor(i)} y={H - 8} textAnchor="middle"
          fontFamily="Rajdhani,sans-serif" fontSize="11" fill="var(--text-dim)"
        >
          S{i + 1}
        </text>
      ))}

      {/* Trend segments, colored by direction */}
      {segments.map((s, k) => (
        <line
          key={k} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y}
          stroke={s.color} strokeWidth="3" strokeLinecap="round"
        />
      ))}

      {/* Data points + value labels */}
      {points.map((p) => (
        <g key={p.i}>
          <circle cx={p.x} cy={p.y} r="5" fill="var(--bg-card)" stroke="#06b6d4" strokeWidth="2.5" />
          <text
            x={p.x} y={p.y - 12} textAnchor="middle"
            fontFamily="Orbitron,monospace" fontSize="11" fontWeight="700" fill="var(--text)"
          >
            {p.v.toFixed(2)}
          </text>
        </g>
      ))}

      {points.length === 0 && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="Rajdhani,sans-serif" fontSize="13" fill="var(--text-dim)">
          Enter marks to see your SGPA trend
        </text>
      )}
    </svg>
  )
}

export default function CgpaPictograph({ marksData, backData, currentSemIndex }) {
  // Per-semester SGPA, preferring back-aware value where it improves the result
  const allSGPAs = calcAllSGPAs(marksData).map((base, si) => {
    const { sgpa: withBack, hasAnyBack } = calcSGPAWithBack(si, marksData, backData)
    return hasAnyBack && withBack > base ? withBack : base
  })

  const { cgpa } = calcCGPAWithBack(marksData, backData)
  const filledSems = allSGPAs.filter((s) => s > 0)

  const pct = cgpa / 10
  const gaugeOffset = BIG_CIRCUMFERENCE - pct * BIG_CIRCUMFERENCE
  const cgpaGrade = cgpaGradeLabel(cgpa)

  let best = null, bestIdx = -1, trend = null
  if (filledSems.length > 0) {
    best = Math.max(...filledSems)
    bestIdx = allSGPAs.indexOf(best)
    if (filledSems.length >= 2) {
      trend = filledSems[filledSems.length - 1] - filledSems[filledSems.length - 2]
    }
  }

  // Grade distribution across all entered (non-audit) subjects
  const gradeCounts = {}
  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      if (subj.audit) return
      const entry = marksData[si]?.[ji]
      const backExt = backData[si]?.[ji]
      const backNum = parseFloat(backExt)
      let g
      if (!isNaN(backNum) && backExt !== '' && (subj.type === 'Theory' || subj.type === 'Elective')) {
        const origGrade = getGrade(entry, subj)
        const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#')
        if (origIsFailOrGrace) {
          const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN
          const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) }
          g = getGradeNoGrace(backEntry)
        } else {
          g = origGrade
        }
      } else if (subj.internalOnly) {
        g = getGradeForInternalOnly(entry, subj)
      } else {
        g = getGrade(entry, subj)
      }
      if (g) gradeCounts[g.grade] = (gradeCounts[g.grade] || 0) + 1
    })
  })
  const gradeEntries = Object.entries(gradeCounts).filter(([, cnt]) => cnt > 0)

  return (
    <div className="cgpa-pictograph-section">
      <div className="picto-header">
        <div className="picto-title">CGPA VISUAL REPORT</div>
        <div className="picto-sub">Semester-wise Academic Performance Overview</div>
      </div>

      <div className="picto-cgpa-main">
        <div className="picto-cgpa-ring-wrap">
          <svg viewBox="0 0 200 200" width="200" height="200">
            <defs>
              <linearGradient id="bigGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(6,182,212,0.08)" strokeWidth="14" />
            <circle
              cx="100" cy="100" r="85" fill="none" stroke="url(#bigGaugeGrad)"
              strokeWidth="14" strokeLinecap="round"
              strokeDasharray={BIG_CIRCUMFERENCE} strokeDashoffset={gaugeOffset}
              transform="rotate(-90 100 100)"
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
            <text x="100" y="90" textAnchor="middle" fill="#06b6d4" fontFamily="Orbitron,monospace" fontSize="32" fontWeight="900">{cgpa.toFixed(2)}</text>
            <text x="100" y="112" textAnchor="middle" fill="#64748b" fontFamily="Rajdhani,sans-serif" fontSize="13" letterSpacing="3">CGPA</text>
            <text x="100" y="132" textAnchor="middle" fill="#94a3b8" fontFamily="Rajdhani,sans-serif" fontSize="11">{cgpaGrade}</text>
          </svg>
        </div>

        <div className="picto-cgpa-stats">
          <div className="picto-stat-card">
            <div className="ps-label">Best Semester</div>
            <div className="ps-val">{best !== null ? best.toFixed(2) : '–'}</div>
            <div className="ps-sub">{bestIdx >= 0 ? `Semester ${bestIdx + 1}` : '–'}</div>
          </div>
          <div className="picto-stat-card">
            <div className="ps-label">Trend</div>
            <div className="ps-val" style={trend !== null ? { color: trend >= 0 ? '#10b981' : '#ef4444' } : undefined}>
              {trend !== null ? `${trend >= 0 ? '↑ ' : '↓ '}${Math.abs(trend).toFixed(2)}` : '–'}
            </div>
            <div className="ps-sub">{trend !== null ? (trend >= 0 ? 'Improving' : 'Dropped') : '–'}</div>
          </div>
          <div className="picto-stat-card">
            <div className="ps-label">Sems Done</div>
            <div className="ps-val">{filledSems.length}/8</div>
            <div className="ps-sub">semesters</div>
          </div>
        </div>
      </div>

      <div className="picto-bars-wrap">
        <div className="picto-bars-title">Semester-wise SGPA Bar Chart</div>
        <div className="picto-bars">
          {allSGPAs.map((s, i) => {
            const h = s > 0 ? Math.max((s / 10) * 140, 6) : 4
            const col = s > 0 ? BAR_COLORS[i] : 'rgba(100,116,139,0.2)'
            return (
              <div className="picto-bar-col" key={i}>
                <div className="picto-bar-val">{s > 0 ? s.toFixed(1) : ''}</div>
                <div
                  className="picto-bar"
                  style={{ height: `${h}px`, background: `linear-gradient(180deg, ${col}, ${col}88)` }}
                  title={`Sem ${i + 1}: ${s > 0 ? s.toFixed(2) : 'N/A'}`}
                />
              </div>
            )
          })}
        </div>
        <div className="picto-bars-xaxis">
          {SEMESTERS.map((s, i) => <span key={i}>Sem {i + 1}</span>)}
        </div>
      </div>

      <div className="picto-bars-wrap">
        <div className="picto-bars-title">Semester SGPA Trend</div>
        <TrendLineChart values={allSGPAs} />
      </div>

      <div className="picto-icons-section">
        <div className="picto-bars-title">Grade Distribution (All Subjects)</div>
        <div className="picto-icons-grid">
          {gradeEntries.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '1rem' }}>
              Enter marks to see grade distribution
            </div>
          ) : (
            gradeEntries.map(([grade, cnt]) => {
              const color = GRADE_COLORS[grade] || '#64748b'
              const dotCount = Math.min(cnt, 12)
              return (
                <div className="picto-grade-block" key={grade}>
                  <div className="pgb-grade" style={{ color }}>{GRADE_EMOJI[grade] || ''} {grade}</div>
                  <div className="pgb-icons">
                    {Array.from({ length: dotCount }).map((_, i) => (
                      <div className="pgb-dot" style={{ background: color }} key={i} />
                    ))}
                  </div>
                  <div className="pgb-count">{cnt}</div>
                  <div className="pgb-label">subjects</div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="picto-stars-section">
        <div className="picto-bars-title">Academic Journey — Semester Progress</div>
        <div className="picto-stars-row">
          {SEMESTERS.map((sem, i) => {
            const s = allSGPAs[i]
            const isDone = s > 0
            const isActive = i === currentSemIndex
            const g = isDone ? (s >= 9 ? 'A+' : s >= 8 ? 'A' : s >= 7 ? 'B+' : s >= 6 ? 'B' : s >= 5 ? 'C' : 'F') : '–'
            return (
              <div className={`journey-card ${isDone ? 'done' : ''} ${isActive ? 'active-sem' : ''}`} key={i}>
                <div className="jc-sem">SEM {i + 1}</div>
                <div className="jc-icon">{JOURNEY_ICONS[i]}</div>
                <div className="jc-sgpa">{isDone ? s.toFixed(2) : '–'}</div>
                <div className="jc-grade">{g}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
