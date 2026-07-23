"""test_auth_guard.py — verifies every protected route redirects to login
when signed out. Regression test for the original 'no auth guard' bug
(6 of 7 pages had zero session check). No login required to run this."""
import unittest

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from common import BASE_URL, make_driver


class AuthGuardTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.driver = make_driver()

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def _assert_redirects_to_login(self, path):
        self.driver.get(BASE_URL + path)
        WebDriverWait(self.driver, 15).until(
            lambda d: d.current_url.rstrip("/") == BASE_URL.rstrip("/") or
                      d.find_elements(By.ID, "login-name")
        )
        self.assertTrue(
            self.driver.find_elements(By.ID, "login-name"),
            f"Expected {path} to redirect to login when signed out, "
            f"landed on: {self.driver.current_url}"
        )

    def test_dashboard_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/dashboard")

    def test_app_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/app")

    def test_analyser_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/analyser")

    def test_resources_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/resources")

    def test_internships_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/internships")

    def test_placements_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/placements")

    def test_dsa_tracker_redirects_when_signed_out(self):
        self._assert_redirects_to_login("/dsa-tracker")


if __name__ == "__main__":
    unittest.main(verbosity=2)
