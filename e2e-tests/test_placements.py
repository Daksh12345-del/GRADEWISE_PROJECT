"""test_placements.py — /placements page. Requires a real signed-in
session (see common.py for setup)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class PlacementsPageTests(AuthenticatedPageTest):
    PATH = "/placements"
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"openings") or contains(text(),"Placements")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
