import { WORK_MODE_META } from '../../lib/jobStats'
import { StaggerGroup, StaggerItem, AnimatedNumber } from './motionKit'

/**
 * Top-of-page overview strip for Internships & Placements.
 * - 4 headline stat cards (Total / Remote / Hybrid / On-site)
 * - a segmented proportion bar (quick visual read of the split)
 * - a "trending companies" chip row (skip if too little data)
 *
 * `moneyLabel` + `avgMoney` let the caller show "Avg Stipend" (internships)
 * or "Avg Salary" (placements) as a 5th card without duplicating markup.
 */
export default function JobStatsBar({ stats, moneyLabel, avgMoney, loading }) {
  if (loading) {
    return (
      <div className="job-stats-bar">
        {[0, 1, 2, 3].map(i => <div key={i} className="job-stat-card job-stat-skel" />)}
      </div>
    )
  }

  const { total, remote, hybrid, onsite, newThisWeek, topCompanies } = stats
  const pct = n => (total > 0 ? Math.round((n / total) * 100) : 0)

  const cards = [
    { key: 'total', label: 'Total Listings', value: total, sub: newThisWeek > 0 ? `+${newThisWeek} new this week` : 'Live right now', color: '#8b5cf6', emoji: '📊' },
    { key: 'remote', label: WORK_MODE_META.remote.label, value: remote, sub: `${pct(remote)}% of listings`, color: WORK_MODE_META.remote.color, emoji: WORK_MODE_META.remote.emoji },
    { key: 'hybrid', label: WORK_MODE_META.hybrid.label, value: hybrid, sub: `${pct(hybrid)}% of listings`, color: WORK_MODE_META.hybrid.color, emoji: WORK_MODE_META.hybrid.emoji },
    { key: 'onsite', label: WORK_MODE_META.onsite.label, value: onsite, sub: `${pct(onsite)}% of listings`, color: WORK_MODE_META.onsite.color, emoji: WORK_MODE_META.onsite.emoji },
  ]

  if (moneyLabel && avgMoney) {
    cards.push({ key: 'money', label: moneyLabel, value: avgMoney, sub: 'Across disclosed listings', color: '#06b6d4', emoji: '💰' })
  }

  return (
    <div className="job-stats-wrap">
      <StaggerGroup className="job-stats-bar">
        {cards.map(c => (
          <StaggerItem key={c.key} className="job-stat-card">
            <div className="job-stat-top">
              <span className="job-stat-emoji" style={{ background: c.color + '1a', color: c.color }}>{c.emoji}</span>
              <span className="job-stat-lbl">{c.label}</span>
            </div>
            <div className="job-stat-val" style={{ color: c.color }}>
              {c.key === 'money' ? c.value : <AnimatedNumber value={c.value} />}
            </div>
            <div className="job-stat-sub">{c.sub}</div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {total > 0 && (
        <div className="job-mode-bar" title={`${remote} remote · ${hybrid} hybrid · ${onsite} on-site`}>
          <div className="job-mode-seg" style={{ width: `${pct(remote)}%`, background: WORK_MODE_META.remote.color }} />
          <div className="job-mode-seg" style={{ width: `${pct(hybrid)}%`, background: WORK_MODE_META.hybrid.color }} />
          <div className="job-mode-seg" style={{ width: `${pct(onsite)}%`, background: WORK_MODE_META.onsite.color }} />
        </div>
      )}

      {topCompanies && topCompanies.length > 1 && (
        <div className="job-trending-row">
          <span className="job-trending-lbl">🔥 Trending:</span>
          {topCompanies.map(tc => (
            <span key={tc.company} className="job-trending-chip">{tc.company} <b>×{tc.count}</b></span>
          ))}
        </div>
      )}
    </div>
  )
}
