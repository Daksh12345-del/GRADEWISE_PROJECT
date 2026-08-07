import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { fetchCodingProfile, DSA_PLATFORMS } from '../lib/api'

const PLATFORM_META = {
  leetcode:   { label: 'LeetCode',   icon: '🟧', color: '#f59e0b' },
  codeforces: { label: 'Codeforces', icon: '🔷', color: '#3b82f6' },
  codechef:   { label: 'CodeChef',   icon: '🍫', color: '#8b5cf6' },
  gfg:        { label: 'GeeksforGeeks', icon: '🟢', color: '#10b981' },
  hackerrank: { label: 'HackerRank', icon: '🟩', color: '#22c55e' },
  github:     { label: 'GitHub',     icon: '🐙', color: '#818cf8' },
}

const STORAGE_KEY = 'gw_dsa_usernames'

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function Stat({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="dsa-stat">
      <div className="dsa-stat-value">{value}</div>
      <div className="dsa-stat-label">{label}</div>
    </div>
  )
}

function PlatformResult({ platform, state }) {
  const meta = PLATFORM_META[platform]
  if (!state) return null

  return (
    <div className="dsa-card" style={{ borderColor: meta.color + '33' }}>
      <div className="dsa-card-head" style={{ color: meta.color }}>
        <span>{meta.icon}</span> {meta.label}
        {state.status === 'loading' && <span className="dsa-status">fetching…</span>}
      </div>

      {state.status === 'error' && (
        <div className="dsa-error">⚠️ {state.error}</div>
      )}

      {state.status === 'ready' && state.data && (
        <div className="dsa-stats-grid">
          {platform === 'leetcode' && (
            <>
              <Stat label="Total Solved" value={state.data.totalSolved} />
              <Stat label="Easy" value={state.data.easySolved} />
              <Stat label="Medium" value={state.data.mediumSolved} />
              <Stat label="Hard" value={state.data.hardSolved} />
              <Stat label="Rank" value={state.data.ranking} />
              <Stat label="Contest Rating" value={state.data.contestRating} />
            </>
          )}
          {platform === 'codeforces' && (
            <>
              <Stat label="Rating" value={state.data.currentRating} />
              <Stat label="Max Rating" value={state.data.maxRating} />
              <Stat label="Rank" value={state.data.rank} />
              <Stat label="Max Rank" value={state.data.maxRank} />
              <Stat label="Contests" value={state.data.contestsParticipated} />
              <Stat label="Contribution" value={state.data.contribution} />
            </>
          )}
          {platform === 'codechef' && (
            <>
              <Stat label="Rating" value={state.data.currentRating} />
              <Stat label="Highest Rating" value={state.data.highestRating} />
              <Stat label="Stars" value={state.data.stars} />
              <Stat label="Global Rank" value={state.data.globalRank} />
              <Stat label="Total Solved" value={state.data.totalSolved} />
              <Stat label="Contests" value={state.data.contestsParticipated} />
            </>
          )}
          {platform === 'gfg' && (
            <>
              <Stat label="Total Solved" value={state.data.totalSolved} />
              <Stat label="School" value={state.data.schoolSolved} />
              <Stat label="Basic" value={state.data.basicSolved} />
              <Stat label="Easy" value={state.data.easySolved} />
              <Stat label="Medium" value={state.data.mediumSolved} />
              <Stat label="Hard" value={state.data.hardSolved} />
              <Stat label="Coding Score" value={state.data.totalScore} />
              <Stat label="Institute Rank" value={state.data.rank} />
            </>
          )}
          {platform === 'hackerrank' && (
            <>
              <Stat label="Badges" value={state.data.badgesCount} />
              <Stat label="Certificates" value={state.data.certificateCount} />
            </>
          )}
          {platform === 'github' && (
            <>
              <Stat label="Public Repos" value={state.data.publicRepos} />
              <Stat label="Followers" value={state.data.followers} />
              <Stat label="Total Stars" value={state.data.totalStars} />
              <Stat label="Total Forks" value={state.data.totalForks} />
              <Stat label="Contributions (yr)" value={state.data.contributions} />
            </>
          )}
        </div>
      )}

      {state.status === 'idle' && (
        <div className="dsa-idle">Enter a username above and fetch to see stats.</div>
      )}
    </div>
  )
}

export default function DsaTrackerPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()

  const [usernames, setUsernames] = useState(() => {
    const saved = loadSaved()
    const init = {}
    DSA_PLATFORMS.forEach(p => { init[p] = saved[p] || '' })
    return init
  })
  const [results, setResults] = useState(() => {
    const init = {}
    DSA_PLATFORMS.forEach(p => { init[p] = { status: 'idle' } })
    return init
  })
  const [fetchingAll, setFetchingAll] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(usernames)) } catch { /* ignore */ }
  }, [usernames])

  const fetchOne = useCallback(async (platform) => {
    const u = (usernames[platform] || '').trim()
    if (!u) return
    setResults(prev => ({ ...prev, [platform]: { status: 'loading' } }))
    try {
      const data = await fetchCodingProfile(platform, u)
      setResults(prev => ({ ...prev, [platform]: { status: 'ready', data } }))
    } catch (e) {
      setResults(prev => ({ ...prev, [platform]: { status: 'error', error: e.message || 'Failed to fetch' } }))
    }
  }, [usernames])

  async function fetchAll() {
    setFetchingAll(true)
    await Promise.all(DSA_PLATFORMS.filter(p => usernames[p]?.trim()).map(p => fetchOne(p)))
    setFetchingAll(false)
  }

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="dsaTrackerPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>DSA Tracker</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              Track your coding profiles in one place
            </div>
          </div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar
          activePath="/dsa-tracker"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        <div className="res-body">
          <div className="dsa-username-panel">
            {DSA_PLATFORMS.map(p => {
              const meta = PLATFORM_META[p]
              return (
                <div key={p} className="dsa-username-row">
                  <span className="dsa-username-icon" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
                  <input
                    value={usernames[p]}
                    onChange={e => setUsernames(prev => ({ ...prev, [p]: e.target.value }))}
                    placeholder={`${meta.label} username`}
                    aria-label={`${meta.label} username`}
                    className="dsa-username-input"
                  />
                  <button
                    className="job-refresh-btn"
                    disabled={!usernames[p]?.trim() || results[p].status === 'loading'}
                    onClick={() => fetchOne(p)}
                  >
                    {results[p].status === 'loading' ? '…' : 'Fetch'}
                  </button>
                </div>
              )
            })}
            <button className="job-apply-btn" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={fetchAll} disabled={fetchingAll}>
              {fetchingAll ? 'Fetching all…' : '⚡ Fetch all profiles'}
            </button>
          </div>

          <div className="dsa-results-grid">
            {DSA_PLATFORMS.map(p => <PlatformResult key={p} platform={p} state={results[p]} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
