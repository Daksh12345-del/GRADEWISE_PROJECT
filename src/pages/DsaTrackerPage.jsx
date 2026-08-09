import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import { AnimatedNumber } from './components/motionKit'
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
              <Stat label="🔥 Current Streak" value={state.data.streak !== undefined ? `${state.data.streak} days` : undefined} />
              <Stat label="Total Active Days" value={state.data.totalActiveDays} />
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
              <Stat label="🔥 Current Streak" value={state.data.streak !== undefined ? `${state.data.streak} days` : undefined} />
              <Stat label="Max Streak" value={state.data.maxStreak !== undefined ? `${state.data.maxStreak} days` : undefined} />
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
              <Stat label="🔥 Current Streak" value={state.data.streak !== undefined ? `${state.data.streak} days` : undefined} />
              <Stat label="Active Days This Week" value={state.data.activeDaysThisWeek} />
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

const GOAL_STORAGE_KEY = 'gw_dsa_weekly_goal'

// Weekly-goal progress bar is LeetCode-specific because a "goal of N
// problems" needs a per-day *count of problems solved*, and only
// LeetCode's calendar gives that. GFG (currentStreak/maxStreak) and GitHub
// (derived from recent event history) also show real streaks — see their
// own cards in the results grid — but neither exposes enough to drive a
// "problems this week" counter. CodeChef/HackerRank don't expose any
// day-by-day activity data through the endpoints this backend uses.
function StreakGoalCard({ leetcodeState }) {
  const [goal, setGoal] = useState(() => {
    const saved = Number(localStorage.getItem(GOAL_STORAGE_KEY))
    return saved > 0 ? saved : 10
  })

  useEffect(() => {
    try { localStorage.setItem(GOAL_STORAGE_KEY, String(goal)) } catch { /* ignore */ }
  }, [goal])

  const ready = leetcodeState?.status === 'ready' && leetcodeState.data
  const streak = ready ? (leetcodeState.data.streak || 0) : null
  const solvedThisWeek = ready ? (leetcodeState.data.solvedThisWeek || 0) : 0
  const pct = Math.max(0, Math.min(100, Math.round((solvedThisWeek / Math.max(goal, 1)) * 100)))
  const metGoal = solvedThisWeek >= goal

  return (
    <div className="dsa-card" style={{ borderColor: '#f59e0b33', gridColumn: '1 / -1' }}>
      <div className="dsa-card-head" style={{ color: '#f59e0b' }}>
        <span>🔥</span> Streak &amp; Weekly Goal
        <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-dim)', marginLeft: 8 }}>
          (weekly problems-solved goal — LeetCode; GFG &amp; GitHub streaks shown on their own cards below)
        </span>
      </div>

      {!ready ? (
        <div className="dsa-idle">Fetch your LeetCode profile above to see your streak and weekly progress.</div>
      ) : (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', padding: '4px 2px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
              🔥 <AnimatedNumber value={streak} />
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4, letterSpacing: 1 }}>
              DAY STREAK
            </div>
          </div>

          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>
                {solvedThisWeek} / {goal} solved this week {metGoal && '🎉'}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Weekly goal:
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={goal}
                  onChange={e => setGoal(Math.max(1, Number(e.target.value) || 1))}
                  className="dsa-username-input"
                  style={{ width: 60, padding: '4px 8px' }}
                />
              </label>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'var(--bg-card-alt, rgba(148,163,184,0.15))', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', borderRadius: 6, background: metGoal ? '#10b981' : 'linear-gradient(90deg,#f59e0b,#fbbf24)' }}
              />
            </div>
          </div>
        </div>
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
            <StreakGoalCard leetcodeState={results.leetcode} />
            {DSA_PLATFORMS.map(p => <PlatformResult key={p} platform={p} state={results[p]} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
