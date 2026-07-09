import { createContext, useContext, useEffect, useState } from 'react'
import { loadLiveContent, reloadLiveContent, subscribeLiveContent, getLiveContentVersion, getLiveContentStatus } from './liveContent'

const LiveContentVersionContext = createContext(0)

// Mount this once near the app root. It blocks rendering of `children`
// until live content has actually loaded from Supabase (status: 'ready').
// There is no bundled fallback data anymore, so pages can't safely render
// before this resolves — showing a loading screen (and a retry screen on
// failure) here is the only gate that matters; individual pages don't
// need their own loading logic for this data.
export function LiveContentGate({ children }) {
  const [state, setState] = useState(() => ({
    version: getLiveContentVersion(),
    ...getLiveContentStatus(),
  }))

  useEffect(() => {
    const unsubscribe = subscribeLiveContent(setState)
    loadLiveContent().catch(() => { /* status is already reflected via setState */ })
    return unsubscribe
  }, [])

  if (state.status === 'ready') {
    return (
      <LiveContentVersionContext.Provider value={state.version}>
        {children}
      </LiveContentVersionContext.Provider>
    )
  }

  if (state.status === 'error') {
    return (
      <div style={errorWrapStyle}>
        <div style={errorCardStyle}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Couldn't load site content</h2>
          <p style={{ margin: '0 0 16px', opacity: 0.75, fontSize: 14, lineHeight: 1.5 }}>
            {state.error || 'Something went wrong talking to the database.'}
          </p>
          <button
            onClick={() => reloadLiveContent().catch(() => {})}
            style={retryButtonStyle}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // status === 'idle' | 'loading'
  return (
    <div style={errorWrapStyle}>
      <div style={{ ...errorCardStyle, textAlign: 'center' }}>
        <div style={spinnerStyle} />
        <p style={{ margin: '16px 0 0', opacity: 0.75, fontSize: 14 }}>Loading…</p>
      </div>
      <style>{`@keyframes gw-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const errorWrapStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0b0b12',
  padding: 24,
}

const errorCardStyle = {
  maxWidth: 420,
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 28,
  color: '#e5e5f0',
  textAlign: 'center',
}

const retryButtonStyle = {
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const spinnerStyle = {
  width: 32,
  height: 32,
  margin: '0 auto',
  border: '3px solid rgba(255,255,255,0.15)',
  borderTopColor: '#7c3aed',
  borderRadius: '50%',
  animation: 'gw-spin 0.8s linear infinite',
}

// Use as a dependency in useMemo/useEffect for any derived data built from
// SEMESTERS / VIDEO_DATA / PYQ_LINKS / SUBJECT_NOTES / SUBJECT_KB /
// COLLEGES_BY_CITY / BRANCHES / DOMAIN_GROUPS. By the time children render
// under the gate, this is already the "ready" version, but pages that
// memoize derived data still need it as a dep so they recompute on retry.
export function useLiveContentVersion() {
  return useContext(LiveContentVersionContext)
}
