// Shared light/dark theme toggle button — previously copy-pasted with
// identical markup across 6 different pages (Analyser, Dashboard,
// DsaTracker, Internships, Placements, Resources). Consolidating it here
// means any future change (styling, wording, new theme option) only needs
// to happen once instead of being hand-applied to every page and risking
// them drifting out of sync (which is exactly how the aria-label ended up
// present on some copies and missing on others before).
export default function ThemeToggleButton({ isLight, toggleTheme, title = 'Toggle theme' }) {
  return (
    <button className="theme-toggle" onClick={toggleTheme} title={title} aria-label="Toggle light and dark theme">
      <div className="toggle-thumb">{isLight ? '☀️' : '🌙'}</div>
    </button>
  )
}
