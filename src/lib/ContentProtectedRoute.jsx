import { ProtectedRoute } from './ProtectedRoute'
import { LiveContentGate } from './LiveContentGate'
import { GradesProvider } from './GradesContext'

// For routes that need both a signed-in session AND the CMS-sourced
// content (SEMESTERS / VIDEO_DATA / PYQ_LINKS / SUBJECT_NOTES / SUBJECT_KB)
// to already be loaded before they render. Auth is checked first — an
// unauthenticated visitor gets redirected immediately without ever waiting
// on the Supabase content fetch.
export function ContentProtectedRoute({ children }) {
  return (
    <ProtectedRoute>
      <LiveContentGate>
        <GradesProvider>
          {children}
        </GradesProvider>
      </LiveContentGate>
    </ProtectedRoute>
  )
}
