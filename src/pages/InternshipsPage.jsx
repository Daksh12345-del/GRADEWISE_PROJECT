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
import { fetchInternships, submitQuickApply } from '../lib/api'
import { getCachedListings, setCachedListings } from '../lib/jobListingsCache'
import { classifyWorkMode, computeJobStats, WORK_MODE_META, isClosingSoon, daysUntilExpiry, SORTERS } from '../lib/jobStats'

function initials(company) {
  const words = (company || 'Co').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)
  if (!words[0]) return 'CO'
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase()
}

const LOGO_COLORS = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6']
const CACHE_KEY = 'internships'
function logoColor(company) {
  const c = company || 'Co'
  return LOGO_COLORS[Math.abs((c.charCodeAt(0) || 0) + (c.charCodeAt(1) || 0)) % LOGO_COLORS.length]
}

function formatStipend(v) {
  const n = Number(v) || 0
  if (n <= 0) return 'Unpaid / Not disclosed'
  return `₹${n.toLocaleString('en-IN')}/mo`
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

function InternshipCard({ item }) {
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
        <span>🗓️ {item.duration || '3 Months'}</span>
        <span>💰 {formatStipend(item.stipend)}</span>
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
              // Fire-and-forget — logs that this user clicked Apply, using
              // their already-known profile (name/email/branch from
              // Clerk), with zero extra UI. Never blocks or delays the
              // actual navigation to apply_url, and a failure here is
              // silently swallowed — losing a lead record should never
              // stop someone from actually applying.
              submitQuickApply({
                item_unique_id: item.unique_id,
                item_type: 'internship',
                item_title: item.title,
                item_company: item.company,
                applicant_name: user?.name || '',
                applicant_email: user?.email || '',
                applicant_phone: '',
                applicant_degree: user?.branch || '',
                resume_link: '',
              }).catch(() => { /* non-fatal — see comment above */ })
            }}
          >Apply →</a>
        </div>
      </div>
    </div>
  )
}

export default function InternshipsPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()

  const [items, setItems] = useState(() => getCachedListings(CACHE_KEY) || [])
  const [status, setStatus] = useState(() => (getCachedListings(CACHE_KEY) ? 'ready' : 'loading')) // loading | ready | error
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('all')
  const [workMode, setWorkMode] = useState('all') // all | remote | hybrid | onsite
  const [sortBy, setSortBy] = useState('newest') // newest | stipend_high
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
      const data = await fetchInternships(forceRefresh)
      setItems(data)
      setStatus('ready')
      setCachedListings(CACHE_KEY, data)
    } catch (e) {
      setError(e.message || 'Failed to load internships')
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

  // Stats reflect the domain + search filters (so "Total" matches what's on
  // screen) but ignore the work-mode filter itself, otherwise picking
  // "Remote" would always show 100% remote and the bar becomes meaningless.
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

  const avgStipend = useMemo(() => {
    const paid = statsBase.map(i => Number(i.stipend) || 0).filter(n => n > 0)
    if (!paid.length) return null
    const avg = paid.reduce((a, b) => a + b, 0) / paid.length
    return `₹${Math.round(avg).toLocaleString('en-IN')}/mo`
  }, [statsBase])

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="internshipsPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>Internships</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              {status === 'ready' ? `${filtered.length} of ${items.length} listings` : 'Live internship listings'}
            </div>
          </div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar
          activePath="/internships"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        <div className="res-body">
          <JobStatsBar stats={stats} loading={status === 'loading'} moneyLabel="Avg Stipend" avgMoney={avgStipend} />

          <div className="job-filter-bar">
            <JobFilterControls
              domains={domains} domain={domain} setDomain={setDomain}
              workMode={workMode} setWorkMode={setWorkMode}
              sortBy={sortBy} setSortBy={setSortBy}
              highLabel="Highest stipend" sortAriaLabel="Sort internships by"
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
              <div>Loading internships…</div>
            </div>
          )}

          {status === 'error' && (
            <div className="job-state-msg" style={{ color: 'var(--red, #ef4444)' }}>
              <div>⚠️ {error}</div>
              <button className="job-refresh-btn" style={{ marginTop: 10 }} onClick={() => load(false)}>Try again</button>
            </div>
          )}

          {status === 'ready' && filtered.length === 0 && (
            <div className="job-state-msg">No internships match your filters right now.</div>
          )}

          {status === 'ready' && filtered.length > 0 && (
            <StaggerGroup className="job-grid">
              {filtered.map(item => (
                <StaggerItem key={item.unique_id || `${item.source}-${item.title}-${item.company}`}>
                  <HoverCard>
                    <InternshipCard item={item} />
                  </HoverCard>
                </StaggerItem>
              ))}
            </StaggerGroup>
          )}
        </div>
      </div>
    </div>
  )
}
