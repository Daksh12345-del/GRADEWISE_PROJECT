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
