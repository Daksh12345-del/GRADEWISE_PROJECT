"""test_dashboard.py — /dashboard page. Requires a real signed-in session
(see common.py for setup — sign_up() runs automatically)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class DashboardPageTests(AuthenticatedPageTest):
    PATH = "/dashboard"
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"MY GRADES") or contains(text(),"My Grades")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
