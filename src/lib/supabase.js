import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Auth is now handled by Clerk, not Supabase Auth. Supabase is used purely
// as a database — every request is signed with the current Clerk session
// token instead of a Supabase Auth session, using Supabase's native
// "Clerk as a Third-Party Auth provider" support (supabase-js >= 2.49).
//
// This requires a one-time setup on both sides — see CLERK_MIGRATION.md:
//   1. Supabase Dashboard → Authentication → Sign In / Providers →
//      Third Party Auth → add Clerk (using your Clerk "Frontend API URL").
//   2. RLS policies that used to check `auth.uid()` need to check
//      `(select auth.jwt()->>'sub')` instead (Clerk's user id), and any
//      `user_id` column storing Supabase's old UUID needs to switch to
//      text so it can hold a Clerk id like "user_2abc...".
//
// `accessToken` is called by supabase-js on every request, so it always
// grabs whatever the *current* Clerk session is — no manual token refresh
// wiring needed. `window.Clerk` is the global Clerk instance ClerkProvider
// attaches once it has loaded.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  async accessToken() {
    return (await window.Clerk?.session?.getToken()) ?? null
  },
})

// Python backend (Render) base URL — used for placements/internships/coding-profile APIs
export const PYTHON_BACKEND_URL = import.meta.env.VITE_PYTHON_BACKEND_URL
