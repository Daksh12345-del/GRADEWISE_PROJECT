// Shared helpers for the Internships & Placements pages.
// Classifies each listing as remote / hybrid / on-site and rolls up
// aggregate stats used by <JobStatsBar />.

/**
 * The backend only gives us a boolean `is_remote` — there's no explicit
 * hybrid flag from any of the source APIs (Internshala/JSearch/Remotive/
 * Adzuna/Jobicy/Arbeitnow). We infer "hybrid" from the text instead, and
 * treat everything else as on-site or remote based on is_remote.
 */
export function classifyWorkMode(item) {
  const text = `${item.location || ''} ${item.title || ''} ${item.description || ''}`.toLowerCase()
  if (text.includes('hybrid')) return 'hybrid'
  if (item.is_remote) return 'remote'
  return 'onsite'
}

export const WORK_MODE_META = {
  remote: { label: 'Remote', emoji: '🏠', color: '#10b981' },
  hybrid: { label: 'Hybrid', emoji: '🔀', color: '#f59e0b' },
  onsite: { label: 'On-site', emoji: '🏢', color: '#a78bfa' },
}

/**
 * Days remaining until a listing's expiry_date. Returns null if there's no
 * usable expiry_date on the item (some sources don't send one).
 */
export function daysUntilExpiry(item) {
  if (!item.expiry_date) return null
  const exp = new Date(item.expiry_date)
  if (isNaN(exp)) return null
  const days = Math.ceil((exp.getTime() - Date.now()) / 86400000)
  return days
}

/** true when a listing expires within the next 3 days (and hasn't already expired) */
export function isClosingSoon(item) {
  const days = daysUntilExpiry(item)
  return days !== null && days >= 0 && days <= 3
}

export const SORTERS = {
  newest: (a, b) => new Date(b.posted_date || 0) - new Date(a.posted_date || 0),
  stipend_high: (a, b) => (Number(b.stipend ?? b.salary) || 0) - (Number(a.stipend ?? a.salary) || 0),
}

export function computeJobStats(items) {
  const stats = { total: items.length, remote: 0, hybrid: 0, onsite: 0, newThisWeek: 0 }
  const companyCount = {}
  const now = Date.now()

  for (const item of items) {
    stats[classifyWorkMode(item)]++

    if (item.company) {
      companyCount[item.company] = (companyCount[item.company] || 0) + 1
    }

    if (item.posted_date) {
      const posted = new Date(item.posted_date)
      if (!isNaN(posted) && now - posted.getTime() <= 7 * 86400000) {
        stats.newThisWeek++
      }
    }
  }

  stats.topCompanies = Object.entries(companyCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([company, count]) => ({ company, count }))

  return stats
}
