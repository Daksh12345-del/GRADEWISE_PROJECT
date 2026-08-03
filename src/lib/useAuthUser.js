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

// A profile is "complete" once every field the rest of the app relies on
// (roll number, college, branch, domain, and batch group for AKTU) has
// actually been filled in. The password/OTP signup flow in LoginPage.jsx
// always sets all of these before creating the account — but the OAuth
// (Google/GitHub) flow skips that form entirely, so an OAuth user can be
// signed in with none of this set. ProtectedRoute uses this to redirect
// those users to /complete-profile before they can reach any real page.
export function isProfileComplete(user) {
  if (!user) return false
  if (!user.university || !user.course || !user.college || !user.roll || !user.branch || !user.domain) {
    return false
  }
  if (user.university === 'AKTU' && !user.group) return false
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

