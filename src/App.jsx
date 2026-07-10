import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { GradesProvider } from './lib/GradesContext'
import { LiveContentGate } from './lib/LiveContentGate'
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

// Simple full-screen loader shown while a lazy page or the SSO callback is loading.
function PageLoader({ text = 'Loading...' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw',
        background: '#0a0a0f', // match your dark theme background
        color: '#ffffff',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(255,255,255,0.15)',
          borderTopColor: '#7c3aed', // adjust to your brand accent color
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: '14px', opacity: 0.75 }}>{text}</p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

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
  return (
    <LiveContentGate>
      <GradesProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/sso-callback" element={<SsoCallbackPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/app" element={<AppPage />} />
              <Route path="/analyser" element={<AnalyserPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/internships" element={<InternshipsPage />} />
              <Route path="/placements" element={<PlacementsPage />} />
              <Route path="/dsa-tracker" element={<DsaTrackerPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </GradesProvider>
    </LiveContentGate>
  )
}

export default App
