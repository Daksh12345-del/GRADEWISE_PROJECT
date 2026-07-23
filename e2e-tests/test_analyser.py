"""test_analyser.py — /analyser page (weak-subject / performance analyser).
Requires a real signed-in session (see common.py for setup)."""
import unittest
from selenium.webdriver.common.by import By
from common import AuthenticatedPageTest


class AnalyserPageTests(AuthenticatedPageTest):
    PATH = "/analyser"
    CHECK_SELECTOR = (By.XPATH, '//*[contains(text(),"Weak Subject") or contains(text(),"Minimum Marks")]')


if __name__ == "__main__":
    unittest.main(verbosity=2)
