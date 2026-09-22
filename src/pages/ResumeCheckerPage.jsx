import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import { AnimatedNumber } from './components/motionKit'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { useAuthUser } from '../lib/useAuthUser'
import { analyzeResume, fetchMyResumeScore } from '../lib/api'

const HOW_IT_WORKS = [
  { icon: '📤', title: 'Upload', text: 'Drop in your resume as a PDF or DOCX — nothing is stored except the score itself.' },
  { icon: '🔎', title: 'Parse', text: 'We extract the raw text exactly the way a real ATS parser would read it.' },
  { icon: '🤖', title: 'AI Scoring', text: 'AI Career Coach scores it 0–100 across 5 categories and pulls out your real skills.' },
  { icon: '💼', title: 'Match', text: 'Your skills are matched live against all internships & placements on GradeWallah.' },
]

function scoreColor(score) {
  if (score >= 75) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

function ScoreRing({ score }) {
  const color = scoreColor(score)
  const r = 54
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <motion.circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} transform="rotate(-90 70 70)"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>
          <AnimatedNumber value={score} />
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: 1 }}>ATS SCORE</div>
      </div>
    </div>
  )
}

function BreakdownBar({ item }) {
  const pct = (item.score / item.max) * 100
  const color = scoreColor(pct)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }} title={item.desc}>{item.label}</span>
        <span style={{ color, fontWeight: 700 }}>{item.score}/{item.max}</span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: 'var(--bg-card-alt, rgba(148,163,184,0.15))', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: '100%', borderRadius: 5, background: color }}
        />
      </div>
    </div>
  )
}

function MatchedInternshipRow({ item }) {
  return (
    <div className="job-card" style={{ marginBottom: 10 }}>
      <div className="job-card-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="job-title" title={item.title}>{item.title}</div>
          <div className="job-company">{item.company} {item._type === 'placement' && '· Placement'}</div>
        </div>
        <span className="job-mode-badge" style={{ color: '#10b981', background: '#10b9811f' }}>
          🎯 {item.match_score}% match
        </span>
      </div>
      {Array.isArray(item.matched_skills) && item.matched_skills.length > 0 && (
        <div className="job-skills">
          {item.matched_skills.slice(0, 6).map((s, i) => <span key={i} className="job-skill-chip">{s}</span>)}
        </div>
      )}
      <div className="job-card-bottom">
        <span className="job-posted">📍 {item.location || 'Remote'}</span>
        {item.apply_url && (
          <a href={item.apply_url} target="_blank" rel="noopener noreferrer" className="job-apply-btn">
            Apply →
          </a>
        )}
      </div>
    </div>
  )
}

export default function ResumeCheckerPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()
  const { user } = useAuthUser()
  const fileInputRef = useRef(null)

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [loadingSaved, setLoadingSaved] = useState(true)

  // Show the last saved score immediately on load — the student shouldn't
  // have to re-upload just to see a result they already generated.
  useEffect(() => {
    if (!user?.id) { setLoadingSaved(false); return }
    fetchMyResumeScore(user.id)
      .then(saved => {
        if (saved) {
          setResult({
            ats_score: saved.ats_score,
            breakdown: saved.breakdown,
            skills: saved.skills,
            strengths: saved.strengths,
            improvements: saved.improvements,
            matched_internships: saved.matched_internships,
            resume_filename: saved.resume_filename,
          })
        }
      })
      .catch(() => { /* no saved score yet — fine, just show the upload zone */ })
      .finally(() => setLoadingSaved(false))
  }, [user?.id])

  function handleFile(f) {
    if (!f) return
    const okType = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.type)
    if (!okType) {
      setError('Only PDF or DOCX resumes are supported.')
      return
    }
    setFile(f)
    setError(null)
  }

  async function runAnalysis() {
    if (!file) { setError('Please upload your resume first.'); return }
    if (!user?.id) { setError('Please sign in first.'); return }
    setBusy(true)
    setError(null)
    try {
      const data = await analyzeResume(file, user.id)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  function resetUpload() {
    setFile(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="resumeCheckerPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>Resume Checker</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              ATS score + live internship matching
            </div>
          </div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar activePath="/resume-checker" navigate={navigate} {...sidebarToggle} />

        <div className="res-body" style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto', width: '100%' }}>
          {/* How it works */}
          <div className="dsa-card" style={{ borderColor: '#7c3aed33', marginBottom: 20 }}>
            <div className="dsa-card-head" style={{ color: 'var(--violet, #7c3aed)' }}>
              <span>ℹ️</span> How the Resume Checker works
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 6 }}>
              {HOW_IT_WORKS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.3rem' }}>{s.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{s.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upload zone */}
          <div className="dsa-card" style={{ borderColor: 'var(--border-bright)', marginBottom: 20 }}>
            <div className="dsa-card-head">
              <span>📄</span> Upload your resume
              {file && !busy && (
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {result?.resume_filename && !file ? `Last checked: ${result.resume_filename}` : ''}
                </span>
              )}
            </div>

            <div
              className={`scan-drop-zone ${dragOver ? 'drag-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            >
              <div className="scan-drop-icon">📄</div>
              <div className="scan-drop-text">
                <strong>Click to upload</strong> or drag & drop here<br />
                PDF or DOCX, max 5MB
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {file && (
              <div className="scan-preview-wrap show" style={{ display: 'flex' }}>
                <span style={{ fontSize: '1.2rem' }}>📄</span>
                <span className="scan-preview-name">{file.name}</span>
                <span className="scan-preview-remove" onClick={resetUpload} title="Remove">✕</span>
              </div>
            )}

            {error && <div className="dsa-error" style={{ marginTop: 10 }}>⚠️ {error}</div>}

            <button
              className="hdr-stats-btn"
              disabled={!file || busy}
              onClick={runAnalysis}
              style={{ marginTop: 14, width: '100%', justifyContent: 'center', opacity: (!file || busy) ? 0.6 : 1, cursor: (!file || busy) ? 'not-allowed' : 'pointer' }}
            >
              {busy ? (<><span className="ai-spinner" style={{ width: 14, height: 14 }} /> Analyzing…</>) : '🚀 Check my resume'}
            </button>
          </div>

          {/* Results */}
          {result && (
            <>
              <div className="dsa-card" style={{ borderColor: scoreColor(result.ats_score) + '44', marginBottom: 20 }}>
                <div className="dsa-card-head">
                  <span>📊</span> Your ATS Score
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center', padding: '8px 2px' }}>
                  <ScoreRing score={result.ats_score} />
                  <div style={{ flex: '1 1 280px', minWidth: 240 }}>
                    {(result.breakdown || []).map((b) => <BreakdownBar key={b.key} item={b} />)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div className="dsa-card" style={{ borderColor: '#10b98133' }}>
                  <div className="dsa-card-head" style={{ color: '#10b981' }}><span>✅</span> Strengths</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.7 }}>
                    {(result.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div className="dsa-card" style={{ borderColor: '#f59e0b33' }}>
                  <div className="dsa-card-head" style={{ color: '#f59e0b' }}><span>🛠️</span> Improve</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.7 }}>
                    {(result.improvements || []).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>

              <div className="dsa-card" style={{ borderColor: 'var(--border-bright)', marginBottom: 20 }}>
                <div className="dsa-card-head"><span>🧩</span> Skills detected</div>
                <div className="job-skills" style={{ marginTop: 4 }}>
                  {(result.skills || []).map((s, i) => <span key={i} className="job-skill-chip">{s}</span>)}
                  {(result.skills || []).length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No clear technical skills detected — add a dedicated Skills section.</span>
                  )}
                </div>
              </div>

              <div className="dsa-card" style={{ borderColor: 'var(--border-bright)' }}>
                <div className="dsa-card-head">
                  <span>💼</span> Matching internships &amp; placements
                  <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-dim)', marginLeft: 8 }}>
                    (live, matched against your detected skills)
                  </span>
                </div>
                {(result.matched_internships || []).length === 0 ? (
                  <div className="dsa-idle">
                    No strong matches right now — add more specific technical skills to your resume, or check back as new postings come in.
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    {result.matched_internships.map((item, i) => <MatchedInternshipRow key={i} item={item} />)}
                  </div>
                )}
              </div>
            </>
          )}

          {!result && !loadingSaved && (
            <div className="dsa-idle" style={{ textAlign: 'center', padding: '1rem' }}>
              Upload your resume above to get your ATS score and see which live internships you're a fit for.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
