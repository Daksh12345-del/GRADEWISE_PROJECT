"""
common.py — shared setup/helpers used by every test_*.py file in this folder.

Run these against YOUR real deployment, not a sandbox — they need genuine
network access to Clerk and Supabase.

============================================================
SETUP — read before running anything in this folder
============================================================
1. pip install -r requirements.txt
   Selenium 4's built-in Selenium Manager auto-resolves a matching
   chromedriver as long as this machine has normal internet access.

2. Environment variables (set before running):
     GRADEWALLAH_URL           your deployed site, e.g. https://gradewallah.com
                                (defaults to http://localhost:5173)
     TEST_EMAIL                 a real inbox you control, e.g.
                                 "yourtestaccount@gmail.com" (see note 3 —
                                 this suite runs against production, so
                                 Clerk sends a genuine code to this address)
     TEST_EMAIL_IMAP_USER       login for that inbox (usually same as
                                 TEST_EMAIL)
     TEST_EMAIL_IMAP_PASSWORD   an app password for that inbox — for Gmail:
                                 Google Account -> Security -> App passwords
                                 (2-Step Verification must be on). Never
                                 commit this, GitHub Secrets only.
     TEST_EMAIL_IMAP_HOST       defaults to imap.gmail.com
     TEST_VERIFICATION_CODE     optional manual override — skips both the
                                 "+clerk_test" shortcut and IMAP polling if set
     TEST_ROLL                  roll number to sign up with (also doubles
                                 as the password for returning sign-ins)
     CLERK_SECRET_KEY           REQUIRED for the 7 authenticated-page test
                                 files (test_login.py / test_auth_guard.py
                                 don't need it). See note 5 below — this is
                                 sensitive, GitHub Secrets only, never commit it.

3. Email verification (production instance):
   We deliberately do NOT use Clerk's "+clerk_test" / fixed-code-"424242"
   shortcut here, because that only works with Clerk's "test mode" — and
   enabling test mode on a PRODUCTION instance means any real user could
   sign up with an address containing "+clerk_test" and skip real email
   verification too. Not worth it just to make CI simpler.
   Instead, TEST_EMAIL should be a real inbox with IMAP enabled. Each run
   signs up with a unique address via "+tag" subaddressing (e.g.
   "yourtestaccount+abc123@gmail.com" — most providers, including Gmail,
   route "+tag" variants into the same physical inbox while keeping them
   individually addressable), then fetch_verification_code() polls that
   inbox over IMAP for the real code Clerk actually sent and reads it out.
   (If TEST_EMAIL does contain "+clerk_test" — e.g. this ever points at a
   dev/staging Clerk instance instead — the old shortcut still applies and
   IMAP is skipped entirely.)

4. Each page's test file signs in once per run (see AuthenticatedPageTest
   in this module) — they don't share a session across files, so running
   all 7 files back to back does 7 sign-ins, i.e. 7 real emails sent to
   TEST_EMAIL and 7 IMAP lookups. That's expected and by design.

5. CAPTCHA / bot-detection in headless CI:
   Clerk's sign-up form runs a CAPTCHA/bot-detection check that commonly
   fails to load in a headless browser on a CI runner (you'll see "Auth
   error: Error loading CAPTCHA" on screen if this happens). Clerk's
   documented fix for automated tests is a short-lived "Testing Token"
   fetched from their Backend API — see get_clerk_testing_token() below.
   This needs your Clerk **Secret Key** (Dashboard -> API Keys -> Secret
   key, starts with sk_) — NOT the publishable key. Add it as a GitHub
   Actions secret named CLERK_SECRET_KEY. Never commit this key or put it
   in a public file — it grants backend-level access to your Clerk app.
   https://clerk.com/docs/guides/development/testing/overview
============================================================
"""
import email as email_lib
import imaplib
import os
import random
import re
import time
import unittest
from email.utils import mktime_tz, parsedate_tz
from pathlib import Path

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = os.environ.get("GRADEWALLAH_URL", "http://localhost:5173")

# Every test file needs its OWN brand new account — reusing the same
# roll/email makes Clerk treat it as a returning user and show "extra
# verification steps this page doesn't support", since our sign_up() flow
# only ever drives the sign-UP form, not sign-in. This bit tripped us up
# twice: GITHUB_RUN_ID alone is only unique *per CI run*, but all 7
# authenticated-page test files (test_dashboard, test_grades, ...) run as
# separate `python3 -m unittest` processes *within the same run* — so they
# all computed the identical suffix and collided with each other. Adding a
# random component (freshly generated each time this module is imported,
# i.e. once per test file's process) fixes that; GITHUB_RUN_ID is kept too
# so failures are still traceable back to the run that created them.
_RUN_SUFFIX = (os.environ.get("GITHUB_RUN_ID") or str(int(time.time()))) + str(random.randint(1000, 9999))

_raw_email = os.environ.get("TEST_EMAIL", "test.student+clerk_test@example.com")
if "+clerk_test" in _raw_email:
    _local, _domain = _raw_email.split("@", 1)
    _prefix, _, _rest = _local.partition("+clerk_test")
    # Keep "+clerk_test" intact (Clerk pattern-matches on it) — uniqueness
    # goes into the part *before* it instead.
    TEST_EMAIL = f"{_prefix}.{_RUN_SUFFIX}+clerk_test{_rest}@{_domain}"
else:
    # Real inbox, no Clerk shortcut available (production instance) — use
    # "+tag" subaddressing so this run's address is uniquely matchable by
    # fetch_verification_code() below, while still landing in the one
    # physical inbox TEST_EMAIL_IMAP_USER logs into.
    _local, _domain = _raw_email.split("@", 1)
    TEST_EMAIL = f"{_local}+{_RUN_SUFFIX}@{_domain}"

TEST_VERIFICATION_CODE = os.environ.get(
    "TEST_VERIFICATION_CODE",
    "424242" if "+clerk_test" in TEST_EMAIL else ""
)
TEST_NAME = "Test Student"
# [-20:] (not [:20]) so the unique suffix at the END is always preserved —
# truncating from the front would risk cutting into the part that actually
# guarantees uniqueness.
TEST_ROLL = (os.environ.get("TEST_ROLL", "2300100300001") + _RUN_SUFFIX)[-20:]
CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY", "")

# IMAP creds for the real test inbox — only needed when TEST_EMAIL doesn't
# contain "+clerk_test" (i.e. we're actually running against production).
TEST_EMAIL_IMAP_HOST = os.environ.get("TEST_EMAIL_IMAP_HOST", "imap.gmail.com")
TEST_EMAIL_IMAP_USER = os.environ.get("TEST_EMAIL_IMAP_USER", "")
TEST_EMAIL_IMAP_PASSWORD = os.environ.get("TEST_EMAIL_IMAP_PASSWORD", "")
TEST_EMAIL_IMAP_FOLDER = os.environ.get("TEST_EMAIL_IMAP_FOLDER", "INBOX")

_SIX_DIGIT_CODE_RE = re.compile(r"\b(\d{6})\b")
_HTML_TAG_RE = re.compile(r"<[^>]+>")

SCREENSHOT_DIR = Path(__file__).parent / "screenshots"
SCREENSHOT_DIR.mkdir(exist_ok=True)


def make_driver(width=1440, height=900, headless=True):
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument(f"--window-size={width},{height}")
    opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    driver = webdriver.Chrome(options=opts)
    driver.implicitly_wait(2)
    return driver


def get_clerk_testing_token():
    """Fetches a short-lived Clerk Testing Token via the Backend API. This
    is Clerk's own documented way to let automated browsers (Selenium,
    Playwright, etc.) bypass their bot-detection/CAPTCHA, which otherwise
    blocks headless CI runs with an "Error loading CAPTCHA" screen.
    Docs: https://clerk.com/docs/guides/development/testing/overview
    """
    if not CLERK_SECRET_KEY:
        raise RuntimeError(
            "CLERK_SECRET_KEY is not set. Sign-up needs a Clerk Testing "
            "Token to bypass CAPTCHA/bot-detection in headless CI — "
            "without it, the form shows 'Error loading CAPTCHA' and never "
            "proceeds. Get your Secret Key from the Clerk Dashboard -> "
            "API Keys (starts with sk_), and add it as a GitHub Actions "
            "secret named CLERK_SECRET_KEY."
        )
    resp = requests.post(
        "https://api.clerk.com/v1/testing_tokens",
        headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def fetch_verification_code(to_address, since_ts, timeout=150, poll_interval=3):
    """Polls a real mailbox over IMAP for the Clerk verification email sent
    to `to_address` at or after `since_ts` (a time.time() timestamp), and
    returns the 6-digit code found in its body.

    This is how the test suite gets a real verification code when running
    against production, instead of relying on Clerk's "+clerk_test" /
    "424242" shortcut (which would require enabling test mode on the
    production instance — see the module docstring for why we avoid that).

    Requires TEST_EMAIL_IMAP_USER / TEST_EMAIL_IMAP_PASSWORD to be set to
    an IMAP-enabled inbox (e.g. a Gmail account with an App Password).
    """
    if not TEST_EMAIL_IMAP_USER or not TEST_EMAIL_IMAP_PASSWORD:
        raise RuntimeError(
            "TEST_EMAIL_IMAP_USER / TEST_EMAIL_IMAP_PASSWORD are not set. "
            "This suite runs against production, so verification codes "
            "come from a real inbox over IMAP rather than Clerk's "
            "'+clerk_test' shortcut. Point these at a dedicated test "
            "mailbox — for Gmail: enable 2-Step Verification, then create "
            "an App Password under Google Account -> Security -> App "
            "passwords, and use that (not your normal password) here."
        )

    print(f"[fetch_verification_code] polling {TEST_EMAIL_IMAP_HOST} inbox for "
          f"an email to '{to_address}' sent at/after {time.strftime('%H:%M:%S', time.gmtime(since_ts))} UTC",
          flush=True)

    deadline = time.time() + timeout
    last_err = None
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            code = _search_inbox_for_code(to_address, since_ts, attempt)
            if code:
                print(f"[fetch_verification_code] using code: {code}", flush=True)
                return code
        except Exception as e:  # noqa: BLE001 - keep polling, surface at the end
            last_err = e
            print(f"[fetch_verification_code] attempt {attempt} IMAP error: {e}", flush=True)
        time.sleep(poll_interval)

    detail = f" (last IMAP error: {last_err})" if last_err else ""
    raise TimeoutError(
        f"No verification email arrived for {to_address} within {timeout}s"
        f"{detail}. Check TEST_EMAIL_IMAP_* creds and that Clerk is "
        f"actually configured to send to this address."
    )


def _search_inbox_for_code(to_address, since_ts, attempt=0):
    conn = imaplib.IMAP4_SSL(TEST_EMAIL_IMAP_HOST)
    try:
        conn.login(TEST_EMAIL_IMAP_USER, TEST_EMAIL_IMAP_PASSWORD)
        conn.select(TEST_EMAIL_IMAP_FOLDER)
        # IMAP's SINCE is date-only (no time-of-day), so this is a coarse
        # pre-filter — exact recency is re-checked per-message below using
        # the message's actual Date header against since_ts.
        since_date = time.strftime("%d-%b-%Y", time.gmtime(since_ts))
        status, data = conn.search(None, f'(SINCE "{since_date}")')
        if status != "OK" or not data or not data[0]:
            print(f"[fetch_verification_code] attempt {attempt}: IMAP search returned no messages at all "
                  f"since {since_date} in '{TEST_EMAIL_IMAP_FOLDER}'", flush=True)
            return None

        msg_ids = list(reversed(data[0].split()))  # newest first
        checked = 0
        for msg_id in msg_ids:
            if checked >= 5:  # don't spam the log scanning a huge inbox
                break
            status, msg_data = conn.fetch(msg_id, "(RFC822)")
            if status != "OK" or not msg_data or not msg_data[0]:
                continue
            msg = email_lib.message_from_bytes(msg_data[0][1])

            to_header = str(msg.get("To", ""))
            if to_address.lower() not in to_header.lower():
                continue  # not one of ours — don't count against the 5-message log cap

            checked += 1
            subject = str(msg.get("Subject", ""))
            from_header = str(msg.get("From", ""))
            date_header = msg.get("Date")
            print(f"[fetch_verification_code] attempt {attempt}: candidate email — "
                  f"From: {from_header!r} Subject: {subject!r} Date: {date_header!r} To: {to_header!r}",
                  flush=True)

            if date_header:
                parsed = parsedate_tz(date_header)
                if parsed and mktime_tz(parsed) < since_ts - 5:
                    print(f"[fetch_verification_code] attempt {attempt}: skipping — older than this run's send", flush=True)
                    continue

            body = _extract_body_text(msg)
            candidates = [(m.group(1), body[max(0, m.start() - 30):m.start() + 30]) for m in _SIX_DIGIT_CODE_RE.finditer(body)]
            print(f"[fetch_verification_code] attempt {attempt}: 6-digit candidates found: "
                  f"{[(c, snippet.replace(chr(10), ' ')) for c, snippet in candidates]}", flush=True)

            code = _pick_verification_code(body)
            if code:
                return code
        return None
    finally:
        conn.logout()


def _extract_body_text(msg):
    """Prefers the plain-text part of the email — far less likely to
    contain stray 6-digit sequences than HTML (tracking-pixel URLs,
    campaign IDs in href query strings, etc.). Falls back to the HTML
    part with all tag markup (including attributes) stripped out, so
    matching only ever runs against genuinely visible text.
    """
    plain_parts = []
    html_parts = []

    def _collect(part):
        payload = part.get_payload(decode=True)
        if not payload:
            return
        charset = part.get_content_charset() or "utf-8"
        text = payload.decode(charset, errors="ignore")
        if part.get_content_type() == "text/plain":
            plain_parts.append(text)
        elif part.get_content_type() == "text/html":
            html_parts.append(text)

    if msg.is_multipart():
        for part in msg.walk():
            _collect(part)
    else:
        _collect(msg)

    if plain_parts:
        return "\n".join(plain_parts)
    return "\n".join(_HTML_TAG_RE.sub(" ", h) for h in html_parts)


def _pick_verification_code(text):
    """Returns the most likely verification code from email body text.
    If several 6-digit sequences are present, prefers one that appears
    near the word "code" (case-insensitive) over an arbitrary match —
    guards against picking up an unrelated 6-digit number elsewhere in
    the email (order IDs, dates, etc.)."""
    candidates = list(_SIX_DIGIT_CODE_RE.finditer(text))
    if not candidates:
        return None
    for m in candidates:
        window = text[max(0, m.start() - 60):m.start()].lower()
        if "code" in window:
            return m.group(1)
    return candidates[0].group(1)


def assert_no_unexpected_console_errors(test_case, driver, extra_allowed=()):
    logs = driver.get_log("browser")
    severe = [l for l in logs if l["level"] == "SEVERE"]
    allowed = (
        "favicon",
        # Clerk's own SDK probes "is there an existing sign-in attempt?"
        # during sign-up and gets a 422 when there isn't one — this is an
        # internal state check, not a real error (confirmed harmless: the
        # page loads and works fine despite it appearing every run).
        "client/sign_ins",
    ) + tuple(extra_allowed)
    unexpected = [l for l in severe if not any(a in l["message"].lower() for a in allowed)]
    test_case.assertEqual(unexpected, [], f"Unexpected console errors: {unexpected}")


def sign_up(driver):
    """Runs the real Clerk sign-up flow end to end. Leaves the browser on
    /dashboard when done.

    Login is a single-step, passwordless form — fill the six visible
    fields (name/email/university/course/college/branch) and click
    Continue to trigger Clerk sign-up directly, swapping step-1's own
    content over to the verification-code input in place (no separate
    "step-2" panel). Once that code is confirmed, ProtectedRoute sends
    the browser straight to /dashboard — there's no additional
    "complete your profile" step (isProfileComplete() in useAuthUser.js
    only requires the fields this form actually collects).
    """
    testing_token = get_clerk_testing_token()
    driver.get(f"{BASE_URL}/?__clerk_testing_token={testing_token}")
    WebDriverWait(driver, 10).until(EC.visibility_of_element_located((By.ID, "login-course")))

    driver.find_element(By.ID, "login-name").send_keys(TEST_NAME)
    driver.find_element(By.ID, "login-email").send_keys(TEST_EMAIL)
    Select(driver.find_element(By.ID, "login-university")).select_by_value("AKTU")
    Select(driver.find_element(By.ID, "login-course")).select_by_value("B.Tech")

    # College/branch options load at runtime from the CMS — wait for them
    # to populate before selecting, same as test_login.py.
    college_select = Select(driver.find_element(By.ID, "login-college"))
    WebDriverWait(driver, 10).until(lambda d: len(college_select.options) > 1)
    college_select.select_by_index(1)

    branch_select = Select(driver.find_element(By.ID, "login-branch"))
    WebDriverWait(driver, 10).until(lambda d: len(branch_select.options) > 1)
    branch_select.select_by_index(1)

    send_time = time.time()
    driver.find_element(By.XPATH, '//button[contains(text(),"Continue")]').click()

    try:
        WebDriverWait(driver, 8).until(EC.visibility_of_element_located((By.ID, "login-verification")))
    except Exception:
        pass  # no verification step required by this Clerk instance — already signed in
    else:
        # A verification step DID appear. Priority: explicit manual
        # override > "+clerk_test" fixed code > real code fetched from the
        # actual test inbox over IMAP (the production path).
        code = TEST_VERIFICATION_CODE or fetch_verification_code(TEST_EMAIL, send_time)
        driver.find_element(By.ID, "login-verification").send_keys(code)
        driver.find_element(By.XPATH, '//button[contains(text(),"Confirm & Launch")]').click()

    try:
        WebDriverWait(driver, 15).until(EC.url_contains("/dashboard"))
    except Exception:
        # Capture what's actually on screen when this fails, instead of just
        # a bare TimeoutException with no clue what page we were stuck on.
        driver.save_screenshot(str(SCREENSHOT_DIR / "signup_failure_final_state.png"))
        with open(SCREENSHOT_DIR / "signup_failure_page_source.html", "w") as f:
            f.write(driver.page_source)
        raise


class AuthenticatedPageTest(unittest.TestCase):
    """Base class for any test file that needs a signed-in session.
    Subclass and set PATH + CHECK_SELECTOR; you get three tests for free:
    page loads with expected content, no console errors, theme toggle works.
    """
    PATH = None
    CHECK_SELECTOR = None  # (By, value)

    @classmethod
    def setUpClass(cls):
        # This base class itself has PATH=None — it's a template, not a real
        # test. But Python's unittest loader has a well-known gotcha: doing
        # `from common import AuthenticatedPageTest` in test_dashboard.py
        # (etc.) makes that name part of test_dashboard's module namespace,
        # and `python -m unittest test_dashboard` picks up EVERY TestCase
        # subclass visible in that namespace — including this imported base
        # class — not just the ones actually defined in that file. Skip
        # cleanly here instead of crashing on `BASE_URL + None`.
        if cls.PATH is None:
            raise unittest.SkipTest("AuthenticatedPageTest is an abstract base class, not a real test")
        cls.driver = make_driver()
        sign_up(cls.driver)

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def _goto_page(self):
        self.driver.get(BASE_URL + self.PATH)
        WebDriverWait(self.driver, 15).until(
            EC.visibility_of_element_located(self.CHECK_SELECTOR)
        )

    def test_page_loads_and_has_expected_content(self):
        self._goto_page()
        el = self.driver.find_element(*self.CHECK_SELECTOR)
        self.assertTrue(el.is_displayed())
        name = self.PATH.strip("/").replace("/", "_") or "root"
        self.driver.save_screenshot(str(SCREENSHOT_DIR / f"page_{name}.png"))

    def test_no_console_errors(self):
        self._goto_page()
        time.sleep(1)
        assert_no_unexpected_console_errors(self, self.driver)

    def test_theme_toggle_works(self):
        self._goto_page()
        toggles = self.driver.find_elements(By.CSS_SELECTOR, ".theme-toggle")
        if not toggles:
            self.skipTest(f"{self.PATH} has no theme toggle")
        # useTheme.js toggles a 'light-mode' class on <body>, not <html>.
        body_before = self.driver.find_element(By.TAG_NAME, "body").get_attribute("class") or ""
        toggles[0].click()
        time.sleep(0.3)
        body_after = self.driver.find_element(By.TAG_NAME, "body").get_attribute("class") or ""
        self.assertNotEqual(body_before, body_after, "Theme toggle click had no visible effect")
