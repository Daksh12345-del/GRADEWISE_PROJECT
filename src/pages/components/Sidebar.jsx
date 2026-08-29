import { SEMESTERS } from '../../lib/gradesData'
import { useTutorStatus } from '../../lib/useTutorStatus'
import { StaggerGroup, StaggerItem, PressButton } from './motionKit'

const NAV_ITEMS = [
  { icon: '📊', label: 'My Dashboard', path: '/dashboard' },
  { icon: '📚', label: 'My Grades', path: '/app' },
  { icon: '🎓', label: 'Study Resources', path: '/resources' },
  { icon: '💼', label: 'Internships', path: '/internships' },
  { icon: '🏢', label: 'Placements', path: '/placements' },
  { icon: '🧩', label: 'DSA Tracker', path: '/dsa-tracker' },
  { icon: '🤖', label: 'AI Career Coach', path: '/ai-coach' },
  { icon: '🧑‍🏫', label: 'Personal Tuition', path: '/tuition' },
]

const isMobile = () => window.innerWidth <= 767

/** Floating 3-dot button that opens/collapses the sidebar. Lives in the header. */
export function SidebarToggleButton({ open, mobileOpen, toggle }) {
  return (
    <button
      className={`sidebar-toggle-btn ${open || mobileOpen ? 'open' : ''}`}
      onClick={toggle}
      title="Toggle Navigation"
      aria-label="Toggle sidebar"
    >
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </button>
  )
}

/**
 * Left navigation sidebar, shared across Dashboard and Grades pages so both
 * stay visually and behaviorally consistent (same width, same collapse
 * persistence, same mobile overlay behavior).
 *
 * activePath: current route, used to highlight the active nav button.
 * activeSem / onSemChange: only relevant on the Grades page — renders the
 * per-semester quick-jump list when provided.
 */
export default function Sidebar({ activePath, navigate, open, mobileOpen, closeMobile, activeSem, onSemChange }) {
  const { hasProfile, approvalStatus } = useTutorStatus()

  function go(path) {
    navigate(path)
    if (isMobile()) closeMobile()
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={closeMobile}
          style={{
            display: 'block', position: 'fixed', inset: 0, zIndex: 590,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          }}
        />
      )}

      <nav className={`app-sidebar ${!open ? 'collapsed' : ''} ${mobileOpen ? 'mob-open' : ''}`}>
        <div className="app-nav-title">Main Menu</div>
        <StaggerGroup>
          {NAV_ITEMS.map((item) => (
            <StaggerItem key={item.path}>
              <PressButton
                className={`app-nav-btn ${activePath === item.path ? 'active' : ''}`}
                onClick={() => go(item.path)}
              >
                <span>{item.icon}</span> {item.label}
              </PressButton>
            </StaggerItem>
          ))}
          {/* Only shown once this user has actually applied to tutor —
              keeps the teacher-side dashboard out of every student's way
              until they've deliberately opted in via "Teach on GradeWise"
              (see the subtle link on TuitionPage). */}
          {hasProfile && (
            <StaggerItem key="/tutor-dashboard">
              <PressButton
                className={`app-nav-btn ${activePath === '/tutor-dashboard' ? 'active' : ''}`}
                onClick={() => go('/tutor-dashboard')}
              >
                <span>🧑‍🏫</span> Tutor Dashboard
                {approvalStatus === 'pending' && (
                  <span className="job-mode-badge" style={{ marginLeft: 6, color: '#f59e0b', background: '#f59e0b22', fontSize: '0.6rem' }}>
                    pending
                  </span>
                )}
              </PressButton>
            </StaggerItem>
          )}
        </StaggerGroup>
        <hr className="app-nav-divider" />
        <button
          className={`app-nav-btn ${activePath === '/analyser' ? 'active' : ''}`}
          onClick={() => go('/analyser')}
        >
          <span>🔍</span> Analyse Marks
        </button>

        {activePath === '/app' && onSemChange && (
          <>
            <hr className="app-nav-divider" />
            <span className="app-nav-section-lbl">Semesters</span>
            <div id="sidebar-sems">
              {SEMESTERS.map((s, i) => (
                <button
                  key={s.sem}
                  className={`sem-btn ${i === activeSem ? 'active' : ''}`}
                  onClick={() => { onSemChange(i); if (isMobile()) closeMobile() }}
                >
                  {s.label}
                  <span className="sem-badge">{s.totalCredits}cr</span>
                </button>
              ))}
            </div>
          </>
        )}
      </nav>
    </>
  )
}
