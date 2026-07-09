import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AppPage from './pages/AppPage'
import AnalyserPage from './pages/AnalyserPage'
import ResourcesPage from './pages/ResourcesPage'
import InternshipsPage from './pages/InternshipsPage'
import PlacementsPage from './pages/PlacementsPage'
import DsaTrackerPage from './pages/DsaTrackerPage'
import { GradesProvider } from './lib/GradesContext'
import { LiveContentGate } from './lib/LiveContentGate'
import './styles/style.css'

function App() {
  return (
    <LiveContentGate>
    <GradesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/app" element={<AppPage />} />
          <Route path="/analyser" element={<AnalyserPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/internships" element={<InternshipsPage />} />
          <Route path="/placements" element={<PlacementsPage />} />
          <Route path="/dsa-tracker" element={<DsaTrackerPage />} />
        </Routes>
      </BrowserRouter>
    </GradesProvider>
    </LiveContentGate>
  )
}

export default App
