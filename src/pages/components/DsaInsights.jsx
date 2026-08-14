import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { fetchUpcomingContests } from '../../lib/api'

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
  const platformsFetched = ['leetcode', 'codeforces', 'codechef', 'gfg', 'hackerrank', 'github']
    .filter(p => results[p]?.status === 'ready')

  if (platformsFetched.length === 0) {
    return <div className="dsa-idle">Fetch at least one profile above to see your consistency score.</div>
  }

  const lc = results.leetcode?.status === 'ready' ? results.leetcode.data : null
  const gh = results.github?.status === 'ready' ? results.github.data : null
  const gfg = results.gfg?.status === 'ready' ? results.gfg.data : null

  // Axis 1 — Streak: best current streak across sources that expose one, capped at 30 days.
  const bestStreak = Math.max(lc?.streak || 0, gh?.streak || 0, gfg?.streak || 0)
  const streakScore = Math.min(100, Math.round((bestStreak / 30) * 100))

  // Axis 2 — Platform coverage: how many of the 6 supported platforms have data.
  const coverageScore = Math.round((platformsFetched.length / 6) * 100)

  // Axis 3 — Difficulty mix: weighted toward harder LeetCode problems (only if LeetCode fetched).
  let difficultyScore = 0
  if (lc && lc.totalSolved > 0) {
    const weighted = (lc.easySolved || 0) * 1 + (lc.mediumSolved || 0) * 2 + (lc.hardSolved || 0) * 3
    difficultyScore = Math.min(100, Math.round((weighted / (lc.totalSolved * 3)) * 100))
  }

  // Axis 4 — Volume: total problems solved across LeetCode + GFG + CodeChef, capped at 300.
  const cc = results.codechef?.status === 'ready' ? results.codechef.data : null
  const totalSolved = (lc?.totalSolved || 0) + (gfg?.totalSolved || 0) + (cc?.totalSolved || 0)
  const volumeScore = Math.min(100, Math.round((totalSolved / 300) * 100))

  const data = [
    { axis: 'Streak', value: streakScore },
    { axis: 'Coverage', value: coverageScore },
    { axis: 'Difficulty Mix', value: difficultyScore },
    { axis: 'Volume', value: volumeScore },
  ]
  const overall = Math.round(data.reduce((s, d) => s + d.value, 0) / data.length)

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
  codeforces: { label: 'Codeforces', color: '#3b82f6', icon: '🔷' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
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
