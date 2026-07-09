import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, useClerk } from '@clerk/clerk-react'

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

export function useLogout() {
  const navigate = useNavigate()
  const { signOut } = useClerk()
  return useCallback(async () => {
    await signOut()
    localStorage.removeItem('aktu_marks')
    navigate('/')
  }, [navigate, signOut])
}

// Non-hook helper for plain async functions (useMarksData.js, RightPanel.jsx)
// that need the current user's id outside of a React component. Safe to call
// any time after ClerkProvider has mounted — returns null if signed out.
export function getClerkUserId() {
  return window.Clerk?.user?.id ?? null
}
