# Gradewallah — Selenium test suite

Run these against your **real deployment** (not a sandbox) — they need
genuine network access to Clerk and Supabase.

## Folder structure
```
gradewallah_tests/
  common.py            shared driver setup, sign_up() flow, base test class
  test_login.py         login/sign-up page (no auth needed)
  test_auth_guard.py     verifies protected routes redirect when signed out (no auth needed)
  test_dashboard.py      /dashboard
  test_grades.py         /app (marks entry / CGPA)
  test_analyser.py       /analyser
  test_resources.py      /resources
  test_internships.py    /internships
  test_placements.py     /placements
  test_dsatracker.py     /dsa-tracker
  screenshots/           written here as tests run
```

## Setup
```bash
pip install selenium
```
Selenium 4's built-in Selenium Manager auto-resolves a matching
chromedriver as long as this machine has normal internet access.

Set these environment variables before running:
```bash
export GRADEWALLAH_URL="https://gradewallah.com"   # or http://localhost:5173 for local dev
export TEST_EMAIL="you+clerk_test@example.com"       # see note below
export TEST_ROLL="2300100300001"
```

### Email verification
If your Clerk instance requires email verification on sign-up, use an
email containing `+clerk_test` (e.g. `jane+clerk_test@example.com`) —
Clerk skips sending a real email and accepts the fixed code `424242`
automatically, so sign-up runs fully unattended. See:
https://clerk.com/docs/testing/test-emails-and-phones

Otherwise, set `TEST_VERIFICATION_CODE` to a real code retrieved from
that inbox before running.

## Running

Run everything:
```bash
cd gradewallah_tests
python3 -m unittest discover -v
```

Run just one page:
```bash
python3 -m unittest test_dashboard -v
```

Run just the public pages (no login needed, safe to run anywhere):
```bash
python3 -m unittest test_login test_auth_guard -v
```

## Notes
- Each of the 7 protected-page files signs up independently (they don't
  share a session with each other) — running all of them back to back
  does 7 sign-ups. Use a `+clerk_test` email so that's fully automated.
- The account created reuses `TEST_ROLL` as its password for returning
  sign-ins (see LoginPage.jsx) — reuse the same roll number across runs,
  or change it to force a fresh account each time.
- Every selector used here (`login-name`, `step-2`, `login-college`,
  `batch_group`, `.subject-card`, `.theme-toggle`, etc.) was verified
  against the actual source code. The `sign_up()` flow itself has not
  been run end-to-end against a live Clerk backend (no real credentials
  were available while building this) — if you hit an error on first
  run, share it and it can be fixed quickly.
