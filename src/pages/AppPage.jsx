import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEMESTERS } from '../lib/gradesData'
import {
  getTotal, isFilled, getMaxMarks, getGrade, getGradeForInternalOnly,
  isBackEligible, getBackGrade, calcSGPA,
} from '../lib/gradesEngine'
import { useGrades } from '../lib/GradesContext'
import ScanModal from './components/ScanModal'
import RightPanel from './components/RightPanel'
import CgpaPictograph from './components/CgpaPictograph'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import { useSidebarToggle } from '../lib/useSidebarToggle'

const TYPE_BADGE = { Theory: 'badge-theory', Practical: 'badge-practical', Elective: 'badge-elective', Audit: 'badge-audit' }
const SEM_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

function SyncBadge({ status }) {
  if (status === 'idle') return null
  const map = {
    saving: { text: 'Saving…', color: 'var(--text-dim)' },
    saved: { text: 'Saved ✓', color: '#10b981' },
    error: { text: 'Sync failed — retrying', color: '#ef4444' },
  }
  const cfg = map[status] || map.saving
  return (
    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: cfg.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {cfg.text}
    </span>
  )
}

function SubjectCard({ si, ji, subj, entry, backVal, electiveVal, setMarks, setBackMark, setElective }) {
  const filled = isFilled(entry)
  const maxM = getMaxMarks(subj)
  const typeBadge = TYPE_BADGE[subj.type] || 'badge-theory'

  // ── Audit subject: single CA field, doesn't affect CGPA ──
  if (subj.audit) {
    const val = typeof entry === 'object' ? (entry.internal || '') : ''
    const grade = getGrade(entry, subj)
    return (
      <div className={`subject-card ${filled ? 'filled' : ''}`}>
        <div className="subj-top">
          <span className="subj-code">{subj.code}</span>
          <span className="subj-type-badge badge-audit">Audit</span>
        </div>
        <div className="subj-name">{subj.name}</div>
        <div className="subj-credits">Audit course — marks recorded but does not affect CGPA</div>
        <div className="marks-row">
          <input
            className="marks-input"
            type="number" min="0" max="100" step="0.5"
            placeholder="CA Marks (0–100)"
            aria-label={`${subj.name} - CA Marks out of 100`}
            value={val}
            onChange={(e) => setMarks(si, ji, 'internal', e.target.value)}
          />
          <div className={`grade-pill ${grade ? grade.cls : ''}`}>{grade ? grade.grade : '–'}</div>
        </div>
      </div>
    )
  }

  // ── Internal-only subjects (Project / Internship / Mini Project) ──
  if (subj.internalOnly) {
    const isSplit = subj.code === 'BCS851' // Project-II: internal/100 + external/350
    const grade = getGradeForInternalOnly(entry, subj)
    const total = getTotal(entry)
    const max = isSplit ? maxM.internal + maxM.external : maxM.internal
    return (
      <div className={`subject-card ${filled ? 'filled' : ''}`}>
        <div className="subj-top">
          <span className="subj-code">{subj.code}</span>
          <span className="subj-type-badge badge-practical">Practical</span>
        </div>
        <div className="subj-name">{subj.name}</div>
        <div className="subj-credits">
          Credits: {subj.credits}{' '}
          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
            ({isSplit ? `Internal /${maxM.internal} + External /${maxM.external}` : `Internal only — out of ${maxM.internal}`})
          </span>
        </div>
        {isSplit ? (
          <div className="marks-split-row">
            <div className="marks-split-field">
              <label className="marks-split-label">Internal <span className="marks-max-hint">/ {maxM.internal}</span></label>
              <input className="marks-input marks-input-split" type="number" min="0" max={maxM.internal} step="0.5"
                placeholder={`0–${maxM.internal}`} value={entry?.internal || ''}
                aria-label={`${subj.name} - Internal marks out of ${maxM.internal}`}
                onChange={(e) => setMarks(si, ji, 'internal', e.target.value)} />
            </div>
            <div className="marks-split-field">
              <label className="marks-split-label">External <span className="marks-max-hint">/ {maxM.external}</span></label>
              <input className="marks-input marks-input-split" type="number" min="0" max={maxM.external} step="0.5"
                placeholder={`0–${maxM.external}`} value={entry?.external || ''}
                aria-label={`${subj.name} - External marks out of ${maxM.external}`}
                onChange={(e) => setMarks(si, ji, 'external', e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="marks-row">
            <input className="marks-input" type="number" min="0" max={maxM.internal} step="0.5"
              placeholder={`Marks (0–${maxM.internal})`} value={entry?.internal || ''}
              aria-label={`${subj.name} - Marks out of ${maxM.internal}`}
              onChange={(e) => setMarks(si, ji, 'internal', e.target.value)} />
          </div>
        )}
        <div className="marks-row" style={{ marginTop: 6 }}>
          <span className={`marks-total-disp ${total === null ? 'marks-total-empty' : ''}`}>
            {total === null ? `–/${max}` : `${total}/${max}`}
          </span>
          <div className={`grade-pill ${grade ? grade.cls : ''}`}>{grade ? grade.grade : '–'}</div>
        </div>
      </div>
    )
  }

  // ── Normal subjects: Theory / Elective / Practical — internal + external ──
  const grade = getGrade(entry, subj)
  const total = getTotal(entry)
  const eligible = isBackEligible(entry, subj)

  let backResult = null
  if (eligible && backVal !== undefined && backVal !== '') {
    const backGrade = getBackGrade(entry, subj, backVal)
    if (backGrade) {
      const deltaOrig = grade ? grade.points : 0
      const deltaBack = backGrade.points
      const deltaNode = deltaBack > deltaOrig
        ? <span style={{ color: '#10b981', fontSize: '0.68rem', fontWeight: 700 }}>▲ +{deltaBack - deltaOrig} pts</span>
        : deltaBack === deltaOrig
          ? <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>= same</span>
          : <span style={{ color: '#ef4444', fontSize: '0.68rem' }}>▼ {deltaBack - deltaOrig} pts</span>
      backResult = (
        <div className="back-result-wrap" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <div className={`grade-pill ${backGrade.cls}`} style={{ fontSize: '0.7rem', padding: '2px 7px' }}>{backGrade.grade}</div>
          {deltaNode}
          <span style={{ color: backGrade.grade === 'F' ? '#ef4444' : '#10b981', fontSize: '0.67rem', fontWeight: 700 }}>
            {backGrade.grade === 'F' ? '0 credits' : `${subj.credits}cr`}
          </span>
        </div>
      )
    }
  }

  const backMaxLabel = (subj.type === 'Theory' || subj.type === 'Elective')
    ? `/${maxM.external}`
    : `/${maxM.internal + maxM.external}`
  const backMax = (subj.type === 'Theory' || subj.type === 'Elective') ? maxM.external : (maxM.internal + maxM.external)

  return (
    <div className={`subject-card ${filled ? 'filled' : ''}`}>
      <div className="subj-top">
        <span className="subj-code">{subj.code}</span>
        <span className={`subj-type-badge ${typeBadge}`}>{subj.type}</span>
      </div>
      <div className="subj-name">{subj.name}</div>
      <div className="subj-credits">
        {grade && grade.grade === 'E#' ? (
          <>Credits: <span style={{ color: '#fb923c', fontWeight: 700 }}>{subj.credits}</span>{' '}
            <span style={{ color: '#fb923c' }}>(E# Grace Pass — 0 grade pts, {subj.credits}cr in GPA denominator)</span></>
        ) : grade && grade.grade === 'F' ? (
          <>Credits: {subj.credits} <span style={{ color: '#ef4444', fontWeight: 700 }}>(F — 0 pts, counts in GPA)</span></>
        ) : (
          <>Credits: {subj.credits}</>
        )}
      </div>

      {subj.options && (
        <select
          className="elective-select"
          value={electiveVal || ''}
          aria-label={`${subj.name} - Select elective subject`}
          onChange={(e) => setElective(si, ji, e.target.value)}
        >
          <option value="">Select Subject…</option>
          {subj.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}

      <div className="marks-split-row">
        <div className="marks-split-field">
          <label className="marks-split-label">Internal <span className="marks-max-hint">/ {maxM.internal}</span></label>
          <input className="marks-input marks-input-split" type="number" min="0" max={maxM.internal} step="0.5"
            placeholder={`0–${maxM.internal}`} value={entry?.internal || ''}
            aria-label={`${subj.name} - Internal marks out of ${maxM.internal}`}
            onChange={(e) => setMarks(si, ji, 'internal', e.target.value)} />
        </div>
        <div className="marks-split-field">
          <label className="marks-split-label">External <span className="marks-max-hint">/ {maxM.external}</span></label>
          <input className="marks-input marks-input-split" type="number" min="0" max={maxM.external} step="0.5"
            placeholder={`0–${maxM.external}`} value={entry?.external || ''}
            aria-label={`${subj.name} - External marks out of ${maxM.external}`}
            onChange={(e) => setMarks(si, ji, 'external', e.target.value)} />
        </div>
      </div>

      <div className="marks-row" style={{ marginTop: 6 }}>
        <span className={`marks-total-disp ${total === null ? 'marks-total-empty' : ''}`}>
          {total === null ? '–/100' : `${total}/100`}
          {grade && grade.grade === 'E#' && (
            <span style={{ fontSize: '0.65rem', color: '#fb923c', fontWeight: 700, verticalAlign: 'middle' }}> ★grace</span>
          )}
        </span>
        <div className={`grade-pill ${grade ? grade.cls : ''}`}>{grade ? grade.grade : '–'}</div>
      </div>

      {eligible && (
        <div className="back-paper-row">
          <div className="back-paper-label">
            <span className="back-paper-icon">📋</span>
            <span>Back Paper{' '}
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                (enter {(subj.type === 'Theory' || subj.type === 'Elective') ? 'back ext.' : 'new total'} {backMaxLabel})
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <input
              className="marks-input marks-input-back"
              type="number" min="0" max={backMax} step="0.5"
              placeholder={`0–${backMax}`}
              aria-label={`${subj.name} - Back paper marks out of ${backMax}`}
              value={backVal || ''}
              onChange={(e) => setBackMark(si, ji, e.target.value)}
            />
            {backResult}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AppPage() {
  const navigate = useNavigate()
  const grades = useGrades()
  const [activeSem, setActiveSem] = useState(grades.currentSemIndex)
  const [scanOpen, setScanOpen] = useState(false)
  const sidebarToggle = useSidebarToggle()

  const sem = SEMESTERS[activeSem]
  const sgpa = calcSGPA(activeSem, grades.marksData)
  const filledCount = sem.subjects.filter((subj, ji) => {
    if (subj.audit || subj.credits === 0) return false
    return isFilled(grades.marksData[activeSem]?.[ji])
  }).length
  const countable = sem.subjects.filter((s) => !s.audit && s.credits > 0).length

  return (
    <div className="page active" id="appPage">
      <div className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton open={sidebarToggle.open} mobileOpen={sidebarToggle.mobileOpen} toggle={sidebarToggle.toggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <img src="/images/img_3.png" width="34" height="34" alt="GW Logo" style={{ borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>Grades</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="hdr-scan-btn" title="Scan Result Sheet" onClick={() => setScanOpen(true)}>📷 <span>Scan Result</span></button>
          <SyncBadge status={grades.syncStatus} />
        </div>
      </div>

      <div className={`main-layout ${!sidebarToggle.open ? 'sidebar-collapsed' : ''}`}>
        <Sidebar
          activePath="/app"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
          activeSem={activeSem}
          onSemChange={setActiveSem}
        />
        <main className="content-area" style={{ padding: '1.5rem clamp(1rem, 4vw, 2.5rem)' }}>
        <div className="res-tabs-wrap">
          <div className="res-tabs">
            {SEMESTERS.map((s, si) => (
              <button
                key={s.sem}
                className={`res-sem-tab ${si === activeSem ? 'active' : ''}`}
                onClick={() => setActiveSem(si)}
              >
                Semester {SEM_ROMAN[si]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, margin: '1.2rem 0' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            {filledCount}/{countable} subjects filled
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{
              position: 'relative', isolation: 'isolate', overflow: 'visible',
              background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '0.5rem 1rem', textAlign: 'right', minWidth: 110,
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.3 }}>SGPA — {sem.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.4, color: 'var(--cyan)', display: 'block' }}>
                {sgpa > 0 ? sgpa.toFixed(2) : '—'}
              </div>
            </div>
            <div style={{
              position: 'relative', isolation: 'isolate', overflow: 'visible',
              background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '0.5rem 1rem', textAlign: 'right', minWidth: 130,
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.3 }}>CGPA (completed sems)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.4, color: 'var(--purple)', display: 'block' }}>
                {grades.cgpa > 0 ? grades.cgpa.toFixed(2) : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="subject-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {sem.subjects.map((subj, ji) => (
            <SubjectCard
              key={subj.code}
              si={activeSem}
              ji={ji}
              subj={subj}
              entry={grades.marksData[activeSem]?.[ji]}
              backVal={grades.backData[activeSem]?.[ji]}
              electiveVal={grades.electiveChoices[activeSem]?.[ji]}
              setMarks={grades.setMarks}
              setBackMark={grades.setBackMark}
              setElective={grades.setElective}
            />
          ))}
        </div>
        </main>
        <RightPanel
          marksData={grades.marksData}
          backData={grades.backData}
          currentSemIndex={activeSem}
          semestersDone={grades.semestersDone}
          creditsEarned={grades.creditsEarned}
        />
      </div>

      <CgpaPictograph
        marksData={grades.marksData}
        backData={grades.backData}
        currentSemIndex={activeSem}
      />

      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  )
}
