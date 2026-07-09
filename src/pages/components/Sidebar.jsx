import { SEMESTERS } from '../../lib/gradesData'

const NAV_ITEMS = [
  { icon: '📊', label: 'My Dashboard', path: '/dashboard' },
  { icon: '📚', label: 'My Grades', path: '/app' },
  { icon: '🎓', label: 'Study Resources', path: '/resources' },
  { icon: '💼', label: 'Internships', path: '/internships' },
  { icon: '🏢', label: 'Placements', path: '/placements' },
  { icon: '🧩', label: 'DSA Tracker', path: '/dsa-tracker' },
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
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`app-nav-btn ${activePath === item.path ? 'active' : ''}`}
            onClick={() => go(item.path)}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
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
