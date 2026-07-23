"""test_grades.py — /app page (marks entry / CGPA tracker). Requires a real
signed-in session (see common.py for setup)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class GradesPageTests(AuthenticatedPageTest):
    PATH = "/app"
    CHECK_SELECTOR = (By.CSS_SELECTOR, ".subject-card")


if __name__ == "__main__":
    unittest.main(verbosity=2)
