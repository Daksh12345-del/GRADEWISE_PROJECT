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
    }
  }, [isSignedIn, clerkUser])

  const status = !isLoaded ? 'checking' : (isSignedIn ? 'authenticated' : 'unauthenticated')

  return { user, status }
}

// A profile is "complete" once the fields LoginPage.jsx's single-step
// signup form actually collects (university, course, college, branch)
// are filled in. Login is one page, one step — no separate onboarding
// step after it, so this only checks what that one page can produce.
//
// NOTE: roll number / domain of interest / AKTU batch group are NOT
// collected anywhere anymore and are intentionally not required here.
// Any dashboard feature reading user.roll / user.domain / user.group
// will see '' for every user until/unless those get collected some
// other way — that's expected, not a bug, given this page's fields.
export function isProfileComplete(user) {
  if (!user) return false
  if (!user.university || !user.course || !user.college || !user.branch) {
    return false
  }
  return true
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
