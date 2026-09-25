import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { ProtectedRoute } from './lib/ProtectedRoute'
import { ContentProtectedRoute } from './lib/ContentProtectedRoute'
import { LiveContentGate } from './lib/LiveContentGate'
import { ErrorBoundary } from './lib/ErrorBoundary'
import { loadLiveContent } from './lib/liveContent'
import PageLoader from './pages/components/AppLoader'
import PageTransition from './pages/components/PageTransition'
import './styles/style.css'

// Lazy load all pages — they'll only load when the user actually visits them,
// which makes the very first load of the site much faster.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ProfileSetupPage = lazy(() => import('./pages/ProfileSetupPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const AppPage = lazy(() => import('./pages/AppPage'))
const AnalyserPage = lazy(() => import('./pages/AnalyserPage'))
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'))
const InternshipsPage = lazy(() => import('./pages/InternshipsPage'))
const PlacementsPage = lazy(() => import('./pages/PlacementsPage'))
const DsaTrackerPage = lazy(() => import('./pages/DsaTrackerPage'))
const AiCoachPage = lazy(() => import('./pages/AiCoachPage'))
const ResumeCheckerPage = lazy(() => import('./pages/ResumeCheckerPage'))
const TuitionPage = lazy(() => import('./pages/TuitionPage'))

// Dedicated component for the SSO callback route so the message is specific.
function SsoCallbackPage() {
  return (
    <>
      <PageLoader text="Signing you in..." />
      <AuthenticateWithRedirectCallback />
    </>
  )
}

// Separate component just to keep the route list readable — no AnimatePresence
// / location-keyed remounting here. That combo can hang mid-transition with
// lazy(Suspense)-loaded pages (the exit-complete signal doesn't always fire
// cleanly), so each page instead animates itself in on mount via
// PageTransition below, with no coordination with the previous page's exit.
// Each route gets its OWN ErrorBoundary (in addition to the top-level one in
// main.jsx). Previously a single global boundary meant a crash on any one
// page — say, a bad response shape in DsaTrackerPage — tore down the entire
// React tree (BrowserRouter, ClerkProvider, everything), forcing a full
// reload just to get back to a page that was working fine. Scoping the
// boundary per-route keeps that failure local to the page that broke.
function withBoundary(element) {
  return <ErrorBoundary>{element}</ErrorBoundary>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={withBoundary(<PageTransition><LoginPage /></PageTransition>)} />
      <Route path="/sso-callback" element={withBoundary(<PageTransition><SsoCallbackPage /></PageTransition>)} />
      <Route path="/complete-profile" element={withBoundary(<PageTransition><ProtectedRoute allowIncompleteProfile><LiveContentGate><ProfileSetupPage /></LiveContentGate></ProtectedRoute></PageTransition>)} />
      <Route path="/dashboard" element={withBoundary(<ContentProtectedRoute><DashboardPage /></ContentProtectedRoute>)} />
      <Route path="/app" element={withBoundary(<PageTransition><ContentProtectedRoute><AppPage /></ContentProtectedRoute></PageTransition>)} />
      <Route path="/analyser" element={withBoundary(<PageTransition><ContentProtectedRoute><AnalyserPage /></ContentProtectedRoute></PageTransition>)} />
      <Route path="/resources" element={withBoundary(<PageTransition><ContentProtectedRoute><ResourcesPage /></ContentProtectedRoute></PageTransition>)} />
      <Route path="/internships" element={withBoundary(<PageTransition><ProtectedRoute><InternshipsPage /></ProtectedRoute></PageTransition>)} />
      <Route path="/placements" element={withBoundary(<PageTransition><ProtectedRoute><PlacementsPage /></ProtectedRoute></PageTransition>)} />
      <Route path="/dsa-tracker" element={withBoundary(<PageTransition><ProtectedRoute><DsaTrackerPage /></ProtectedRoute></PageTransition>)} />
      <Route path="/ai-coach" element={withBoundary(<PageTransition><ContentProtectedRoute><AiCoachPage /></ContentProtectedRoute></PageTransition>)} />
      <Route path="/resume-checker" element={withBoundary(<PageTransition><ContentProtectedRoute><ResumeCheckerPage /></ContentProtectedRoute></PageTransition>)} />
      <Route path="/tuition" element={withBoundary(<PageTransition><ProtectedRoute><TuitionPage /></ProtectedRoute></PageTransition>)} />
    </Routes>
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
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  )
}

export default App
