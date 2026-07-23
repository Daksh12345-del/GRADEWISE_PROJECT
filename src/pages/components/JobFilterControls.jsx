// Shared domain-tabs + work-mode + sort-by filter controls — previously
// duplicated almost verbatim between InternshipsPage and PlacementsPage.
// The only real difference between the two pages was the wording of the
// "highest X" sort option (stipend vs package) and the sort dropdown's
// aria-label, both handled here via props.
export default function JobFilterControls({
  domains, domain, setDomain,
  workMode, setWorkMode,
  sortBy, setSortBy,
  highLabel, sortAriaLabel,
}) {
  const selectStyle = {
    background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '7px 10px', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer',
  }

  return (
    <>
      <div className="job-filter-tabs">
        {domains.map(d => (
          <button key={d} className={`res-sem-tab ${domain === d ? 'active' : ''}`} onClick={() => setDomain(d)}>
            {d === 'all' ? 'All' : d.toUpperCase()}
          </button>
        ))}
      </div>
      <select
        value={workMode}
        onChange={e => setWorkMode(e.target.value)}
        aria-label="Filter by work mode"
        style={selectStyle}
      >
        <option value="all">All work modes</option>
        <option value="remote">🏠 Remote only</option>
        <option value="hybrid">🔀 Hybrid only</option>
        <option value="onsite">🏢 On-site only</option>
      </select>
      <select
        value={sortBy}
        onChange={e => setSortBy(e.target.value)}
        aria-label={sortAriaLabel}
        style={selectStyle}
      >
        <option value="newest">🆕 Newest first</option>
        <option value="stipend_high">💰 {highLabel}</option>
      </select>
    </>
  )
}
