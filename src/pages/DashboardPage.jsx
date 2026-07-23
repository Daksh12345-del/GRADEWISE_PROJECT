import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/useTheme'
import { useAuthUser, useLogout } from '../lib/useAuthUser'
import { useGrades } from '../lib/GradesContext'
import { fetchInternships, fetchPlacements } from '../lib/api'
import { SORTERS } from '../lib/jobStats'
import ScanModal from './components/ScanModal'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import { useSidebarToggle } from '../lib/useSidebarToggle'

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return d.toLocaleDateString()
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const { user, status } = useAuthUser()
  const logout = useLogout()
  const grades = useGrades()

  const sidebarToggle = useSidebarToggle()
  const [placements, setPlacements] = useState(null) // null = loading, [] = empty, [...] = data
  const [internships, setInternships] = useState(null) // null = loading, [] = empty, [...] = data
  const [scanOpen, setScanOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadPlacements() {
      try {
        const data = await fetchPlacements()
        if (cancelled) return
        setPlacements([...(data || [])].sort(SORTERS.newest).slice(0, 3))
      } catch (e) {
        console.error('Failed to load placements:', e)
        if (!cancelled) setPlacements([])
      }
    }
    loadPlacements()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadInternships() {
      try {
        const data = await fetchInternships()
        if (cancelled) return
        setInternships([...(data || [])].sort(SORTERS.newest).slice(0, 3))
      } catch (e) {
        console.error('Failed to load internships:', e)
        if (!cancelled) setInternships([])
      }
    }
    loadInternships()
    return () => { cancelled = true }
  }, [])

  if (status === 'checking') {
    return (
      <div className="page active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    )
  }
  if (!user) return null

  const displayName = user.name || 'Student'
  const initial = displayName[0]?.toUpperCase() || 'U'

  const displayCGPA = grades.cgpa > 0 ? grades.cgpa.toFixed(2) : '—'
  const displaySGPA = grades.sgpa > 0 ? grades.sgpa.toFixed(2) : '—'

  function formatSalary(v) {
    const n = Number(v) || 0
    if (n <= 0) return null
    return `≈ ₹${(n / 100000).toFixed(1)} LPA`
  }
  function formatStipend(v) {
    const n = Number(v) || 0
    if (n <= 0) return null
    return `₹${n.toLocaleString('en-IN')}/mo`
  }

  return (
    <div className="page active" id="dashboardPage">
      <div className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton open={sidebarToggle.open} mobileOpen={sidebarToggle.mobileOpen} toggle={sidebarToggle.toggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <img src="/images/img_3.png" width="34" height="34" alt="GW Logo" style={{ borderRadius: '50%', objectFit: 'cover' }} />
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
              {user.group && (
                <span
                  style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, marginLeft: 4,
                    ...(user.group === 'A'
                      ? { background: 'rgba(6,182,212,0.18)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.35)' }
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
      </div>

      <div className="dash-layout">
        {/* Sidebar */}
        <Sidebar
          activePath="/dashboard"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        {/* Dashboard Content */}
        <div className="dash-content">
          {/* Hero */}
          <div className="dash-hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="dash-greeting">{getGreeting()} 👋</div>
              <div className="dash-subtitle" style={{ marginTop: 6 }}>Track your progress. Own your journey.</div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase' }}>Current Semester</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.25)' }}>
                  {grades.currentSemBadge}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.62rem', color: '#64748b', letterSpacing: '2.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>CURRENT CGPA</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '3.8rem', fontWeight: 900, color: 'var(--cyan)', lineHeight: 1, letterSpacing: '-2px', textShadow: '0 0 40px rgba(6,182,212,0.3)' }}>
                {displayCGPA}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>out of 10.00</div>
            </div>
          </div>

          {/* Stats row */}
          <div className="dash-stats">
            <div className="dash-stat">
              <div className="dash-stat-lbl">My CGPA</div>
              <div className="dash-stat-val">{displayCGPA}</div>
              <div className="dash-stat-sub">Overall performance</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-lbl">This Semester</div>
              <div className="dash-stat-val purple">{displaySGPA}</div>
              <div className="dash-stat-sub">{grades.currentSemLabel}</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-lbl">My Progress</div>
              <div className="dash-stat-val green">{grades.semestersDone}</div>
              <div className="dash-stat-sub">Semesters done</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-lbl">Credits Earned</div>
              <div className="dash-stat-val yellow">{grades.creditsEarned}</div>
              <div className="dash-stat-sub">Toward degree</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="dash-actions-title">⚡ What do you want to do today?</div>
          <div className="dash-actions">
            <button className="dash-action-card" onClick={() => navigate('/app')} style={{ '--card-accent': 'linear-gradient(90deg, var(--cyan), var(--purple))' }}>
              <div className="dash-action-icon">📚</div>
              <div className="dash-action-name">📈 My Grades</div>
              <div className="dash-action-desc">Enter marks, see live SGPA & CGPA. Track every semester.</div>
              <span className="dash-action-arrow">→</span>
            </button>
            <button className="dash-action-card" onClick={() => navigate('/resources')} style={{ '--card-accent': 'linear-gradient(90deg, #10b981, #06b6d4)' }}>
              <div className="dash-action-icon">🎓</div>
              <div className="dash-action-name">📖 Study Resources</div>
              <div className="dash-action-desc">Unit-wise notes, videos & PYQs for every subject.</div>
              <span className="dash-action-arrow">→</span>
            </button>
            <button className="dash-action-card" onClick={() => navigate('/internships')} style={{ '--card-accent': 'linear-gradient(90deg, var(--purple), #ec4899)' }}>
              <div className="dash-action-icon">💼</div>
              <div className="dash-action-name">💼 Find Internships</div>
              <div className="dash-action-desc">AI-matched internships from Internshala, JSearch & Remotive.</div>
              <span className="dash-action-arrow">→</span>
            </button>
            <button className="dash-action-card" onClick={() => navigate('/placements')} style={{ '--card-accent': 'linear-gradient(90deg, var(--green), #06b6d4)' }}>
              <div className="dash-action-icon">🏢</div>
              <div className="dash-action-name">🏢 My Career</div>
              <div className="dash-action-desc">Campus & off-campus placement drives posted by Gradewallah team.</div>
              <span className="dash-action-arrow">→</span>
            </button>
            <button className="dash-action-card" onClick={() => navigate('/analyser')} style={{ '--card-accent': 'linear-gradient(90deg, var(--yellow), #f97316)' }}>
              <div className="dash-action-icon">🔍</div>
              <div className="dash-action-name">🔍 Analyse Performance</div>
              <div className="dash-action-desc">Find weak subjects, backlog risks &amp; how to improve CGPA.</div>
              <span className="dash-action-arrow">→</span>
            </button>
            <button className="dash-action-card" onClick={() => navigate('/dsa-tracker')} style={{ '--card-accent': 'linear-gradient(90deg, #06b6d4, #10b981)' }}>
              <div className="dash-action-icon">🧩</div>
              <div className="dash-action-name">🧩 DSA Tracker</div>
              <div className="dash-action-desc">Track LeetCode, Codeforces, CodeChef & GitHub stats in one place.</div>
              <span className="dash-action-arrow">→</span>
            </button>
          </div>

          {/* Semester progress */}
          <div className="dash-sem-strip-title">🗓️ My Academic Journey</div>
          <div className="dash-sem-strip">
            {grades.semesters.map((sem, i) => {
              const sgpa = grades.sgpaBySem[i] || 0
              const done = sgpa > 0
              const isActiveSem = i === grades.currentSemIndex
              const cls = `dash-sem-chip${done ? ' done' : ''}${isActiveSem ? ' active-sem' : ''}`
              const val = sgpa > 0 ? sgpa.toFixed(2) : '—'
              return (
                <div className={cls} key={sem.sem} onClick={() => navigate('/app')}>
                  <span className="dash-sem-chip-lbl">SEM {sem.sem}</span>
                  <span className="dash-sem-chip-val">{val}</span>
                </div>
              )
            })}
          </div>

          {/* Bottom row: tips + placements + internship peek */}
          <div className="dash-bottom-row">
            <div className="dash-panel">
              <div className="dash-panel-title">💡 Tips to Improve Your CGPA</div>
              <div>
                <div className="dash-tip-row"><div className="dash-tip-dot" style={{ background: 'var(--cyan)' }}></div>Enter your marks in Grades to get live SGPA & CGPA calculations.</div>
                <div className="dash-tip-row"><div className="dash-tip-dot" style={{ background: 'var(--purple)' }}></div>Use the Analyser to find subjects where you're close to the threshold.</div>
                <div className="dash-tip-row"><div className="dash-tip-dot" style={{ background: 'var(--green)' }}></div>Browse Resources to find unit-wise notes & PYQs before exams.</div>
                <div className="dash-tip-row"><div className="dash-tip-dot" style={{ background: 'var(--yellow)' }}></div>Check Internships for AI-matched opportunities relevant to your skills.</div>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-title">🏢 Latest Placement Drives</div>
              <div className="dash-intern-peek">
                {placements === null && (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🏢</div>
                    Loading drives…
                  </div>
                )}
                {placements !== null && placements.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1.2rem 0', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>🏢</div>
                    No drives posted yet.<br />Check back soon!
                  </div>
                )}
                {placements !== null && placements.length > 0 && (
                  <>
                    {placements.map((p) => {
                      const salary = formatSalary(p.salary)
                      return (
                        <div className="dash-intern-mini" key={p.unique_id || `${p.source}-${p.title}-${p.company}`} onClick={() => navigate('/placements')} style={{ cursor: 'pointer' }}>
                          <div className="dash-intern-logo" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                            🏢
                          </div>
                          <div className="dash-intern-info">
                            <div className="dash-intern-title" style={{ fontSize: '0.82rem' }}>{p.title || 'Role TBA'}</div>
                            <div className="dash-intern-co" style={{ fontSize: '0.73rem' }}>{p.company || ''}{p.location ? ` · ${p.location}` : ''}</div>
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                            {salary || timeAgo(p.posted_date) || '🟢'}
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
                      <button
                        onClick={() => navigate('/placements')}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 1rem', color: 'var(--green)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', cursor: 'pointer' }}
                      >
                        View All Placements →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>💼 Latest Internships</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--cyan)', letterSpacing: '0.5px', textTransform: 'uppercase', background: 'rgba(6,182,212,0.1)', padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(6,182,212,0.25)' }}>
                  Live
                </span>
              </div>
              <div className="dash-intern-peek">
                {internships === null && (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>💼</div>
                    Loading internships…
                  </div>
                )}
                {internships !== null && internships.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1.2rem 0', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>💼</div>
                    No listings right now.<br />Check back soon!
                  </div>
                )}
                {internships !== null && internships.length > 0 && (
                  <>
                    {internships.map((it) => {
                      const stipend = formatStipend(it.stipend)
                      return (
                        <div className="dash-intern-mini" key={it.unique_id || `${it.source}-${it.title}-${it.company}`} onClick={() => navigate('/internships')} style={{ cursor: 'pointer' }}>
                          <div className="dash-intern-logo">💼</div>
                          <div className="dash-intern-info">
                            <div className="dash-intern-title">{it.title || 'Role TBA'}</div>
                            <div className="dash-intern-co">{it.company || ''}{it.location ? ` · ${it.location}` : ''}</div>
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan)', whiteSpace: 'nowrap' }}>
                            {stipend || timeAgo(it.posted_date) || '🆕'}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
                <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
                  <button
                    onClick={() => navigate('/internships')}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 1rem', color: 'var(--cyan)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    View All Internships →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  )
}
