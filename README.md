# Gradewallah — React Version

Converting your site to React + Vite, page by page.

## What's done so far

### Step 1 — Project setup ✅
- Vite + React project, React Router (one route per page)
- Your real `style.css` copied in (1 real bug fixed: missing `}` around line 6597)
- Supabase client wired up, reading keys from `.env`
- Fonts linked, image placeholders created

### Step 2 — Login page ✅
- Full 2-step onboarding form (basic info → college details)
- All 86 colleges / 24 cities ported from your original dropdown
- Branch list changes based on selected course
- Group A/B selector (shown only for AKTU)
- Same Supabase sign-in/sign-up flow, same validation rules, same rate limiting
- Google/GitHub OAuth buttons
- Terms & Privacy Policy static pages copied to `public/`

### Step 3 — Dashboard page ✅
- Header with logo, theme toggle, Grades/Internships shortcuts, Scan Result button (stub — modal not built yet), user badge with group pill, Sign Out
- Collapsible sidebar with all 7 navigation links (Dashboard, Grades, Resources, Internships, Placements, DSA Tracker, Analyser)
- Hero section: greeting (time-of-day aware, like the original), current semester badge, CGPA display
- 4 stat cards: CGPA, current SGPA, semesters done, credits earned
- 6 quick action cards, all routed
- Semester progress strip (8 semesters)
- 3-panel bottom row: CGPA tips, **live placement drives pulled from Supabase** (same query as original), internship matches (still static sample data, same as your original — real matching logic lives in the Internships page, not built yet)

**Important — about the CGPA/SGPA numbers:** in your original site, the Dashboard's
numbers come from the Grades page's calculation engine (`SEMESTERS`, `marksData`,
`calcCGPA()`, etc. in script.js). We haven't built the Grades page yet, so Dashboard
currently shows `—` / `0.00` placeholders — **exactly what a brand new user with no
marks entered sees on your live site too.** This isn't a bug; it's accurate behavior
for an account with no data yet.

The bridge is `src/lib/GradesContext.jsx` — a shared context that currently returns
placeholder data. When we build the Grades page next, it will compute real values and
feed them through this same context, and Dashboard will start showing real numbers
automatically — no changes needed to Dashboard itself.

## What you need to do before running

1. **Copy your real images** into `public/images/` (`favicon.png`, `img_1.png`–`img_6.png`)
2. **Install Node.js** if you don't have it: https://nodejs.org (LTS)
3. **Install dependencies**: `npm install`
4. **Run dev server**: `npm run dev` → open `http://localhost:5173`

## Project structure

```
src/
  pages/
    LoginPage.jsx      → 2-step onboarding + Supabase auth
    DashboardPage.jsx   → main landing page after login
    (rest are placeholders, not built yet)
  lib/
    supabase.js         → Supabase client
    loginFormData.js     → colleges, branches, domains data
    useTheme.js          → dark/light mode toggle hook
    useAuthUser.js        → reads logged-in user, logout
    GradesContext.jsx    → shared CGPA/SGPA data (placeholder until Grades page exists)
  styles/style.css       → your original CSS, unchanged (+1 bug fix)
  App.jsx                → routes + context providers
.env                     → Supabase keys (don't commit publicly)
```

## What to test

1. Login with the 2-step form → should land on Dashboard
2. Dashboard: sidebar links should navigate (pages are placeholders for now)
3. Theme toggle (🌙/☀️) should switch the whole app's look
4. Sign Out should clear session and send you back to login
5. If you've added real placement rows in Supabase, the "Latest Placement Drives"
   panel should show them; otherwise it'll show "No drives posted yet"

## Next step

Tell Claude you're ready, and we'll build the **Grades / App page** next — this is the
big one: the CGPA/SGPA calculator engine, marks entry per semester, back-paper logic,
and it's what will make Dashboard's numbers come alive.

