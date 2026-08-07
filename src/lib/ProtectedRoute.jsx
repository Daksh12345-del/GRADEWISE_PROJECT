import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser } from './useAuthUser'

// Wrap any route element in this to require a signed-in Clerk session.
// Centralizing the check here means new pages are protected automatically —
// no page can "forget" to add its own guard the way several pages
// previously did.
//
//   <Route path="/app" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
//
// Behaviour:
//   'checking'        -> show a full-screen loader (avoids a flash of the
//                        protected page before Clerk has resolved the session)
//   'unauthenticated' -> redirect to '/' (login)
//   'authenticated'   -> render the wrapped page
//
// (There used to be an intermediate "complete your profile"
// college/branch/semester step gating this — that step has been removed,
// so authenticated users go straight to the page they asked for.)
export function ProtectedRoute({ children }) {
  const navigate = useNavigate()
  const { status } = useAuthUser()

  useEffect(() => {
    if (status === 'unauthenticated') navigate('/', { replace: true })
  }, [status, navigate])

  if (status === 'checking') {
    return (
      <div
        className="page active"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
      >
        <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return children
}
