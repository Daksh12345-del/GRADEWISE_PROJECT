import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser, isProfileComplete } from './useAuthUser'

// Wrap any route element in this to require a signed-in Clerk session.
// Centralizing the check here means new pages are protected automatically —
// no page can "forget" to add its own guard the way several pages
// previously did.
//
//   <Route path="/app" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
//
// Behaviour:
//   'checking'       -> show a full-screen loader (avoids a flash of the
//                        protected page before Clerk has resolved the session)
//   'unauthenticated' -> redirect to '/' (login)
//   authenticated but incomplete profile (OAuth users — see
//                       useAuthUser.js's isProfileComplete) -> redirect to
//                       '/complete-profile' instead of rendering the page
//   'authenticated' + complete -> render the wrapped page
export function ProtectedRoute({ children }) {
  const navigate = useNavigate()
  const { user, status } = useAuthUser()
  const profileOk = status === 'authenticated' ? isProfileComplete(user) : true

  useEffect(() => {
    if (status === 'unauthenticated') navigate('/', { replace: true })
    else if (status === 'authenticated' && !profileOk) navigate('/complete-profile', { replace: true })
  }, [status, profileOk, navigate])

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
  if (status === 'authenticated' && !profileOk) return null

  return children
}
