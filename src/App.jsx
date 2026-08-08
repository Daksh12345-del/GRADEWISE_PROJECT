import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { ProtectedRoute } from './lib/ProtectedRoute'
import { ContentProtectedRoute } from './lib/ContentProtectedRoute'
import { loadLiveContent } from './lib/liveContent'
import PageLoader from './pages/components/AppLoader'
import PageTransition from './pages/components/PageTransition'
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

// Separate component so useLocation() has Router context, and so the
// AnimatePresence + location-keyed Routes below re-run their enter/exit
// animation on every navigation, not just on first mount.
function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><LoginPage /></PageTransition>} />
        <Route path="/sso-callback" element={<PageTransition><SsoCallbackPage /></PageTransition>} />
        <Route path="/dashboard" element={<PageTransition><ContentProtectedRoute><DashboardPage /></ContentProtectedRoute></PageTransition>} />
        <Route path="/app" element={<PageTransition><ContentProtectedRoute><AppPage /></ContentProtectedRoute></PageTransition>} />
        <Route path="/analyser" element={<PageTransition><ContentProtectedRoute><AnalyserPage /></ContentProtectedRoute></PageTransition>} />
        <Route path="/resources" element={<PageTransition><ContentProtectedRoute><ResourcesPage /></ContentProtectedRoute></PageTransition>} />
        <Route path="/internships" element={<PageTransition><ProtectedRoute><InternshipsPage /></ProtectedRoute></PageTransition>} />
        <Route path="/placements" element={<PageTransition><ProtectedRoute><PlacementsPage /></ProtectedRoute></PageTransition>} />
        <Route path="/dsa-tracker" element={<PageTransition><ProtectedRoute><DsaTrackerPage /></ProtectedRoute></PageTransition>} />
      </Routes>
    </AnimatePresence>
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
        <AnimatedRoutes />
      </Suspense>
    </BrowserRouter>
  )
}

export default App
