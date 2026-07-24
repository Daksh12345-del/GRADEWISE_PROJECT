"""test_dsatracker.py — /dsa-tracker page (LeetCode/Codeforces/etc.
profile tracker). Requires a real signed-in session (see common.py)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class DsaTrackerPageTests(AuthenticatedPageTest):
    PATH = "/dsa-tracker"
    # "LeetCode" text only appears after a fetch is triggered (see
    # PlatformResult in DsaTrackerPage.jsx — `if (!state) return null`).
    # The "DSA Tracker" heading and the username inputs are what's actually
    # present on initial load, so check for those instead.
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"DSA Tracker")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
