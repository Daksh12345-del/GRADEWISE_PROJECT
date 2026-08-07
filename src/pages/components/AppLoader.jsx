import Logo from './Logo'

/**
 * Full-screen branded loading state — used for:
 *  - Suspense fallback while a lazy-loaded page's JS chunk downloads
 *  - Clerk auth resolving / SSO callback
 *  - LiveContentGate waiting on the Supabase content fetch
 *
 * Replaces the old plain grey spinner with something that actually
 * matches the app's look: the real logo, a soft violet/gold aurora glow
 * (same language as the login page background), and a slim indeterminate
 * gradient bar instead of a generic spinning ring.
 */
export default function AppLoader({ text = 'Loading…' }) {
  return (
    <div className="app-loader">
      <div className="app-loader-glow" />
      <div className="app-loader-content">
        <div className="app-loader-logo-wrap">
          <Logo imgClassName="app-loader-logo-img" />
        </div>
        <div className="app-loader-bar">
          <div className="app-loader-bar-fill" />
        </div>
        <p className="app-loader-text">{text}</p>
      </div>
    </div>
  )
}
