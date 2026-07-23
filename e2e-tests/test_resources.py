"""test_resources.py — /resources page (notes, videos, PYQs). Requires a
real signed-in session (see common.py for setup)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class ResourcesPageTests(AuthenticatedPageTest):
    PATH = "/resources"
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"Full Notes") or contains(text(),"Coming Soon")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
