import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEMESTERS } from '../lib/gradesData'
import { useGrades } from '../lib/GradesContext'
import { getTotal, getGrade } from '../lib/gradesEngine'
import { VIDEO_DATA } from '../lib/resourcesData'
import { getKB } from '../lib/subjectKB'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { useLiveContentVersion } from '../lib/LiveContentGate'

const VIDEO_COLORS = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']

// Fixed AKTU-style thresholds — cannot be changed by the user
function getThreshold(credits) {
  if (credits >= 4) return 70
  if (credits === 3) return 65
  if (credits === 2) return 60
  return 60
}

// Same fuzzy subject-code -> VIDEO_DATA matching used on the Resources page
function findVideoData(rawCode) {
  if (!rawCode) return null
  const parts = rawCode.replace(/\*/g, '').split('/').map(s => s.trim())
  for (const p of parts) {
    if (VIDEO_DATA[p]) return VIDEO_DATA[p]
    const noHyphen = p.replace(/-/g, '')
    if (VIDEO_DATA[noHyphen]) return VIDEO_DATA[noHyphen]
  }
  const norm = s => s.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  for (const p of parts) {
    const normP = norm(p)
    if (!normP) continue
    for (const key of Object.keys(VIDEO_DATA)) {
      const normKey = norm(key)
      if (normKey === normP || normKey.startsWith(normP) || normP.startsWith(normKey.slice(0, 5))) {
        return VIDEO_DATA[key]
      }
    }
  }
  return null
}

function UnitCard({ unitNum, unit, subjCode }) {
  const [open, setOpen] = useState(false)
  const vd = findVideoData(subjCode)
  const unitData = vd ? vd[String(unitNum)] : null
  const dispName = unitData?.unit_name || unit.title
  const groups = unitData?.groups || []
  const notes = unitData ? (Array.isArray(unitData.notes) ? unitData.notes : (unitData.notes ? [unitData.notes] : [])) : []
  const hasLinks = groups.length > 0 || notes.length > 0

  return (
    <div className={`unit-card ${open ? 'open' : ''}`}>
      <div className="unit-header" onClick={() => setOpen(v => !v)}>
        <div className="unit-left">
          <div className="unit-num">{unitNum}</div>
          <div>
            <div className="unit-title-text">{dispName}</div>
            <div className="unit-subtitle">{unit.short}</div>
          </div>
        </div>
        <span className="unit-arrow">▶</span>
      </div>
      <div className="unit-body">
        <div className="topic-list">
          {unit.topics.map((t, i) => (
            <div className="topic-item" key={i}><div className="topic-dot" /><span>{t}</span></div>
          ))}
        </div>
        {hasLinks ? (
          <div className="analyser-vid-row">
            {groups.map((grp, vi) => {
              const col = VIDEO_COLORS[vi % VIDEO_COLORS.length]
              if (grp.length === 1) {
                return (
                  <a key={vi} href={grp[0]} target="_blank" rel="noopener noreferrer"
                     className="analyser-vid-btn" style={{ borderColor: col, color: col }}>
                    ▶ Video {vi + 1}
                  </a>
                )
              }
              return grp.map((url, pi) => (
                <a key={`${vi}-${pi}`} href={url} target="_blank" rel="noopener noreferrer"
                   className="analyser-vid-btn" style={{ borderColor: col, color: col }}>
                  ▶ Video {vi + 1} Pt.{pi + 1}
                </a>
              ))
            })}
            {notes.map((nl, ni) => (
              <a key={`note-${ni}`} href={nl} target="_blank" rel="noopener noreferrer"
                 className="analyser-vid-btn" style={{ borderColor: '#10b981', color: '#10b981' }}>
                {notes.length > 1 ? `📄 Notes Pt.${ni + 1}` : '📄 Notes'}
              </a>
            ))}
          </div>
        ) : (
          <a className="unit-vid-btn"
             href={`https://www.youtube.com/results?search_query=${encodeURIComponent(unit.query)}`}
             target="_blank" rel="noopener noreferrer">
            ▶ Watch Videos
          </a>
        )}
      </div>
    </div>
  )
}

function WeakCard({ item }) {
  const { subj, sem, marks, thresh, gap, isBorder } = item
  const [tab, setTab] = useState('why')
  const kb = getKB(subj)
  const sc = isBorder ? '#f59e0b' : '#ef4444'
  const barPct = Math.max(4, Math.min(100, (marks / 100) * 100)).toFixed(1)
  const thPct = ((thresh / 100) * 100).toFixed(1)
  const grade = getGrade(marks, subj)
  const displayCode = subj.code.replace(/[*]+/g, '').replace(/\/[A-Z0-9*]+/g, '').trim()

  return (
    <div className={`weak-card ${isBorder ? 'borderline' : ''}`}>
      {/* HEADER */}
      <div className="wc-top">
        <div className="wc-left">
          <div className="wc-code">{displayCode} &nbsp;·&nbsp; {sem.label} &nbsp;·&nbsp; {subj.type}</div>
          <div className="wc-name">{subj.name}</div>
          <div className="wc-sem">
            {subj.credits} Credits &nbsp;·&nbsp;{' '}
            <span style={{ color: sc }}>
              {isBorder ? `⚠️ Borderline — only +${gap} above threshold` : `🔴 Below threshold by ${Math.abs(gap)} marks`}
            </span>
          </div>
        </div>
        <div className="wc-marks-block">
          <div className="wc-mark-pill"><div className="mpl">Your Marks</div><div className={`mpv ${isBorder ? 'border' : 'low'}`}>{marks}</div></div>
          <div className="wc-mark-pill"><div className="mpl">Min Required</div><div className="mpv need">{thresh}</div></div>
          <div className="wc-mark-pill"><div className="mpl">Gap</div><div className={`mpv ${isBorder ? 'border' : 'low'}`}>{gap > 0 ? '+' : ''}{gap}</div></div>
          {grade && <div className="wc-mark-pill"><div className="mpl">Grade</div><div className="mpv" style={{ color: 'var(--purple)' }}>{grade.grade}</div></div>}
        </div>
      </div>

      {/* MARKS BAR */}
      <div style={{ padding: '0 1.8rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 4 }}>
          <span>0</span><span style={{ color: sc }}>Min: {thresh}</span><span>100</span>
        </div>
        <div className="wc-gap-bar" style={{ position: 'relative' }}>
          <div className="wc-gap-fill" style={{ width: `${barPct}%`, background: `linear-gradient(90deg,${sc},${sc}77)` }} />
          <div style={{ position: 'absolute', left: `${thPct}%`, top: -2, width: 2, height: 12, background: 'var(--cyan)', borderRadius: 1 }} />
        </div>
      </div>

      {/* MENU */}
      <div className="wc-menu-row">
        <button className={`wc-menu-btn ${tab === 'why' ? 'active' : ''}`} onClick={() => setTab('why')}>🎯 Why Important</button>
        <button className={`wc-menu-btn ${tab === 'units' ? 'active' : ''}`} onClick={() => setTab('units')}>📚 Unit-wise Topics</button>
        <button className={`wc-menu-btn ${tab === 'tips' ? 'active' : ''}`} onClick={() => setTab('tips')}>💡 Study Tips</button>
      </div>

      <div className="wc-panel-body">
        {tab === 'why' && (
          <div className="wc-panel active">
            <p className="why-intro">{kb.importance}</p>
            <div className="why-box">
              <div className="why-box-title">Why This Subject Matters For Your Career</div>
              <ul className="why-list">
                {kb.whyMatters.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 10, padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#ef4444', letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>📊 YOUR SITUATION</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                You scored <strong style={{ color: sc }}>{marks}/100</strong> in <strong style={{ color: 'var(--text)' }}>{subj.name}</strong>.
                {' '}Minimum expected for a {subj.credits}-credit subject is <strong style={{ color: 'var(--cyan)' }}>{thresh}</strong>.
                {' '}You need <strong style={{ color: '#10b981' }}>{Math.max(0, thresh - marks)} more marks</strong> to reach the threshold.
                {' '}Click <strong style={{ color: 'var(--cyan)' }}>📚 Unit-wise Topics</strong> to see exactly what to study! 👉
              </div>
            </div>
          </div>
        )}

        {tab === 'units' && (
          <div className="wc-panel active">
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '1rem', letterSpacing: '0.3px' }}>
              Click any unit to expand topics. Click <strong style={{ color: '#f87171' }}>▶ Watch Videos</strong> to open YouTube for that unit.
            </div>
            <div className="units-grid">
              {kb.units.map((u, ui) => (
                <UnitCard key={ui} unitNum={ui + 1} unit={u} subjCode={subj.code} />
              ))}
            </div>
          </div>
        )}

        {tab === 'tips' && (
          <div className="wc-panel active">
            <div className="tips-grid">
              {kb.tips.map((t, i) => (
                <div className="tip-row" key={i}>
                  <div className="tip-num">{i + 1}</div>
                  <div className="tip-txt"><strong>{t.h}:</strong> {t.d}</div>
                </div>
              ))}
            </div>
            <div className="target-box-new">
              <div className="tbn-title">🎯 YOUR PERSONAL TARGET</div>
              <div className="tbn-text">
                Current Score: <strong style={{ color: sc }}>{marks}</strong> &nbsp;→&nbsp;
                Minimum Required: <strong style={{ color: 'var(--cyan)' }}>{thresh}</strong> &nbsp;→&nbsp;
                Ideal Target: <strong style={{ color: '#10b981' }}>{Math.min(100, thresh + 15)}</strong><br />
                <span style={{ fontSize: '0.82rem' }}>Focus on 2–3 key units from the <strong>📚 Unit-wise Topics</strong> tab. That alone can close this gap.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AnalyserPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()
  const { marksData, electiveChoices } = useGrades()
  const contentVersion = useLiveContentVersion()

  const analysis = useMemo(() => {
    const weak = [], border = []
    let strongCount = 0
    let cgpaGain = 0

    const totalCr = SEMESTERS.reduce(
      (a, sem) => a + sem.subjects.reduce((b, s) => b + (s.audit ? 0 : s.credits), 0), 0
    )

    SEMESTERS.forEach((sem, si) => {
      sem.subjects.forEach((subj, ji) => {
        if (subj.audit || subj.credits === 0) return
        const entry = marksData[si]?.[ji]
        const m = getTotal(entry)
        if (m === null || m === undefined || isNaN(m)) return

        const thresh = getThreshold(subj.credits)
        const gap = m - thresh

        // Resolve actual subject name/code for slash-type & elective subjects
        let resolvedSubj = { ...subj }
        if (subj.code && subj.code.includes('/') && !subj.options) {
          const chosenName = electiveChoices[si]?.[ji]
          const codes = subj.code.split('/').map(c => c.trim())
          const names = subj.name.split('/').map(n => n.trim())
          if (chosenName) {
            const choiceIdx = names.findIndex(n => chosenName.includes(n) || n.includes(chosenName.split(' ')[0]))
            resolvedSubj = {
              ...subj,
              name: choiceIdx >= 0 ? names[choiceIdx] : names[0],
              code: choiceIdx >= 0 ? codes[choiceIdx] : codes[0],
            }
          } else {
            resolvedSubj = { ...subj, name: names[0], code: codes[0] }
          }
        } else if (subj.options) {
          const chosen = electiveChoices[si]?.[ji]
          if (chosen) {
            const parts = chosen.split(' - ')
            resolvedSubj = {
              ...subj,
              code: parts[0] ? parts[0].trim() : subj.code,
              name: parts[1] ? parts[1].trim() : chosen,
            }
          }
        }

        const item = { subj: resolvedSubj, sem, si, ji, marks: m, thresh, gap, isBorder: gap >= 0 }

        if (gap < 0) {
          weak.push(item)
          const cg = getGrade(m, subj), tg = getGrade(thresh + 1, subj)
          if (cg && tg) cgpaGain += (tg.points - cg.points) * subj.credits
        } else if (gap <= 5) {
          border.push(item)
        } else {
          strongCount++
        }
      })
    })

    weak.sort((a, b) => a.gap - b.gap)
    const all = [...weak, ...border]
    const gainPerCredit = totalCr > 0 ? cgpaGain / totalCr : 0

    return { all, weak, border, strongCount, gainPerCredit }
  }, [marksData, electiveChoices, contentVersion])

  const { all, weak, border, strongCount, gainPerCredit } = analysis

  let titleText
  if (all.length === 0) {
    titleText = strongCount > 0 ? '✅ All Subjects Above Threshold' : '📊 No Marks Entered Yet'
  } else {
    titleText = `📉 ${all.length} Subject${all.length > 1 ? 's' : ''} Need${all.length === 1 ? 's' : ''} Your Attention`
  }

  return (
    <div className="page active" id="analyserPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <img src="/images/img_3.png" width="34" height="34" alt="GW Logo" style={{ borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          <div>
            <div className="h-logo-text">RESULT ANALYSER</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              AKTU CSE · Weak Subject Detector
            </div>
          </div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
          <button
            className="btn-logout"
            onClick={() => navigate('/dashboard')}
            style={{ background: 'rgba(6,182,212,0.1)', borderColor: 'rgba(6,182,212,0.3)', color: 'var(--cyan)' }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="dash-layout">
      <Sidebar
        activePath="/analyser"
        navigate={navigate}
        open={sidebarToggle.open}
        mobileOpen={sidebarToggle.mobileOpen}
        closeMobile={sidebarToggle.closeMobile}
      />

      <div className="analyser-body">
        {/* THRESHOLD STRIP — FIXED */}
        <div className="analyser-settings-bar">
          <div className="asb-title">📌 Minimum Marks Required (Fixed · Cannot be Changed)</div>
          <div className="asb-inputs">
            <div className="asb-field asb-fixed"><span className="asb-credit-label">4-Credit</span><span className="asb-fixed-val">70</span><span className="asb-marks-label">min marks</span></div>
            <div className="asb-field asb-fixed"><span className="asb-credit-label">3-Credit</span><span className="asb-fixed-val">65</span><span className="asb-marks-label">min marks</span></div>
            <div className="asb-field asb-fixed"><span className="asb-credit-label">2-Credit</span><span className="asb-fixed-val">60</span><span className="asb-marks-label">min marks</span></div>
            <div className="asb-field asb-fixed"><span className="asb-credit-label">1-Credit</span><span className="asb-fixed-val">60</span><span className="asb-marks-label">min marks</span></div>
          </div>
        </div>

        {/* SUMMARY STRIP */}
        <div className="analyser-summary">
          <div className="as-card as-danger"><div className="as-num">{weak.length}</div><div className="as-lbl">Below Threshold</div></div>
          <div className="as-card as-warn"><div className="as-num">{border.length}</div><div className="as-lbl">Borderline (within +5)</div></div>
          <div className="as-card as-good"><div className="as-num">{strongCount}</div><div className="as-lbl">Strong Subjects</div></div>
          <div className="as-card as-info"><div className="as-num">+{gainPerCredit.toFixed(2)}</div><div className="as-lbl">Potential CGPA Gain</div></div>
        </div>

        {/* WEAK SUBJECTS */}
        <div className="analyser-section-title">{titleText}</div>
        <div className="analyser-cards">
          {all.length === 0 ? (
            strongCount > 0 ? (
              <div className="no-weak-msg">🎉 All entered subjects are above your minimum thresholds! Keep it up.</div>
            ) : (
              <div className="no-weak-msg" style={{ color: 'var(--text-muted)' }}>
                ⬅️ Please enter your marks in the calculator first, then come back here to see your analysis.
              </div>
            )
          ) : (
            all.map((item, idx) => <WeakCard key={`${item.si}-${item.ji}-${idx}`} item={item} />)
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
