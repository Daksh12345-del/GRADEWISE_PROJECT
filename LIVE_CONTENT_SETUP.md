# Making Analyser / Resources / App / Login-dropdown content live

These 4 pages used to read hardcoded data straight from `.js` files
(`gradesData.js`, `resourcesData.js`, `subjectKB.js`, `loginFormData.js`).
They now fetch that same data from a Supabase table called `site_content`
on page load — so you can edit it from the Supabase dashboard any time,
without touching code or redeploying.

If the table doesn't exist yet, or the fetch fails for any reason, the app
silently falls back to the bundled data in those `.js` files — nothing
breaks.

## One-time setup (5 minutes)

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste and run `backend/supabase_site_content_schema.sql`. This creates
   the `site_content` table.
3. Paste and run `backend/supabase_site_content_seed.sql`. This seeds it
   with **exactly** the data that's currently hardcoded — so nothing on
   the live site changes the moment you run it, it just moves the data
   somewhere editable.
4. Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in
   your frontend `.env` (same ones you already use for auth/profiles).
   No new env vars are needed.
5. Deploy/rebuild the frontend once (this is the last redeploy you'll need
   for content changes going forward).

## Editing content afterwards

Supabase Dashboard → **Table Editor** → `site_content` → click a row's
`value` cell → edit the JSON → Save. Changes appear for users on their
next page load (data is cached per browser tab/session for performance).

There are 8 rows, one per data type:

| key | powers | shape |
|---|---|---|
| `SEMESTERS` | AppPage, Sidebar, CGPA calc, Analyser thresholds | array of 8 semester objects, each with a `subjects` array |
| `VIDEO_DATA` | Resources page & Analyser page unit videos/notes | subject code → unit number → `{ unit_name, groups, notes }` |
| `PYQ_LINKS` | Resources page previous-year-question links | subject code → Drive link |
| `SUBJECT_NOTES` | Resources page overall subject notes link | subject code → Drive link |
| `SUBJECT_KB` | Analyser page "why it matters" / study tips | subject code → `{ importance, whyMatters, units }` |
| `COLLEGES_BY_CITY` | Login page college dropdown | array of `{ city, colleges: [...] }` |
| `BRANCHES` | Login page branch dropdown | course → array of branch names |
| `DOMAIN_GROUPS` | Login page "domain of interest" dropdown | array of `{ group, options: [...] }` |

**Adding a new resource (e.g. more unit notes) the same way you've done
before**: just send me the details and I'll now write directly into
Supabase-shaped JSON and give you the exact `UPDATE` SQL to paste in,
instead of editing a `.js` file. Or edit the JSON cell yourself in Table
Editor — same format as what's already there.

⚠️ **Keep the JSON valid** — a typo (missing comma/quote) in a `value`
cell will make that section fail to load for everyone; the page will fall
back to the last-known bundled data, not crash, but your edit won't apply
until the JSON is fixed.

## What's still hardcoded (unchanged)

- `GRADING` (the AKTU marks→grade→points table) — a fixed scoring rubric,
  not really "content," left as-is in `gradesData.js`.
- The batch-swap / elective-alias logic in `ResourcesPage.jsx` (which
  subject codes mirror each other between Physics-first/Chemistry-first
  batches) — this is app *logic*, not content, so it stays in code.

## Known minor limitation

One deep-dive calculator (the CGPA "Target Planner" on the Dashboard,
inside `RightPanel.jsx`) reads `SEMESTERS.length` in a memo that only
recomputes when you type into its input box. In the extremely unlikely
case someone opens that specific tool in the ~1 second before the
Supabase fetch resolves, it'll briefly use the bundled semester count.
Not touched here since it's a low-risk edge case; happy to patch if it
ever matters in practice.

## University → College → Branch (login dropdowns) — own tables

The login page's University, College and Branch dropdowns no longer come
from `site_content` (`COLLEGES_BY_CITY` / `BRANCHES` are unused now). They
come from three tables, so each university has its own colleges and each
college its own branches:

`universities` → `colleges` → `college_branches`

One-time setup, in Supabase → SQL Editor, **in this order**:

1. `gradewise-backend/supabase_universities_schema.sql` (tables + read-only RLS)
2. `gradewise-backend/supabase_universities_seed.sql` (AKTU copied from the
   old `site_content` rows, plus GGSIPU B.Tech colleges)

Day-to-day edits (no redeploy): Table Editor →
- add a university: `universities` (its `code` is what's saved on the student's profile)
- add a college: `colleges` (pick `university_code`; `city` groups the dropdown)
- add/remove a branch for a college: `college_branches` (`course` = `B.Tech`)
- hide anything: set `is_active = false`

A college only appears for a degree if it has at least one active branch row
for that degree.

## Per-university grading system (credits, marks split, grace rule) — own table

Grading is no longer AKTU-only. Each university's grade scale, credit/marks
rules and semester subjects live as one row per (university, branch group) in:

`university_schemes`

The signed-in student's `university` + `branch` (from their profile) picks the
row; `src/lib/schemes.js` then swaps the shared `GRADING` / `GRADE_RULES` /
`SEMESTERS` objects in place, so Grades, Dashboard, Analyser, the CGPA planner
and the PDF report all follow the right university automatically — no
AKTU/GGSIPU branching anywhere else in the code.

One-time setup, in Supabase → SQL Editor, **after** the universities/colleges
setup above:

3. `gradewise-backend/supabase_university_schemes_schema.sql` (table + read-only RLS)
4. `gradewise-backend/supabase_university_schemes_seed.sql` (AKTU's existing
   grading rules, and GGSIPU core-CSE grading + semesters, researched from the
   USICT handbook and the IPU examination ordinance — please cross-check
   against your batch's official scheme before launch)

Day-to-day edits (no redeploy): Table Editor → `university_schemes` →
edit the `grading` / `rules` / `semesters` JSON columns for a row, or add a new
row for another university or branch group (e.g. GGSIPU CS/AIML). A branch
with no matching row falls back to that university's first scheme, with a
small on-screen notice telling the student to expect some mismatches.

## New-user profile step (Google / GitHub sign-in)

Signing in with Google or GitHub only gives a name and email — no university,
college or branch. Those users now land on `/complete-profile` (not the
dashboard) until they fill that in; every other route redirects there too if
the profile is incomplete. Returning users with a saved profile skip straight
to the dashboard, and their saved university/college/branch is never
overwritten by a later OAuth sign-in.

