"""
common.py — shared setup/helpers used by every test_*.py file in this folder.

Run these against YOUR real deployment, not a sandbox — they need genuine
network access to Clerk and Supabase.

============================================================
SETUP — read before running anything in this folder
============================================================
1. pip install selenium
   Selenium 4's built-in Selenium Manager auto-resolves a matching
   chromedriver as long as this machine has normal internet access.

2. Environment variables (set before running):
     GRADEWALLAH_URL          your deployed site, e.g. https://gradewallah.com
                               (defaults to http://localhost:5173)
     TEST_EMAIL                an email you can complete sign-up with
     TEST_VERIFICATION_CODE    see note below
     TEST_ROLL                 roll number to sign up with (also doubles
                                as the password for returning sign-ins)

3. Email verification:
   If your Clerk instance requires email verification on sign-up, use an
   email containing "+clerk_test" (e.g. "jane+clerk_test@example.com") —
   Clerk skips sending a real email and accepts the fixed code "424242"
   automatically, so sign-up runs unattended. See:
   https://clerk.com/docs/testing/test-emails-and-phones
   Otherwise set TEST_VERIFICATION_CODE to a real code from that inbox.

4. Each page's test file signs in once per run (see AuthenticatedPageTest
   in this module) — they don't share a session across files, so running
   all 7 files back to back does 7 sign-ins. Use a "+clerk_test" email so
   that's fully automated rather than needing a fresh code every time.
============================================================
"""
import os
import time
import unittest
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = os.environ.get("GRADEWALLAH_URL", "http://localhost:5173")
TEST_EMAIL = os.environ.get("TEST_EMAIL", "test.student+clerk_test@example.com")
TEST_VERIFICATION_CODE = os.environ.get(
    "TEST_VERIFICATION_CODE",
    "424242" if "+clerk_test" in TEST_EMAIL else ""
)
TEST_NAME = "Test Student"
TEST_ROLL = os.environ.get("TEST_ROLL", "2300100300001")

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


def assert_no_unexpected_console_errors(test_case, driver, extra_allowed=()):
    logs = driver.get_log("browser")
    severe = [l for l in logs if l["level"] == "SEVERE"]
    allowed = ("favicon",) + tuple(extra_allowed)
    unexpected = [l for l in severe if not any(a in l["message"].lower() for a in allowed)]
    test_case.assertEqual(unexpected, [], f"Unexpected console errors: {unexpected}")


def sign_up(driver):
    """Runs the real Clerk sign-up flow end to end. Leaves the browser on
    /dashboard when done."""
    driver.get(BASE_URL + "/")
    WebDriverWait(driver, 10).until(EC.visibility_of_element_located((By.ID, "login-course")))

    driver.find_element(By.ID, "login-name").send_keys(TEST_NAME)
    driver.find_element(By.ID, "login-email").send_keys(TEST_EMAIL)
    Select(driver.find_element(By.ID, "login-university")).select_by_value("AKTU")
    Select(driver.find_element(By.ID, "login-course")).select_by_value("B.Tech")
    driver.find_element(By.XPATH, '//button[contains(text(),"Continue")]').click()
    WebDriverWait(driver, 12).until(EC.visibility_of_element_located((By.ID, "step-2")))

    Select(driver.find_element(By.ID, "login-college")).select_by_index(1)
    driver.find_element(By.ID, "login-roll").send_keys(TEST_ROLL)
    Select(driver.find_element(By.ID, "login-branch")).select_by_index(1)

    group_radios = driver.find_elements(By.CSS_SELECTOR, 'input[name="batch_group"]')
    if group_radios:
        group_radios[0].click()

    Select(driver.find_element(By.ID, "login-domain")).select_by_index(1)
    driver.find_element(By.XPATH, '//button[contains(text(),"Launch Gradewallah")]').click()

    try:
        WebDriverWait(driver, 8).until(EC.visibility_of_element_located((By.ID, "login-verification")))
    except Exception:
        pass  # no verification step required by this Clerk instance — already signed in
    else:
        # A verification step DID appear — this branch only runs if it did.
        if not TEST_VERIFICATION_CODE:
            driver.save_screenshot(str(SCREENSHOT_DIR / "signup_failure_no_code.png"))
            raise RuntimeError(
                "This Clerk instance requires email verification, but no "
                "TEST_VERIFICATION_CODE was set/resolved. Use a '+clerk_test' "
                "email (auto-accepts code 424242 — but only if your Clerk "
                "project has 'test mode' enabled in the Clerk dashboard under "
                "Configure > Email, phone, username), or supply a real code "
                "via the TEST_VERIFICATION_CODE secret."
            )
        driver.find_element(By.ID, "login-verification").send_keys(TEST_VERIFICATION_CODE)
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
        html_before = self.driver.find_element(By.TAG_NAME, "html").get_attribute("class") or ""
        toggles[0].click()
        time.sleep(0.3)
        html_after = self.driver.find_element(By.TAG_NAME, "html").get_attribute("class") or ""
        self.assertNotEqual(html_before, html_after, "Theme toggle click had no visible effect")
       
