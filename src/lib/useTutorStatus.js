import { useState, useEffect } from 'react'
import { useAuthUser } from './useAuthUser'
import { fetchTutorDashboard } from './api'
import { getCachedTutorStatus, setCachedTutorStatus } from './tutorStatusCache'

/**
 * Returns { hasProfile, approvalStatus, loading }:
 *   hasProfile     — true once this user has ever applied to tutor
 *   approvalStatus — null | 'pending' | 'approved' | 'rejected'
 *
 * Used to keep the Tutor Dashboard out of the way for plain students —
 * it only shows up as a real nav item once someone has actually applied,
 * instead of being thrust in front of every logged-in user.
 */
export function useTutorStatus() {
  const { user } = useAuthUser()
  const [state, setState] = useState(() => {
    const cached = user ? getCachedTutorStatus(user.id) : null
    return cached || { hasProfile: false, approvalStatus: null, loading: !!user }
  })

  useEffect(() => {
    if (!user) {
      setState({ hasProfile: false, approvalStatus: null, loading: false })
      return
    }
    const cached = getCachedTutorStatus(user.id)
    if (cached) {
      setState({ ...cached, loading: false })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    fetchTutorDashboard(user.id)
      .then(res => {
        if (cancelled) return
        const next = { hasProfile: !!res.profile, approvalStatus: res.profile?.approval_status || null, loading: false }
        setState(next)
        setCachedTutorStatus(user.id, next)
      })
      .catch(() => {
        if (!cancelled) setState({ hasProfile: false, approvalStatus: null, loading: false })
      })
    return () => { cancelled = true }
  }, [user?.id])

  return state
}
