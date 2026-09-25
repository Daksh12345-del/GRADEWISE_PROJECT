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
//   'authenticated' but no university/college/branch yet (typical for a first
//                       Google/GitHub sign-in) -> redirect to /complete-profile,
//                       so every student's university is known before they see
//                       any grades (the university decides the grading system).
//                       The /complete-profile route itself passes
//                       `allowIncompleteProfile`.
export function ProtectedRoute({ children, allowIncompleteProfile = false }) {
  const navigate = useNavigate()
  const { status, profileComplete } = useAuthUser()
  const needsProfile = status === 'authenticated' && !profileComplete && !allowIncompleteProfile

  useEffect(() => {
    if (status === 'unauthenticated') navigate('/', { replace: true })
    else if (needsProfile) navigate('/complete-profile', { replace: true })
  }, [status, needsProfile, navigate])

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

  if (status === 'unauthenticated' || needsProfile) return null

  return children
}
