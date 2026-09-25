import { Fragment, useState } from 'react'
import { useAuthUser } from './useAuthUser'
import { setActiveScheme } from './schemes'
import { SCHEME_INFO } from './gradesData'

// Activates the grading scheme (grade scale, credits, semesters, marks rules)
// that belongs to the signed-in student's university/branch, BEFORE any page
// below it renders. Lives inside <LiveContentGate> (so scheme data has loaded)
// and above <GradesProvider> (so marks are read against the right semesters).
//
// setActiveScheme() is idempotent and cheap — it only rewrites the shared
// GRADING / SEMESTERS / GRADE_RULES objects when the scheme really changes.
// The returned key remounts the subtree if it ever does (e.g. a different
// account signs in without a page reload), so no stale grades are shown.
export function SchemeGate({ children }) {
  const { user } = useAuthUser()
  const key = setActiveScheme(user?.university, user?.branch)
  const [dismissed, setDismissed] = useState(false)

  let notice = ''
  if (SCHEME_INFO.missing) {
    notice = `No grading scheme is configured for ${SCHEME_INFO.universityCode} yet — showing the default scheme.`
  } else if (SCHEME_INFO.approximate) {
    notice = `Showing the "${SCHEME_INFO.label}" scheme. A dedicated ${SCHEME_INFO.branch || 'branch'} scheme isn't added yet, so some subjects/credits may differ from your syllabus.`
  }

  return (
    <>
      <Fragment key={key}>{children}</Fragment>
      {notice && !dismissed && (
        <div
          role="status"
          style={{
            position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 9999,
            maxWidth: 'min(560px, calc(100vw - 24px))', padding: '10px 14px', borderRadius: 12,
            background: 'var(--bg-card2, #1e293b)', color: 'var(--text, #e2e8f0)',
            border: '1px solid #f59e0b', boxShadow: '0 8px 30px rgba(0,0,0,.35)',
            fontSize: '0.78rem', lineHeight: 1.45, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}
        >
          <span>ℹ️ {notice}</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
