import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, useClerk } from '@clerk/clerk-react'
import { clearCurrentUserMarksCache } from './useMarksData'
export { getClerkUserId } from './clerkUser'

// Auth now lives in Clerk instead of Supabase Auth. This hook keeps the same
// shape callers already depend on — { user, status } — so pages that guard
// routes with `if (status === 'unauthenticated') navigate('/')` don't need
// to change at all.
//
// `user` is reshaped from Clerk's user object into the flat shape the app's
// UI already expects (user.name, user.group, ...) — those custom onboarding
// fields (college, roll, branch, group, domain, ...) are stored in Clerk's
// `unsafeMetadata` at sign-up (see LoginPage.jsx) and read back out here.
//
// `status` is 'checking' | 'authenticated' | 'unauthenticated', same as
// before, driven by Clerk's `isLoaded`/`isSignedIn`.
export function useAuthUser() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser()

  const user = useMemo(() => {
    if (!isSignedIn || !clerkUser) return null
    const meta = clerkUser.unsafeMetadata || {}
    return {
      id: clerkUser.id,
      name: meta.name || clerkUser.fullName || clerkUser.firstName || 'Student',
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      university: meta.university || '',
      course: meta.course || '',
      college: meta.college || '',
      roll: meta.roll || '',
      branch: meta.branch || '',
      domain: meta.domain || '',
      group: meta.group || '',
      targetRole: meta.targetRole || '',
    }
  }, [isSignedIn, clerkUser])

  const status = !isLoaded ? 'checking' : (isSignedIn ? 'authenticated' : 'unauthenticated')

  return { user, status }
}

export function useLogout() {
  const navigate = useNavigate()
  const { signOut } = useClerk()
  return useCallback(async () => {
    // Clear this user's own cached marks before signing out — signOut()
    // invalidates the session, after which getClerkUserId() would no
    // longer resolve to the right key.
    clearCurrentUserMarksCache()
    await signOut()
    navigate('/')
  }, [navigate, signOut])
}

// Lets a student set/update their target career role (e.g. "SDE",
// "Data Analyst") from the "Ask GradeWallah AI" widget — stored in Clerk
// so it's remembered across sessions and feeds into the AI Coach's
// student-context, same pattern as useSetUserGroup above.
export function useSetTargetRole() {
  const { user: clerkUser } = useUser()
  return useCallback(async (targetRole) => {
    if (!clerkUser) return
    try {
      await clerkUser.update({
        unsafeMetadata: { ...(clerkUser.unsafeMetadata || {}), targetRole: (targetRole || '').trim().slice(0, 80) },
      })
    } catch (e) {
      console.error('Failed to update target role:', e)
    }
  }, [clerkUser])
}

// Lets the PDF scanner set/correct the student's batch group (A/B) from
// hard evidence found on their own result sheet, instead of relying on
// whatever's stored (which may be blank, since sign-up no longer asks).
// Always overwrites — a freshly-scanned, unambiguous detection is more
// trustworthy than a stale or missing stored value.
export function useSetUserGroup() {
  const { user: clerkUser } = useUser()
  return useCallback(async (group) => {
    if (!clerkUser || (group !== 'A' && group !== 'B')) return
    try {
      await clerkUser.update({
        unsafeMetadata: { ...(clerkUser.unsafeMetadata || {}), group },
      })
    } catch (e) {
      console.error('Failed to update batch group:', e)
    }
  }, [clerkUser])
}
