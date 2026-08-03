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

## 2. Clerk Dashboard — passwordless email code sign-in

The login form is **fully passwordless** — there is no password field
anywhere, for either new or returning users. Every login and signup goes
through a 6-digit code sent to the user's email (previously, Roll Number
was used as the account password; that's gone, since roll numbers aren't
actually secret — they're printed on ID cards and result sheets). For this
to work, your Clerk instance needs email code enabled in **two** places,
not just one:

Clerk Dashboard → **User & Authentication → Email, Phone, Username**:

- Under "Email address" → **"Verify at sign-up"** should be **On**. New
  accounts always go through `signUp.prepareEmailAddressVerification` now
  — there's no silent-signup path anymore.
- Under **"Sign-in options"** → make sure **"Email verification code"** is
  enabled as a first-factor sign-in strategy. This is the one that's easy
  to miss: it's a separate toggle from sign-up verification, and returning
  users authenticate with `signIn.attemptFirstFactor({ strategy:
  'email_code' })`, which needs it turned on.

If you have existing accounts created under the old roll-number-as-password
flow, they'll keep working here with no migration needed — the sign-in
call no longer looks for a password at all, it just requests an email-code
first factor, which Clerk will offer regardless of whether the account also
happens to have an old password credential sitting on it.

## 3. Enable Google / GitHub OAuth (if you use them)

Clerk Dashboard → **User & Authentication → Social Connections** → enable
Google and/or GitHub. The buttons on the login page already call Clerk's
OAuth redirect flow — no code changes needed once these are turned on.

**Note on OAuth + profile data:** clicking Google/GitHub skips the app's
2-step form entirely (Clerk handles the whole thing via redirect), so a
brand-new OAuth user has no college/roll/branch/domain/group set. `
src/lib/ProtectedRoute.jsx` catches this — any signed-in user missing that
data gets redirected to `/complete-profile` (a short one-step form) before
they can reach the dashboard or any other page. Nothing to configure for
this, it's automatic, just worth knowing it's there if you're wondering
why a fresh OAuth login doesn't land straight on `/dashboard`.

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
  Auth. Fully passwordless: every account (new or returning) confirms via
  a 6-digit email code (see §2) — Roll Number is profile data only, never
  a credential. Also adds a `/sso-callback` route for Google/GitHub OAuth.
- `src/lib/useAuthUser.js` — exports `isProfileComplete(user)`, the single
  definition of "has this account finished onboarding" used by both
  `ProtectedRoute` and `CompleteProfilePage`.
- `src/lib/ProtectedRoute.jsx` — now also redirects to `/complete-profile`
  if the signed-in user is missing college/roll/branch/domain/group (only
  possible via the OAuth path, since the password/OTP signup form always
  collects all of it first).
- `src/pages/CompleteProfilePage.jsx` — new page, reached only via that
  redirect. One-step form covering the fields OAuth sign-in skips; saves
  straight to Clerk's `unsafeMetadata` and continues to `/dashboard`.
