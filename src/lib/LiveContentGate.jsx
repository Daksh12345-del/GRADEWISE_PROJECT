import { createContext, useContext, useEffect, useState } from 'react'
import { loadLiveContent, reloadLiveContent, subscribeLiveContent, getLiveContentVersion, getLiveContentStatus } from './liveContent'
import AppLoader from '../pages/components/AppLoader'

const LiveContentVersionContext = createContext(0)

// Mount this once near the app root. It blocks rendering of `children`
// until live content has actually loaded — either fresh from Supabase, OR
// from the IndexedDB cache written by a previous successful load (see
// liveContent.js). Only when there is NEITHER does it show the full-page
// error/retry screen; a `stale: true` cache hit instead renders `children`
// immediately with a small dismissible "showing cached data" banner, so a
// student on spotty hostel Wi-Fi can still see their CGPA and notes.
export function LiveContentGate({ children }) {
  const [state, setState] = useState(() => ({
    version: getLiveContentVersion(),
    ...getLiveContentStatus(),
  }))
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeLiveContent(setState)
    loadLiveContent().catch(() => { /* status is already reflected via setState */ })
    return unsubscribe
  }, [])

  if (state.status === 'ready') {
    return (
      <LiveContentVersionContext.Provider value={state.version}>
        {state.stale && !bannerDismissed && (
          <OfflineBanner
            savedAt={state.cacheAppliedAt}
            onRetry={() => reloadLiveContent().catch(() => {})}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}
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
  return <AppLoader text="Loading…" />
}

function OfflineBanner({ savedAt, onRetry, onDismiss }) {
  const [retrying, setRetrying] = useState(false)
  const ageLabel = formatAge(savedAt)

  return (
    <div style={bannerStyle}>
      <span style={{ fontSize: 15 }}>📴</span>
      <span style={{ flex: 1 }}>
        You're offline — showing your last synced data{ageLabel ? ` (${ageLabel})` : ''}.
      </span>
      <button
        style={bannerBtnStyle}
        disabled={retrying}
        onClick={() => {
          setRetrying(true)
          Promise.resolve(onRetry()).finally(() => setRetrying(false))
        }}
      >
        {retrying ? 'Checking…' : 'Retry'}
      </button>
      <button style={bannerDismissStyle} onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  )
}

function formatAge(savedAt) {
  if (!savedAt) return ''
  const mins = Math.round((Date.now() - savedAt) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
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

const bannerStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 700,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 16px',
  background: '#7c3aed',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
}

const bannerBtnStyle = {
  background: 'rgba(255,255,255,0.18)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const bannerDismissStyle = {
  background: 'transparent',
  color: '#fff',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
  opacity: 0.8,
  padding: '2px 4px',
}

// Use as a dependency in useMemo/useEffect for any derived data built from
// SEMESTERS / VIDEO_DATA / PYQ_LINKS / SUBJECT_NOTES / SUBJECT_KB /
// COLLEGES_BY_CITY / BRANCHES / DOMAIN_GROUPS. By the time children render
// under the gate, this is already the "ready" version, but pages that
// memoize derived data still need it as a dep so they recompute on retry.
export function useLiveContentVersion() {
  return useContext(LiveContentVersionContext)
}
