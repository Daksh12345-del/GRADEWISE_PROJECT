import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEMESTERS, GRADING } from '../../lib/gradesData'
import { calcSGPA, calcAllSGPAs, calcCGPAWithBack, calcSGPAWithBack, isSemComplete, getSemCredits } from '../../lib/gradesEngine'
import { useAuthUser } from '../../lib/useAuthUser'
import { generateAndOpenReport } from '../../lib/exportReport'
import { useLiveContentVersion } from '../../lib/LiveContentGate'

const CIRCUMFERENCE = 232.5 // matches r=37 SVG ring, same as original

function generateInsights(sgpa, cgpa, allSGPAs) {
  const insights = []
  const filledSems = allSGPAs.filter((s) => s > 0).length

  if (filledSems === 0) {
    return [{ color: '#64748b', msg: 'Enter marks to see your performance insights…' }]
  }

  if (cgpa >= 9) insights.push({ color: '#06b6d4', msg: '🏆 Outstanding performer! You are on track for distinction.' })
  else if (cgpa >= 8) insights.push({ color: '#8b5cf6', msg: '⭐ Excellent! Maintain this pace for a great final CGPA.' })
  else if (cgpa >= 7) insights.push({ color: '#10b981', msg: '✅ Good standing. Target 80+ in remaining subjects to improve CGPA.' })
  else if (cgpa >= 6) insights.push({ color: '#f59e0b', msg: '⚠️ Average performance. Focus on core subjects for improvement.' })
  else insights.push({ color: '#ef4444', msg: '🚨 Below average. Please seek academic support.' })

  if (sgpa > 0 && sgpa < cgpa - 0.3) insights.push({ color: '#ef4444', msg: '📉 Current semester SGPA is lower than your CGPA. Pick up the pace!' })
  if (sgpa > 0 && sgpa > cgpa + 0.3) insights.push({ color: '#10b981', msg: '📈 Current semester SGPA is higher than average — great improvement!' })

  if (filledSems === 8) insights.push({ color: '#06b6d4', msg: `🎓 All 8 semesters complete! Final CGPA: ${cgpa.toFixed(2)}` })

  return insights
}

const GRADING_CHIPS = [
  { cls: 'g-o', letter: 'A+', range: '90–100', pts: 10 },
  { cls: 'g-a', letter: 'A', range: '80–89', pts: 9 },
  { cls: 'g-bp', letter: 'B+', range: '70–79', pts: 8 },
  { cls: 'g-b', letter: 'B', range: '60–69', pts: 7 },
  { cls: 'g-c', letter: 'C', range: '50–59', pts: 6 },
  { cls: 'g-d', letter: 'D', range: '40–49', pts: 5 },
  { cls: 'g-e', letter: 'E#', range: 'Grace', pts: 0 },
  { cls: 'g-f', letter: 'F', range: '<40', pts: 0 },
]

function rankFor(cgpa) {
  if (cgpa === 0) return { label: '–', color: 'var(--text-dim)' }
  if (cgpa >= 9.5) return { label: 'S+', color: '#06b6d4' }
  if (cgpa >= 9.0) return { label: 'S', color: '#06b6d4' }
  if (cgpa >= 8.5) return { label: 'A+', color: '#8b5cf6' }
  if (cgpa >= 8.0) return { label: 'A', color: '#8b5cf6' }
  if (cgpa >= 7.0) return { label: 'B+', color: '#10b981' }
  if (cgpa >= 6.0) return { label: 'B', color: '#f59e0b' }
  return { label: 'C', color: '#ef4444' }
}

function TargetPlanner({ marksData, backData, semestersDone, creditsEarned, currentCGPA }) {
  const [target, setTarget] = useState('')

  const result = useMemo(() => {
    const raw = parseFloat(target)
    if (isNaN(raw) || raw < 0 || raw > 10 || target === '') return null
    const targetCGPA = Math.min(10, Math.max(0, raw))

    const totalSems = SEMESTERS.length
    const remainingSems = totalSems - semestersDone
    const completedCredits = creditsEarned
    const completedPoints = currentCGPA * completedCredits

    if (remainingSems <= 0) {
      const achieved = currentCGPA >= targetCGPA
      return {
        cls: achieved ? 'achievable' : 'impossible',
        icon: achieved ? '🏆' : '❌',
        needed: 'Done',
        sems: '',
        msg: achieved
          ? `🎓 All semesters complete! Target achieved with CGPA ${currentCGPA.toFixed(2)}.`
          : `🎓 All semesters complete. Final CGPA is ${currentCGPA.toFixed(2)} — target not reached.`,
      }
    }

    if (semestersDone === 0) {
      return {
        cls: 'achievable',
        icon: '🎯',
        needed: targetCGPA.toFixed(2),
        sems: 'Across all 8 semesters',
        msg: `Maintain an SGPA of ${targetCGPA.toFixed(2)} every semester to reach CGPA ${targetCGPA.toFixed(2)}.`,
      }
    }

    const avgCreditsPerSem = completedCredits / semestersDone
    const remainingCredits = avgCreditsPerSem * remainingSems
    const totalCreditsEst = completedCredits + remainingCredits
    const neededPoints = targetCGPA * totalCreditsEst - completedPoints
    const requiredSGPA = neededPoints / remainingCredits

    const needed = requiredSGPA > 10 ? '> 10 ✗' : requiredSGPA < 0 ? '✓ Done' : requiredSGPA.toFixed(2)
    const sems = `Based on ${semestersDone} completed sem${semestersDone > 1 ? 's' : ''} · ${remainingSems} remaining`

    if (requiredSGPA > 10) {
      return { cls: 'impossible', icon: '❌', needed, sems, msg: `Not achievable. Even a perfect 10 in all remaining ${remainingSems} semester${remainingSems > 1 ? 's' : ''} won't reach ${targetCGPA.toFixed(2)}.` }
    }
    if (requiredSGPA < 0) {
      return { cls: 'already', icon: '🏆', needed: '✓ Already', sems, msg: `Your current CGPA (${currentCGPA.toFixed(2)}) already exceeds your target of ${targetCGPA.toFixed(2)}. Keep it up!` }
    }
    if (requiredSGPA > 9.5) {
      return { cls: 'tough', icon: '🔥', needed, sems, msg: `Very challenging! You'll need near-perfect scores every semester from here.` }
    }
    if (requiredSGPA > currentCGPA + 0.5) {
      return { cls: 'tough', icon: '⚡', needed, sems, msg: `Needs significant improvement from your current average of ${currentCGPA.toFixed(2)}.` }
    }
    return { cls: 'achievable', icon: '✅', needed, sems, msg: `Totally within reach! Stay consistent and you'll hit CGPA ${targetCGPA.toFixed(2)}.` }
  }, [target, semestersDone, creditsEarned, currentCGPA])

  return (
    <div className="panel-section planner-section" id="target-planner-panel">
      <div className="planner-title-row">
        <div className="planner-title-icon">🎯</div>
        <div className="planner-title-text">Target CGPA Planner</div>
      </div>
      <input
        type="number"
        className="target-planner-input"
        placeholder="Enter target CGPA (e.g. 9.00)"
        min="0" max="10" step="0.01"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      <div className={`target-result-box ${result ? `show ${result.cls}` : ''}`}>
        {result && (
          <>
            <div className="trb-top">
              <div className="trb-left">
                <div className="trb-needed-label">Required SGPA / sem</div>
                <div className="trb-needed-val">{result.needed}</div>
              </div>
              <div className="trb-right">
                <div className="trb-status-icon">{result.icon}</div>
                <div className="trb-sems-info">{result.sems}</div>
              </div>
            </div>
            <div className="trb-msg-bar">{result.msg}</div>
          </>
        )}
      </div>
    </div>
  )
}

// Lets the user type a hypothetical/expected SGPA for each semester that
// isn't complete yet (result not out, or exam not given), and shows what
// the final overall CGPA would come out to once all of those semesters
// actually finish — using each semester's real credit load, not an
// average. Completed semesters keep contributing their actual SGPA.
function FutureCgpaSimulator({ marksData, currentCGPA, creditsEarned }) {
  const remaining = SEMESTERS
    .map((sem, si) => ({ si, sem }))
    .filter(({ si }) => !isSemComplete(si, marksData))

  const [guesses, setGuesses] = useState({}) // { [si]: '9.00' }

  function setGuess(si, val) {
    setGuesses((prev) => ({ ...prev, [si]: val }))
  }

  const completedPoints = currentCGPA * creditsEarned

  const result = useMemo(() => {
    if (remaining.length === 0) return null

    let points = completedPoints
    let credits = creditsEarned
    let filledCount = 0

    for (const { si } of remaining) {
      const raw = parseFloat(guesses[si])
      const semCredits = getSemCredits(si)
      if (!isNaN(raw) && raw >= 0 && raw <= 10) {
        points += raw * semCredits
        credits += semCredits
        filledCount++
      }
    }

    if (filledCount === 0) return null
    const finalCGPA = credits > 0 ? points / credits : 0
    return {
      finalCGPA,
      allFilled: filledCount === remaining.length,
    }
  }, [guesses, remaining, completedPoints, creditsEarned])

  if (remaining.length === 0) return null

  return (
    <div className="panel-section planner-section" id="future-cgpa-panel">
      <div className="planner-title-row">
        <div className="planner-title-icon">🔮</div>
        <div className="planner-title-text">Future CGPA Simulator</div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.7rem', lineHeight: 1.4 }}>
        Result not out yet, or haven't given the paper? Enter what SGPA you expect in each remaining semester and see your final CGPA.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        {remaining.map(({ si }) => (
          <div key={si} className="compact-group" style={{ marginBottom: 0 }}>
            <label className="compact-label" htmlFor={`future-sem-${si}`} style={{ fontSize: '0.68rem' }}>
              Sem {si + 1}
            </label>
            <input
              id={`future-sem-${si}`}
              type="number"
              className="target-planner-input"
              placeholder="e.g. 8.5"
              min="0" max="10" step="0.01"
              value={guesses[si] ?? ''}
              onChange={(e) => setGuess(si, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className={`target-result-box ${result ? 'show achievable' : ''}`}>
        {result && (
          <>
            <div className="trb-top">
              <div className="trb-left">
                <div className="trb-needed-label">Projected Final CGPA</div>
                <div className="trb-needed-val">{result.finalCGPA.toFixed(2)}</div>
              </div>
              <div className="trb-right">
                <div className="trb-status-icon">{result.allFilled ? '🎓' : '🔮'}</div>
                <div className="trb-sems-info">{result.allFilled ? 'All remaining sems filled' : 'Based on filled fields so far'}</div>
              </div>
            </div>
            <div className="trb-msg-bar">
              {result.allFilled
                ? `If you score exactly these SGPAs, your overall CGPA will be ${result.finalCGPA.toFixed(2)}.`
                : `Fill in every remaining semester above for the full 8-semester projection.`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function RightPanel({ marksData, backData, currentSemIndex, semestersDone, creditsEarned }) {
  const contentVersion = useLiveContentVersion()
  const navigate = useNavigate()
  const { user } = useAuthUser()
  const [exportBusy, setExportBusy] = useState(false)

  async function handleExport() {
    setExportBusy(true)
    try {
      generateAndOpenReport(marksData, backData, {
        name: user?.name,
        email: user?.email,
        college: user?.college,
        university: user?.university,
        roll: user?.roll,
      })
    } catch (e) {
      console.error('Export failed:', e)
      alert('Could not generate the report. Please try again.')
    } finally {
      setExportBusy(false)
    }
  }

  const sgpa = calcSGPA(currentSemIndex, marksData)
  const { sgpa: sgpaBack, hasAnyBack: semHasBack } = calcSGPAWithBack(currentSemIndex, marksData, backData)
  const displaySGPA = semHasBack && sgpaBack > sgpa ? sgpaBack : sgpa

  const { cgpa, hasAnyBack: globalHasBack } = calcCGPAWithBack(marksData, backData)
  const { cgpa: cgpaPlain } = useMemo(() => calcCGPAWithBack(marksData, {}), [marksData, contentVersion])
  const displayCGPA = globalHasBack && cgpa > cgpaPlain ? cgpa : cgpaPlain

  const pct = displaySGPA / 10
  const offset = CIRCUMFERENCE - pct * CIRCUMFERENCE
  const gradeForSGPA = displaySGPA === 0 ? '–' : (GRADING.find((g) => displaySGPA * 10 >= g.min) || GRADING[GRADING.length - 1]).grade
  const rank = rankFor(displayCGPA)

  const allSGPAs = calcAllSGPAs(marksData)
  const insights = generateInsights(displaySGPA, displayCGPA, allSGPAs)

  const [gradingOpen, setGradingOpen] = useState(false)
  const [insightOpen, setInsightOpen] = useState(false)

  return (
    <aside className="right-panel">
      <div className="rp-inner">

        <div className="panel-section">
          <div className="panel-title">Live SGPA</div>
          <div className="sgpa-gauge">
            <div className="gauge-ring">
              <svg viewBox="0 0 88 88" width="88" height="88">
                <defs>
                  <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <circle className="gauge-bg" cx="44" cy="44" r="37" />
                <circle
                  className="gauge-fill" cx="44" cy="44" r="37"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1)' }}
                />
              </svg>
              <div className="gauge-value">{displaySGPA.toFixed(2)}</div>
            </div>
            <div className="sgpa-right-info">
              <div className="sgpa-right-label">Semester GPA</div>
              <div className="sgpa-right-val">{displaySGPA.toFixed(2)}</div>
              <div className="gauge-grade">{gradeForSGPA}</div>
              {semHasBack && sgpaBack !== sgpa && (
                <div style={{ display: 'block', fontSize: '0.68rem', color: '#10b981', fontFamily: 'var(--font-body)', fontWeight: 700, marginTop: 3 }}>
                  ↑ orig: {sgpa.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-title">CGPA Overview</div>
          <div className="cgpa-hero">
            <div className="cgpa-hero-left">
              <div className="cgpa-num">{displayCGPA.toFixed(2)}</div>
              {globalHasBack && cgpa !== cgpaPlain && (
                <div style={{ display: 'block', fontSize: '0.65rem', color: '#10b981', fontFamily: 'var(--font-body)', fontWeight: 700, marginTop: 2 }}>
                  ↑ orig: {cgpaPlain.toFixed(2)}
                </div>
              )}
              <div className="cgpa-label">Cumulative GPA</div>
            </div>
            <div className="cgpa-hero-badge">
              <span className="cgpa-hero-badge-val" style={{ color: rank.color }}>{rank.label}</span>
              <span className="cgpa-hero-badge-lbl">Rank</span>
            </div>
          </div>
          <div className="sem-list">
            {allSGPAs.map((s, i) => {
              const complete = isSemComplete(i, marksData)
              const { sgpa: sBack, hasAnyBack } = calcSGPAWithBack(i, marksData, backData)
              const showBack = complete && hasAnyBack && sBack !== s
              const displayVal = showBack ? sBack : s
              const showVal = complete && displayVal > 0
              return (
                <div className="sem-item" key={i}>
                  <span className="sem-label">Sem {i + 1}</span>
                  <div className="sem-bar-wrap">
                    <div className="sem-bar" style={{ width: showVal ? `${(displayVal / 10) * 100}%` : '0%' }} />
                    {showBack && (
                      <div className="sem-bar sem-bar-back" style={{ width: `${(sBack / 10) * 100}%` }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <span className="sem-val">{showVal ? displayVal.toFixed(2) : '–'}</span>
                    {showBack && <span className="sem-val-back" title="Original SGPA before back">was {s.toFixed(2)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <TargetPlanner
          marksData={marksData}
          backData={backData}
          semestersDone={semestersDone}
          creditsEarned={creditsEarned}
          currentCGPA={displayCGPA}
        />

        <FutureCgpaSimulator
          marksData={marksData}
          currentCGPA={displayCGPA}
          creditsEarned={creditsEarned}
        />

        <div className="panel-section" style={{ padding: '0.85rem 1.1rem' }}>
          <div className="panel-toggle-row" onClick={() => setGradingOpen((v) => !v)} style={{ cursor: 'pointer' }}>
            <div className="panel-title" style={{ marginBottom: 0 }}>Grading System</div>
            <span className="panel-toggle-arrow">{gradingOpen ? '▲' : '▼'}</span>
          </div>
          {gradingOpen && (
            <div style={{ marginTop: '0.8rem' }}>
              <div className="grading-compact">
                {GRADING_CHIPS.map((g) => (
                  <div className={`grade-chip ${g.cls}`} key={g.letter}>
                    <span className="grade-chip-letter">{g.letter}</span>
                    <span className="grade-chip-range">{g.range}</span>
                    <span className="grade-chip-pts">{g.pts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel-section" style={{ padding: '0.85rem 1.1rem' }}>
          <div className="panel-toggle-row" onClick={() => setInsightOpen((v) => !v)} style={{ cursor: 'pointer' }}>
            <div className="panel-title" style={{ marginBottom: 0 }}>Performance Insight</div>
            <span className="panel-toggle-arrow">{insightOpen ? '▲' : '▼'}</span>
          </div>
          {insightOpen && (
            <div style={{ marginTop: '0.8rem' }}>
              <div className="insight-list">
                {insights.map((ins, i) => (
                  <div className="insight-item" key={i}>
                    <div className="insight-dot" style={{ background: ins.color }} />
                    {ins.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      <div className="rp-actions">
        <button className="btn-export" onClick={handleExport} disabled={exportBusy}>
          {exportBusy ? '⏳ Generating…' : '⬇ Export'}
        </button>
        <button className="btn-analyse" onClick={() => navigate('/analyser')}>🔍 Analyse</button>
      </div>
    </aside>
  )
}
