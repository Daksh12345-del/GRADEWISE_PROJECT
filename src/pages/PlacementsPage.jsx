import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import JobStatsBar from './components/JobStatsBar'
import JobFilterControls from './components/JobFilterControls'
import Logo from './components/Logo'
import { StaggerGroup, StaggerItem, HoverCard } from './components/motionKit'
import { useAuthUser } from '../lib/useAuthUser'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { fetchPlacements, submitQuickApply } from '../lib/api'
import { getCachedListings, setCachedListings } from '../lib/jobListingsCache'
import { classifyWorkMode, computeJobStats, WORK_MODE_META, isClosingSoon, daysUntilExpiry, SORTERS } from '../lib/jobStats'

function initials(company) {
  const words = (company || 'Co').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)
  if (!words[0]) return 'CO'
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase()
}

const LOGO_COLORS = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6']
const CACHE_KEY = 'placements'
// With 2000+ live listings, mounting every card (each with its own
// hover/stagger motion component) at once froze the tab entirely
// ("Not Responding"). Rendering PAGE_SIZE at a time, with a "See more"
// button, keeps the DOM + active animations bounded no matter how many
// results match the current filters.
const PAGE_SIZE = 250
function logoColor(company) {
  const c = company || 'Co'
  return LOGO_COLORS[Math.abs((c.charCodeAt(0) || 0) + (c.charCodeAt(1) || 0)) % LOGO_COLORS.length]
}

function formatSalary(v) {
  const n = Number(v) || 0
  if (n <= 0) return 'Not disclosed'
  // NOTE: backend/server.py sources (JSearch job_min_salary, Adzuna salary_min,
  // Jobicy annualSalaryMin) already return an ANNUAL figure — they are not
  // monthly. The old `(n * 12) / 100000` here was inflating every real salary
  // 12x (e.g. an already-annual ₹8,00,000 became "≈ ₹96.0 LPA"). Treat the
  // value as annual directly. If the backend ever adds a source that truly
  // reports monthly pay, tag it with a `salary_period` field and branch on
  // that instead of guessing from magnitude.
  const annualLPA = n / 100000
  if (annualLPA >= 1) return `≈ ₹${annualLPA.toFixed(1)} LPA`
  return `₹${n.toLocaleString('en-IN')}`
}

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

function PlacementCard({ item }) {
  const mode = classifyWorkMode(item)
  const modeMeta = WORK_MODE_META[mode]
  const { user } = useAuthUser()
  return (
    <div className="job-card">
      <div className="job-card-top">
        <div className="job-logo" style={{ background: logoColor(item.company) + '22', border: `1.5px solid ${logoColor(item.company)}44`, color: logoColor(item.company) }}>
          {initials(item.company)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="job-title" title={item.title}>{item.title}</div>
          <div className="job-company">{item.company}</div>
        </div>
        <span className="job-mode-badge" style={{ color: modeMeta.color, background: modeMeta.color + '1f' }}>
          {modeMeta.emoji} {modeMeta.label}
        </span>
      </div>

      <div className="job-meta-row">
        <span>📍 {item.location || 'Remote'}</span>
        <span>💼 Full-time</span>
        <span>💰 {formatSalary(item.salary)}</span>
      </div>

      {Array.isArray(item.skills) && item.skills.length > 0 && (
        <div className="job-skills">
          {item.skills.slice(0, 5).map((s, i) => <span key={i} className="job-skill-chip">{s}</span>)}
        </div>
      )}

      <div className="job-card-bottom">
        <span className="job-posted">{timeAgo(item.posted_date)} · via {item.source || 'web'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isClosingSoon(item) && (
            <span className="job-closing-badge" title={`Closes in ${daysUntilExpiry(item)} day(s)`}>
              ⏳ Closing soon
            </span>
          )}
          <a
            href={item.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="job-apply-btn"
            onClick={() => {
              submitQuickApply({
                item_unique_id: item.unique_id,
                item_type: 'placement',
                item_title: item.title,
                item_company: item.company,
                applicant_name: user?.name || '',
                applicant_email: user?.email || '',
                applicant_phone: '',
                applicant_degree: user?.branch || '',
                resume_link: '',
              }).catch(() => { /* non-fatal — never block real navigation over a lost lead record */ })
            }}
          >Apply →</a>
        </div>
      </div>
    </div>
  )
}

export default function PlacementsPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()

  const [items, setItems] = useState(() => getCachedListings(CACHE_KEY) || [])
  const [status, setStatus] = useState(() => (getCachedListings(CACHE_KEY) ? 'ready' : 'loading'))
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('all')
  const [workMode, setWorkMode] = useState('all') // all | remote | hybrid | onsite
  const [sortBy, setSortBy] = useState('newest') // newest | stipend_high
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)

  async function load(forceRefresh = false) {
    setError('')
    if (!forceRefresh) {
      const cached = getCachedListings(CACHE_KEY)
      if (cached) {
        setItems(cached)
        setStatus('ready')
        return
      }
      setStatus('loading')
    } else {
      setRefreshing(true)
    }
    try {
      const data = await fetchPlacements(forceRefresh)
      setItems(data)
      setStatus('ready')
      setCachedListings(CACHE_KEY, data)
    } catch (e) {
      setError(e.message || 'Failed to load placements')
      setStatus('error')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { load(false) }, [])

  const domains = useMemo(() => {
    const set = new Set(items.map(i => i.domain).filter(Boolean))
    return ['all', ...Array.from(set)]
  }, [items])

  const filtered = useMemo(() => {
    let out = items
    if (domain !== 'all') out = out.filter(i => i.domain === domain)
    if (workMode !== 'all') out = out.filter(i => classifyWorkMode(i) === workMode)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.company || '').toLowerCase().includes(q) ||
        (i.location || '').toLowerCase().includes(q)
      )
    }
    return [...out].sort(SORTERS[sortBy])
  }, [items, domain, workMode, search, sortBy])

  // Any filter/sort change means a new result set — start back at page 1
  // instead of keeping a stale "load more" position from the last filter.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [domain, workMode, search, sortBy])

  const visibleItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  // Stats reflect domain + search but not the work-mode filter itself,
  // otherwise selecting "Remote" would always show a 100% remote split.
  const statsBase = useMemo(() => {
    let out = items
    if (domain !== 'all') out = out.filter(i => i.domain === domain)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.company || '').toLowerCase().includes(q) ||
        (i.location || '').toLowerCase().includes(q)
      )
    }
    return out
  }, [items, domain, search])

  const stats = useMemo(() => computeJobStats(statsBase), [statsBase])

  const avgSalary = useMemo(() => {
    const paid = statsBase.map(i => Number(i.salary) || 0).filter(n => n > 0)
    if (!paid.length) return null
    const avg = paid.reduce((a, b) => a + b, 0) / paid.length
    return `≈ ₹${(avg / 100000).toFixed(1)} LPA`
  }, [statsBase])

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="placementsPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>Placements</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              {status === 'ready' ? `${filtered.length} of ${items.length} openings` : 'Full-time & fresher openings'}
            </div>
          </div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar
          activePath="/placements"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        <div className="res-body">
          <JobStatsBar stats={stats} loading={status === 'loading'} moneyLabel="Avg Package" avgMoney={avgSalary} />

          <div className="job-filter-bar">
            <JobFilterControls
              domains={domains} domain={domain} setDomain={setDomain}
              workMode={workMode} setWorkMode={setWorkMode}
              sortBy={sortBy} setSortBy={setSortBy}
              highLabel="Highest package" sortAriaLabel="Sort placements by"
            />
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="job-refresh-btn"
              title="Force a fresh fetch from all sources"
            >
              {refreshing ? '⟳ Refreshing…' : '↺ Refresh'}
            </button>
          </div>

          {status === 'loading' && (
            <div className="job-state-msg">
              <div className="ai-spinner" />
              <div>Loading placements…</div>
            </div>
          )}

          {status === 'error' && (
            <div className="job-state-msg" style={{ color: 'var(--red, #ef4444)' }}>
              <div>⚠️ {error}</div>
              <button className="job-refresh-btn" style={{ marginTop: 10 }} onClick={() => load(false)}>Try again</button>
            </div>
          )}

          {status === 'ready' && filtered.length === 0 && (
            <div className="job-state-msg">No placements match your filters right now.</div>
          )}

          {status === 'ready' && filtered.length > 0 && (
            <>
              <StaggerGroup className="job-grid" staggerChildren={Math.min(0.07, 1.2 / Math.max(visibleItems.length, 1))}>
                {visibleItems.map(item => (
                  <StaggerItem key={item.unique_id || `${item.source}-${item.title}-${item.company}`}>
                    <HoverCard>
                      <PlacementCard item={item} />
                    </HoverCard>
                  </StaggerItem>
                ))}
              </StaggerGroup>

              {visibleCount < filtered.length && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                  <button
                    className="job-refresh-btn"
                    onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                  >
                    See more ({filtered.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
