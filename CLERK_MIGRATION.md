# Migrating auth: Supabase Auth → Clerk

The code changes are done. What's left is manual setup in the Clerk and
Supabase dashboards, plus one SQL migration — none of this can be done from
the code alone.

## 1. Environment variable

Add your Clerk **publishable key** to `.env` (see `.env.example`):

```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... (or pk_test_...)
```

Restart `npm run dev` after adding it.

## 2. Clerk Dashboard — email verification setting

The login form signs a brand-new user up silently (email + Roll Number as
password, no separate confirmation step) — that only works if your Clerk
instance does **not** require an email verification code on sign-up.

Clerk Dashboard → **User & Authentication → Email, Phone, Username** →
under "Email address", check whether "Verify at sign-up" is on.

- **Off** → sign-up completes instantly, exactly like the old Supabase flow.
- **On** → the app now handles this too (a 6-digit code step appears after
  clicking "Launch Gradewallah" for new accounts), but it's an extra step
  your users didn't have before. Turn it off if you want the original
  one-click feel back.

## 3. Enable Google / GitHub OAuth (if you use them)

Clerk Dashboard → **User & Authentication → Social Connections** → enable
Google and/or GitHub. The buttons on the login page already call Clerk's
OAuth redirect flow — no code changes needed once these are turned on.

## 4. Supabase Dashboard — add Clerk as a Third-Party Auth provider

This is the important one: your `marks` table (and anything else behind
Row Level Security) used to trust Supabase Auth's session. Now that Clerk
issues the session, Supabase needs to be told to trust Clerk's tokens too.

Supabase Dashboard → **Authentication → Sign In / Providers → Third Party
Auth** → **Add provider → Clerk** → paste your Clerk **Frontend API URL**
(Clerk Dashboard → API Keys → shows as something like
`https://your-app-name.clerk.accounts.dev`, or your custom domain if you've
set one up).

No JWT template or shared secret needed — this is Supabase's native
integration, and `src/lib/supabase.js` is already wired to send Clerk's
session token on every request (`accessToken()` callback in the client
config).

## 5. Update RLS policies + the `user_id` column type

Supabase Auth issued UUIDs (`auth.uid()`); Clerk issues its own id strings
like `user_2abc123...`. Any table/policy that compared `user_id` against
`auth.uid()` needs two changes: the column type (uuid → text) and the
policy expression.

Run this in Supabase Studio → SQL Editor (adjust table/policy names to
match what you actually have — check **Database → Tables** and
**Authentication → Policies** first, since these weren't in the DB-only
export this project started from):

```sql
-- 1. Widen user_id columns from uuid to text so they can hold Clerk ids.
--    ⚠️ This does NOT migrate old data — existing rows keyed by the old
--    Supabase UUID become orphaned. If you have real users already, back
--    up the table first and decide how to handle the old rows (e.g. drop
--    them, since the login flow will just recreate them for anyone who
--    logs back in).
alter table public.marks
  alter column user_id type text;

-- If you have a `profiles` or `sessions` table using the same pattern,
-- repeat for those too:
-- alter table public.profiles alter column id type text;

-- 2. Drop the old auth.uid()-based policies and recreate them keyed off
--    Clerk's user id, which Supabase exposes via auth.jwt()->>'sub'
--    once the Third-Party Auth provider (step 4) is configured.
drop policy if exists "Users can view own marks" on public.marks;
drop policy if exists "Users can insert own marks" on public.marks;
drop policy if exists "Users can update own marks" on public.marks;

create policy "Users can view own marks"
  on public.marks for select
  using ( user_id = (select auth.jwt()->>'sub') );

create policy "Users can insert own marks"
  on public.marks for insert
  with check ( user_id = (select auth.jwt()->>'sub') );

create policy "Users can update own marks"
  on public.marks for update
  using ( user_id = (select auth.jwt()->>'sub') );
```

## 6. The `profiles` and `sessions` tables are no longer written to

The old code upserted a row into `profiles` and logged a row into
`sessions` on every login. That's gone now — Clerk stores the same profile
fields (name, college, roll number, branch, domain, group, ...) directly on
the Clerk user as `unsafeMetadata`, and Clerk's own dashboard already gives
you session/device history per user, so there's no need to duplicate either
in Supabase. `RightPanel.jsx`'s "Export report" feature now reads those
fields straight from Clerk instead of querying `profiles`.

If you had other features reading from `profiles` directly (not covered by
the pages in this project), point them at Clerk's user object
(`user.unsafeMetadata`) or Clerk's backend API instead — the table will
just sit there empty going forward.

## What changed in the code (for reference)

- `src/main.jsx` — wraps the app in `<ClerkProvider>`.
- `src/lib/supabase.js` — Supabase client now signs requests with the
  current Clerk session token instead of a Supabase Auth session.
- `src/lib/useAuthUser.js` — `useAuthUser()` / `useLogout()` now read from
  Clerk (`useUser`/`useClerk`) instead of Supabase Auth. Same `{ user,
  status }` shape as before, so every page using it needed zero changes.
  Also exports `getClerkUserId()` for the couple of non-hook call sites.
- `src/lib/useMarksData.js`, `src/pages/components/RightPanel.jsx` — use
  the Clerk user id / profile fields instead of `supabase.auth.getUser()`
  and the `profiles` table.
- `src/pages/LoginPage.jsx` — same two-step UI, but the sign-in/sign-up
  calls go through Clerk (`useSignIn`/`useSignUp`) instead of Supabase
  Auth. Adds a conditional email-verification-code step (see §2) and a
  `/sso-callback` route for Google/GitHub OAuth.
