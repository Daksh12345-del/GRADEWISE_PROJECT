"""test_dsatracker.py — /dsa-tracker page (LeetCode/Codeforces/etc.
profile tracker). Requires a real signed-in session (see common.py)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class DsaTrackerPageTests(AuthenticatedPageTest):
    PATH = "/dsa-tracker"
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"LeetCode")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
