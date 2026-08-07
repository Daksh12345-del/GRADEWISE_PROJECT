import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { ProtectedRoute } from './lib/ProtectedRoute'
import { ContentProtectedRoute } from './lib/ContentProtectedRoute'
import { loadLiveContent } from './lib/liveContent'
import PageLoader from './pages/components/AppLoader'
import './styles/style.css'

// Lazy load all pages — they'll only load when the user actually visits them,
// which makes the very first load of the site much faster.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const AppPage = lazy(() => import('./pages/AppPage'))
const AnalyserPage = lazy(() => import('./pages/AnalyserPage'))
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'))
const InternshipsPage = lazy(() => import('./pages/InternshipsPage'))
const PlacementsPage = lazy(() => import('./pages/PlacementsPage'))
const DsaTrackerPage = lazy(() => import('./pages/DsaTrackerPage'))

// Dedicated component for the SSO callback route so the message is specific.
function SsoCallbackPage() {
  return (
    <>
      <PageLoader text="Signing you in..." />
      <AuthenticateWithRedirectCallback />
    </>
  )
}

function App() {
  // Kick off the CMS content fetch as soon as the app mounts, in parallel
  // with everything else — it's memoized, so this is the same fetch that
  // ContentProtectedRoute's LiveContentGate will wait on later. Starting it
  // here means by the time a user finishes logging in, it has likely
  // already finished, instead of only starting once they reach a gated page.
  useEffect(() => {
    loadLiveContent().catch(() => { /* surfaced by LiveContentGate where needed */ })
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/sso-callback" element={<SsoCallbackPage />} />
          <Route path="/dashboard" element={<ContentProtectedRoute><DashboardPage /></ContentProtectedRoute>} />
          <Route path="/app" element={<ContentProtectedRoute><AppPage /></ContentProtectedRoute>} />
          <Route path="/analyser" element={<ContentProtectedRoute><AnalyserPage /></ContentProtectedRoute>} />
          <Route path="/resources" element={<ContentProtectedRoute><ResourcesPage /></ContentProtectedRoute>} />
          <Route path="/internships" element={<ProtectedRoute><InternshipsPage /></ProtectedRoute>} />
          <Route path="/placements" element={<ProtectedRoute><PlacementsPage /></ProtectedRoute>} />
          <Route path="/dsa-tracker" element={<ProtectedRoute><DsaTrackerPage /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
