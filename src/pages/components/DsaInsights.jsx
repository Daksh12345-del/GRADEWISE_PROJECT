import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import { fetchUpcomingContests } from '../../lib/api'
import { fetchAiDsaRoadmap } from '../../lib/api'
import FormattedAiText from './FormattedAiText'
import { getClerkUserId } from '../../lib/clerkUser'
import { useAuthUser } from '../../lib/useAuthUser'
import {
  fetchDsaLeaderboard, upsertDsaLeaderboardEntry,
  saveDsaSnapshot, fetchDsaSnapshotFromDaysAgo,
} from '../../lib/leaderboard'

// ─────────────────────────────────────────────────────────────────────────
// Shared metrics — computed once here, reused by ConsistencyRadar, the DSA
// leaderboard opt-in, and snapshot saving, so the "score" a user sees, the
// score they submit to the leaderboard, and the score saved to history are
// always the exact same number, derived from the exact same real data.
// ─────────────────────────────────────────────────────────────────────────
export function computeDsaMetrics(results) {
  const platformsFetched = ['leetcode', 'codeforces', 'codechef', 'gfg', 'hackerrank', 'github']
    .filter(p => results[p]?.status === 'ready')

  const lc = results.leetcode?.status === 'ready' ? results.leetcode.data : null
  const gh = results.github?.status === 'ready' ? results.github.data : null
  const gfg = results.gfg?.status === 'ready' ? results.gfg.data : null
  const cc = results.codechef?.status === 'ready' ? results.codechef.data : null

  const bestStreak = Math.max(lc?.streak || 0, gh?.streak || 0, gfg?.streak || 0)
  const streakScore = Math.min(100, Math.round((bestStreak / 30) * 100))
  const coverageScore = Math.round((platformsFetched.length / 6) * 100)

  let difficultyScore = 0
  if (lc && lc.totalSolved > 0) {
    const weighted = (lc.easySolved || 0) * 1 + (lc.mediumSolved || 0) * 2 + (lc.hardSolved || 0) * 3
    difficultyScore = Math.min(100, Math.round((weighted / (lc.totalSolved * 3)) * 100))
  }

  const totalSolved = (lc?.totalSolved || 0) + (gfg?.totalSolved || 0) + (cc?.totalSolved || 0)
  const volumeScore = Math.min(100, Math.round((totalSolved / 300) * 100))

  const axes = { streak: streakScore, coverage: coverageScore, difficultyMix: difficultyScore, volume: volumeScore }
  const overall = platformsFetched.length === 0 ? 0 : Math.round((streakScore + coverageScore + difficultyScore + volumeScore) / 4)

  return { platformsFetched, overall, axes, totalSolved, bestStreak }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Difficulty breakdown — stacked bar, one bar per platform that actually
//    returned a difficulty split (LeetCode, GFG). Nothing shown for a
//    platform that hasn't been fetched yet or doesn't expose this.
// ─────────────────────────────────────────────────────────────────────────
export function DifficultyBarChart({ results }) {
  const rows = []
  if (results.leetcode?.status === 'ready') {
    const d = results.leetcode.data
    rows.push({ platform: 'LeetCode', Easy: d.easySolved || 0, Medium: d.mediumSolved || 0, Hard: d.hardSolved || 0 })
  }
  if (results.gfg?.status === 'ready') {
    const d = results.gfg.data
    rows.push({ platform: 'GFG', Easy: d.easySolved || 0, Medium: d.mediumSolved || 0, Hard: d.hardSolved || 0 })
  }

  if (rows.length === 0) {
    return <div className="dsa-idle">Fetch LeetCode and/or GeeksforGeeks above to see your difficulty breakdown.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="platform" tick={{ fill: 'var(--text-dim)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Easy" stackId="d" fill="#22c55e" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Medium" stackId="d" fill="#f59e0b" />
        <Bar dataKey="Hard" stackId="d" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Combined cross-platform heatmap — merges real per-day counts from
//    LeetCode (dailySolves), Codeforces (dailySolves) and GitHub
//    (dailyContributions) into one calendar grid, last ~18 weeks. A
//    platform that hasn't been fetched simply contributes nothing that
//    day — never backfilled or estimated.
// ─────────────────────────────────────────────────────────────────────────
const WEEKS_SHOWN = 18

function buildCombinedDays(results) {
  const totals = {} // "YYYY-MM-DD" -> count
  const sources = [
    results.leetcode?.status === 'ready' ? results.leetcode.data.dailySolves : null,
    results.codeforces?.status === 'ready' ? results.codeforces.data.dailySolves : null,
    results.github?.status === 'ready' ? results.github.data.dailyContributions : null,
  ]
  let anySource = false
  for (const list of sources) {
    if (!Array.isArray(list) || list.length === 0) continue
    anySource = true
    for (const { date, count } of list) {
      totals[date] = (totals[date] || 0) + (count || 0)
    }
  }
  return { totals, anySource }
}

function levelFor(count) {
  if (!count) return 0
  if (count <= 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

const LEVEL_COLORS = ['var(--bg-card2)', '#0e4429', '#006d32', '#26a641', '#39d353']

export function CombinedHeatmap({ results }) {
  const { totals, anySource } = useMemo(() => buildCombinedDays(results), [results])

  if (!anySource) {
    return <div className="dsa-idle">Fetch LeetCode, Codeforces, and/or GitHub above to see combined daily activity.</div>
  }

  const today = new Date()
  const days = []
  const totalDays = WEEKS_SHOWN * 7
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ key, count: totals[key] || 0 })
  }
  // Pad the front so the grid starts on a Sunday column.
  const firstDow = new Date(days[0].key).getDay()
  const padded = Array(firstDow).fill(null).concat(days)
  const weeks = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

  const activeDayCount = days.filter(d => d.count > 0).length
  const totalActivity = days.reduce((s, d) => s + d.count, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {week.map((day, di) => (
              <div
                key={di}
                title={day ? `${day.key}: ${day.count} activit${day.count === 1 ? 'y' : 'ies'}` : ''}
                style={{
                  width: 12, height: 12, borderRadius: 3,
                  background: day ? LEVEL_COLORS[levelFor(day.count)] : 'transparent',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <span>{activeDayCount} active days · {totalActivity} total solves/contributions in the last {WEEKS_SHOWN * 7} days</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Less {LEVEL_COLORS.map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />)} More
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Consistency Score — a transparent, self-defined composite metric
//    (not an official platform score) computed only from data actually
//    fetched. Shown as a radar chart across 4 axes.
// ─────────────────────────────────────────────────────────────────────────
export function ConsistencyRadar({ results }) {
  const { platformsFetched, overall, axes } = computeDsaMetrics(results)

  if (platformsFetched.length === 0) {
    return <div className="dsa-idle">Fetch at least one profile above to see your consistency score.</div>
  }

  const data = [
    { axis: 'Streak', value: axes.streak },
    { axis: 'Coverage', value: axes.coverage },
    { axis: 'Difficulty Mix', value: axes.difficultyMix },
    { axis: 'Volume', value: axes.volume },
  ]

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-display)' }}>{overall}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}> / 100</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'var(--text-dim)', fontSize: 9 }} />
          <Radar dataKey="value" stroke="var(--cyan)" fill="var(--cyan)" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 2 }}>
        A custom composite metric (streak + platform coverage + difficulty mix + volume) — not an official rating from any platform.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Weak-topic detector — from LeetCode's real per-tag solved counts
//    (tagProblemCounts), sorted ascending so the least-practiced topics
//    the user has ever touched show up first.
// ─────────────────────────────────────────────────────────────────────────
export function WeakTopicsList({ results }) {
  const lc = results.leetcode?.status === 'ready' ? results.leetcode.data : null
  if (!lc) return <div className="dsa-idle">Fetch your LeetCode profile above to see weak-topic suggestions.</div>

  const tc = lc.tagCounts || {}
  const allTags = [...(tc.fundamental || []), ...(tc.intermediate || []), ...(tc.advanced || [])]
  if (allTags.length === 0) {
    return <div className="dsa-idle">No tag data returned for this profile yet — try fetching again.</div>
  }
  const weakest = [...allTags].sort((a, b) => a.solved - b.solved).slice(0, 8)
  const maxSolved = Math.max(...allTags.map(t => t.solved), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {weakest.map(t => (
        <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: '0 0 130px', fontSize: '0.78rem', color: 'var(--text)' }}>{t.tag}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-card2)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(4, (t.solved / maxSolved) * 100)}%`, height: '100%', background: t.solved === 0 ? '#ef4444' : 'var(--cyan)', borderRadius: 4 }} />
          </div>
          <span style={{ flex: '0 0 24px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-dim)' }}>{t.solved}</span>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 2 }}>
        Lowest solved-count tags from your real LeetCode tag breakdown — practice these next.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Upcoming contests aggregator — real live schedule from the backend
//    (/api/contests/upcoming), which itself pulls Codeforces + LeetCode's
//    own APIs. Fetched once on mount, independent of the username panel.
// ─────────────────────────────────────────────────────────────────────────
const CONTEST_META = {
  codeforces: { label: 'Codeforces', color: '#ec4899', icon: '🔷' },
  leetcode:   { label: 'LeetCode',   color: '#f59e0b', icon: '🟧' },
}

function formatCountdown(startTimeIso) {
  const diffMs = new Date(startTimeIso).getTime() - Date.now()
  if (diffMs <= 0) return 'starting now'
  const days = Math.floor(diffMs / 86400000)
  const hours = Math.floor((diffMs % 86400000) / 3600000)
  if (days > 0) return `in ${days}d ${hours}h`
  const mins = Math.floor((diffMs % 3600000) / 60000)
  return `in ${hours}h ${mins}m`
}

export function UpcomingContestsList() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchUpcomingContests()
      .then(json => { if (!cancelled) setState({ status: 'ready', data: json }) })
      .catch(e => { if (!cancelled) setState({ status: 'error', error: e.message || 'Failed to fetch' }) })
    return () => { cancelled = true }
  }, [])

  if (state.status === 'loading') return <div className="dsa-idle">Loading upcoming contests…</div>
  if (state.status === 'error') return <div className="dsa-error">⚠️ {state.error}</div>

  const contests = state.data.contests || []
  if (contests.length === 0) return <div className="dsa-idle">No upcoming contests found right now — check back later.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
      {contests.map((c, i) => {
        const meta = CONTEST_META[c.platform] || { label: c.platform, color: 'var(--text-dim)', icon: '🏁' }
        return (
          <a
            key={i} href={c.url} target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none',
              color: 'inherit', background: 'var(--bg-card2)',
            }}
          >
            <span style={{ color: meta.color, fontSize: '0.78rem', fontWeight: 700, flex: '0 0 96px' }}>{meta.icon} {meta.label}</span>
            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text)' }}>{c.name}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              {c.startTime ? formatCountdown(c.startTime) : ''}
            </span>
          </a>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Rating-over-time — real Codeforces contest history (ratingHistory,
//    already fetched by the backend), last 10 contests.
// ─────────────────────────────────────────────────────────────────────────
export function RatingHistoryChart({ results }) {
  const cf = results.codeforces?.status === 'ready' ? results.codeforces.data : null
  if (!cf || !Array.isArray(cf.ratingHistory) || cf.ratingHistory.length === 0) {
    return <div className="dsa-idle">Fetch your Codeforces profile above to see your rating history.</div>
  }
  const data = cf.ratingHistory.map(r => ({
    contest: r.contestName?.length > 18 ? r.contestName.slice(0, 18) + '…' : r.contestName,
    rating: r.newRating,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="contest" tick={{ fill: 'var(--text-dim)', fontSize: 9 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} domain={['dataMin - 50', 'dataMax + 50']} />
        <Tooltip contentStyle={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="rating" stroke="#ec4899" strokeWidth={2} dot={{ r: 3, fill: '#ec4899' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 7. GitHub top-languages pie — real repo-language breakdown, already
//    fetched (topLanguages).
// ─────────────────────────────────────────────────────────────────────────
const PIE_COLORS = ['#818cf8', '#39d353', '#f59e0b', '#ef4444', '#14b8a6', '#a855f7']

export function GithubLanguagesPie({ results }) {
  const gh = results.github?.status === 'ready' ? results.github.data : null
  if (!gh || !Array.isArray(gh.topLanguages) || gh.topLanguages.length === 0) {
    return <div className="dsa-idle">Fetch your GitHub profile above to see your top languages.</div>
  }
  const data = gh.topLanguages.slice(0, 6).map(l => ({
    name: typeof l === 'string' ? l : (l.name || l.language || String(l)),
    value: typeof l === 'object' ? (l.count || l.repos || 1) : 1,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name }) => name}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Total-solved summary — one big honest number, summed only across
//    platforms actually fetched.
// ─────────────────────────────────────────────────────────────────────────
export function TotalSolvedSummaryCard({ results }) {
  const parts = []
  if (results.leetcode?.status === 'ready') parts.push({ label: 'LeetCode', value: results.leetcode.data.totalSolved || 0 })
  if (results.gfg?.status === 'ready') parts.push({ label: 'GFG', value: results.gfg.data.totalSolved || 0 })
  if (results.codechef?.status === 'ready') parts.push({ label: 'CodeChef', value: results.codechef.data.totalSolved || 0 })

  if (parts.length === 0) {
    return <div className="dsa-idle">Fetch LeetCode, GFG, and/or CodeChef above to see your combined total.</div>
  }
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{total}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>problems solved across {parts.length} platform{parts.length > 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {parts.map(p => (
          <div key={p.label} style={{ fontSize: '0.75rem', color: 'var(--text)' }}>
            <strong>{p.value}</strong> <span style={{ color: 'var(--text-dim)' }}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 9. Codeforces problem-rating histogram — real per-rating-band solved
//    counts (ratingBuckets), already computed backend-side from the same
//    submission history dailySolves uses.
// ─────────────────────────────────────────────────────────────────────────
export function RatingBucketHistogram({ results }) {
  const cf = results.codeforces?.status === 'ready' ? results.codeforces.data : null
  if (!cf || !Array.isArray(cf.ratingBuckets) || cf.ratingBuckets.length === 0) {
    return <div className="dsa-idle">Fetch your Codeforces profile above to see your rating-wise solve breakdown.</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={cf.ratingBuckets} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-dim)', fontSize: 9 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} angle={-35} textAnchor="end" height={50} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 10. Achievement badges — real thresholds checked against already-fetched
//     data. A badge only ever appears once its real condition is met;
//     nothing here is a fake "unlock".
// ─────────────────────────────────────────────────────────────────────────
function computeBadges(results) {
  const { platformsFetched, totalSolved, bestStreak } = computeDsaMetrics(results)
  const lc = results.leetcode?.status === 'ready' ? results.leetcode.data : null
  const cf = results.codeforces?.status === 'ready' ? results.codeforces.data : null
  const badges = [
    { icon: '🔥', label: '7-Day Streak', earned: bestStreak >= 7 },
    { icon: '💯', label: '100 Problems Solved', earned: totalSolved >= 100 },
    { icon: '🌐', label: '3+ Platforms Linked', earned: platformsFetched.length >= 3 },
    { icon: '🌍', label: 'All 6 Platforms Linked', earned: platformsFetched.length >= 6 },
    { icon: '🧗', label: 'Hard Problem Solved', earned: (lc?.hardSolved || 0) > 0 },
    { icon: '⚔️', label: 'Codeforces Specialist+ (1400+)', earned: (cf?.currentRating || 0) >= 1400 },
    { icon: '📅', label: '30-Day Streak', earned: bestStreak >= 30 },
  ]
  return badges
}

export function AchievementBadges({ results }) {
  const badges = computeBadges(results)
  const earnedCount = badges.filter(b => b.earned).length
  if (badges.every(b => !b.earned) && Object.values(results).every(r => r?.status !== 'ready')) {
    return <div className="dsa-idle">Fetch a profile above to start earning badges.</div>
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
        {badges.map(b => (
          <div key={b.label} style={{
            textAlign: 'center', padding: '12px 8px', borderRadius: 10,
            border: '1px solid var(--border)',
            background: b.earned ? 'var(--bg-card2)' : 'transparent',
            opacity: b.earned ? 1 : 0.35,
          }}>
            <div style={{ fontSize: '1.6rem' }}>{b.icon}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text)', marginTop: 4 }}>{b.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 10 }}>
        {earnedCount} / {badges.length} earned — based on real thresholds against your fetched data.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 11. "vs N days ago" delta — reads the most recent DB snapshot at least
//     7 days old and compares to today's live numbers. Requires the user
//     to be signed in (Clerk) and to have fetched at least once ~7+ days
//     ago, since this is real history, not backfilled/estimated.
// ─────────────────────────────────────────────────────────────────────────
export function ProgressDeltaCard({ results }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const metrics = computeDsaMetrics(results)

  useEffect(() => {
    let cancelled = false
    if (!getClerkUserId()) { setLoaded(true); return }
    fetchDsaSnapshotFromDaysAgo(7)
      .then(s => { if (!cancelled) { setSnapshot(s); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  if (!getClerkUserId()) {
    return <div className="dsa-idle">Sign in to track your progress over time.</div>
  }
  if (metrics.platformsFetched.length === 0) {
    return <div className="dsa-idle">Fetch a profile above to start tracking progress.</div>
  }
  if (!loaded) return <div className="dsa-idle">Loading history…</div>
  if (!snapshot) {
    return <div className="dsa-idle">No snapshot from 7+ days ago yet — come back after a week of fetching to see your delta. Each "Fetch all profiles" click saves a snapshot.</div>
  }

  const solvedDelta = metrics.totalSolved - snapshot.total_solved
  const scoreDelta = metrics.overall - snapshot.consistency_score
  const daysAgo = Math.round((Date.now() - new Date(snapshot.captured_at).getTime()) / 86400000)

  return (
    <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', padding: '8px 0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: solvedDelta >= 0 ? '#22c55e' : '#ef4444' }}>
          {solvedDelta >= 0 ? '+' : ''}{solvedDelta}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>problems solved</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: scoreDelta >= 0 ? '#22c55e' : '#ef4444' }}>
          {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>consistency score</div>
      </div>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', alignSelf: 'center' }}>vs {daysAgo} days ago</div>
    </div>
  )
}

// Called by DsaTrackerPage after a successful "Fetch all profiles" so a
// real snapshot lands in the DB every time — the only way ProgressDeltaCard
// above ever has real history to compare against.
export function recordDsaSnapshot(results) {
  if (!getClerkUserId()) return
  const { overall, totalSolved, bestStreak, platformsFetched } = computeDsaMetrics(results)
  if (platformsFetched.length === 0) return
  saveDsaSnapshot({ totalSolved, bestStreak, consistencyScore: overall })
}

// Called by DsaTrackerPage right alongside recordDsaSnapshot, on every
// successful profile fetch — NOT only when the DSA Leaderboard modal
// happens to be opened. Previously, upsertDsaLeaderboardEntry only ever
// fired from inside DsaLeaderboardList's auto-sync effect below, which
// only mounts once the user opens that modal. That meant a student who
// just fetched a profile on the DSA Tracker page (exactly what the
// Dashboard's own "DSA Progress" empty state tells them to do) never got
// a row written to dsa_leaderboard_entries, so fetchMyDsaStats() on the
// Dashboard kept coming back null and the section stayed stuck on the
// empty state forever. This is the fix: sync on fetch, unconditionally.
export function recordDsaLeaderboardSync(results, displayName) {
  if (!getClerkUserId()) return
  const { overall, totalSolved, bestStreak, platformsFetched } = computeDsaMetrics(results)
  if (platformsFetched.length === 0) return
  return upsertDsaLeaderboardEntry({
    displayName,
    consistencyScore: overall,
    totalSolved,
    bestStreak,
    platformsLinked: platformsFetched.length,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// 12. DSA leaderboard — two ranked views (Consistency Score, Total Solved)
//     over the same opt-in Supabase table.
// ─────────────────────────────────────────────────────────────────────────
// Auto-syncs this user's DSA leaderboard row whenever their metrics change
// (no join button), and renders one ranked list for the given sort order.
// Used inside DsaLeaderboardModal below (once per tab).
function DsaLeaderboardList({ results, sortBy }) {
  const { user } = useAuthUser()
  const displayName = user?.name || 'Student'
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('idle')
  const myUserId = getClerkUserId()
  const metrics = computeDsaMetrics(results)
  const lastSynced = useRef(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await fetchDsaLeaderboard(sortBy)
      setEntries(data)
      setStatus('ready')
    } catch (e) {
      console.error('DSA leaderboard fetch failed:', e)
      setStatus('error')
    }
  }, [sortBy])

  useEffect(() => { load() }, [load])

  // Auto-sync: fires once per meaningfully-changed metric set, regardless
  // of which tab is open — no manual join, no way to leave from the UI.
  useEffect(() => {
    if (!myUserId || metrics.platformsFetched.length === 0) return
    const key = `${displayName}|${metrics.overall}|${metrics.totalSolved}|${metrics.bestStreak}|${metrics.platformsFetched.length}`
    if (lastSynced.current === key) return
    lastSynced.current = key
    upsertDsaLeaderboardEntry({
      displayName,
      consistencyScore: metrics.overall,
      totalSolved: metrics.totalSolved,
      bestStreak: metrics.bestStreak,
      platformsLinked: metrics.platformsFetched.length,
    }).then(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, displayName, metrics.overall, metrics.totalSolved, metrics.bestStreak, metrics.platformsFetched.length])

  const valueKey = sortBy === 'total_solved' ? 'total_solved' : 'consistency_score'
  const avg = entries.length > 0 ? entries.reduce((s, e) => s + Number(e[valueKey]), 0) / entries.length : null

  return (
    <div>
      {metrics.platformsFetched.length === 0 && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1px dashed var(--border)', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Fetch at least one coding profile above to appear here automatically.
        </div>
      )}

      {avg !== null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: 10, borderRadius: 8, background: 'var(--bg-card2)' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Average · {entries.length} student{entries.length > 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 800, color: 'var(--cyan)' }}>{avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1)}</span>
        </div>
      )}

      {status === 'loading' && <div className="dsa-idle">Loading…</div>}
      {status === 'error' && <div className="dsa-error">⚠️ Could not load leaderboard.</div>}
      {status === 'ready' && entries.length === 0 && <div className="dsa-idle">No results yet.</div>}
      {status === 'ready' && entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 300, overflowY: 'auto' }}>
          {entries.map((e, i) => {
            const isMe = e.user_id === myUserId
            return (
              <div key={e.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8,
                background: isMe ? 'rgba(129,140,248,0.12)' : 'var(--bg-card2)',
                border: isMe ? '1px solid var(--cyan)' : '1px solid transparent',
              }}>
                <span style={{ width: 24, textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: i < 3 ? '#f59e0b' : 'var(--text-dim)' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text)', fontWeight: isMe ? 700 : 400 }}>
                  {e.display_name}{isMe && ' (you)'}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--cyan)', fontSize: '0.8rem' }}>{e[valueKey]}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Header-triggered modal — two tabs (Consistency Score / Total Solved) over
// the same auto-synced DSA leaderboard table.
export function DsaLeaderboardModal({ open, onClose, results }) {
  const [tab, setTab] = useState('consistency_score')
  if (!open) return null

  return createPortal(
    <div
      id="dsaLeaderboardSheet"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target.id === 'dsaLeaderboardSheet') onClose() }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>🏆 DSA Leaderboard</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Everyone who's fetched a profile appears here automatically</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 0' }}>
          <button
            onClick={() => setTab('consistency_score')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
              background: tab === 'consistency_score' ? 'var(--cyan)' : 'var(--bg-card2)',
              color: tab === 'consistency_score' ? '#04202a' : 'var(--text)', fontWeight: 700, fontSize: '0.78rem',
            }}
          >
            Consistency Score
          </button>
          <button
            onClick={() => setTab('total_solved')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
              background: tab === 'total_solved' ? 'var(--cyan)' : 'var(--bg-card2)',
              color: tab === 'total_solved' ? '#04202a' : 'var(--text)', fontWeight: 700, fontSize: '0.78rem',
            }}
          >
            Total Solved
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <DsaLeaderboardList results={results} sortBy={tab} />
        </div>
      </div>
    </div>,
    document.body
  )
}


// Header-triggered modal wrapping UpcomingContestsList — same pattern as
// DsaLeaderboardModal, so both live contest info and the leaderboard are
// one tap away from the top of the page instead of buried in the grid.
export function UpcomingContestsModal({ open, onClose }) {
  if (!open) return null

  return createPortal(
    <div
      id="upcomingContestsSheet"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target.id === 'upcomingContestsSheet') onClose() }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>🏆 Upcoming Contests</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Live from Codeforces + LeetCode</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          <UpcomingContestsList />
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AI Roadmap modal — a real Groq completion (see app/ai/coach.py),
// automatically personalized with the student's REAL weakest LeetCode
// tags (same data WeakTopicsList uses above) when available, so the
// roadmap reflects their actual gaps rather than being generic.
// ─────────────────────────────────────────────────────────────────────────
export function AiRoadmapModal({ open, onClose, results }) {
  const [level, setLevel] = useState('beginner')
  const [state, setState] = useState({ status: 'idle' })

  const lc = results.leetcode?.status === 'ready' ? results.leetcode.data : null
  const tc = lc?.tagCounts || {}
  const allTags = [...(tc.fundamental || []), ...(tc.intermediate || []), ...(tc.advanced || [])]
  const weakest = [...allTags].sort((a, b) => a.solved - b.solved).slice(0, 5).map(t => t.tag)

  async function generate() {
    setState({ status: 'loading' })
    try {
      const roadmap = await fetchAiDsaRoadmap(level, weakest)
      setState({ status: 'ready', roadmap })
    } catch (e) {
      setState({ status: 'error', error: e.message || 'Failed to generate roadmap' })
    }
  }

  if (!open) return null

  return createPortal(
    <div
      id="aiRoadmapSheet"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target.id === 'aiRoadmapSheet') onClose() }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>🗺️ AI DSA Roadmap</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              {weakest.length > 0 ? 'Personalized using your real weak LeetCode topics' : 'Fetch LeetCode above for a personalized roadmap'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '0.82rem' }}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <button className="job-apply-btn" onClick={generate} disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {weakest.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 14 }}>
              Using your weak topics: {weakest.join(', ')}
            </div>
          )}

          {state.status === 'idle' && <div className="dsa-idle">Click "Generate" for a prioritized roadmap.</div>}
          {state.status === 'error' && <div className="dsa-error">⚠️ {state.error}</div>}
          {state.status === 'ready' && (
            <div style={{ color: 'var(--text)' }}>
              <FormattedAiText text={state.roadmap} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
