"""test_internships.py — /internships page. Requires a real signed-in
session (see common.py for setup)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class InternshipsPageTests(AuthenticatedPageTest):
    PATH = "/internships"
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"listings") or contains(text(),"Internships")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
