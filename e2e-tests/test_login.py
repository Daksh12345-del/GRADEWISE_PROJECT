"""test_login.py — the login/sign-up page. No auth required to run this."""
import unittest

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from common import BASE_URL, make_driver


class LoginPageTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.driver = make_driver()

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def setUp(self):
        self.driver.get(BASE_URL + "/")
        WebDriverWait(self.driver, 10).until(
            EC.visibility_of_element_located((By.ID, "login-course"))
        )

    def test_title_is_correct(self):
        self.assertIn("Gradewallah", self.driver.title)

    def test_all_step1_fields_present(self):
        for field_id in ["login-name", "login-email", "login-university", "login-course"]:
            el = self.driver.find_element(By.ID, field_id)
            self.assertTrue(el.is_displayed())

    def test_labels_are_programmatically_associated(self):
        pairs = [
            ("login-name", "Your Name"), ("login-email", "Email"),
            ("login-university", "University"), ("login-course", "Degree"),
        ]
        for field_id, expected_text in pairs:
            label = self.driver.find_element(By.CSS_SELECTOR, f'label[for="{field_id}"]')
            self.assertIn(expected_text.upper(), label.text.upper())

    def test_empty_submit_shows_validation_errors(self):
        self.driver.find_element(By.XPATH, '//button[contains(text(),"Continue")]').click()
        name_err = self.driver.find_element(By.ID, "login-name-err")
        WebDriverWait(self.driver, 5).until(lambda d: name_err.text.strip() != "")
        self.assertNotEqual(name_err.text.strip(), "")

    def test_filling_step1_advances_to_verification(self):
        # This is a single-step, passwordless form now: there is no separate
        # "step-2" panel. Submitting valid details swaps step-1's own
        # content over to a 6-digit email-code input (#login-verification)
        # instead of navigating to a new step element.
        self.driver.find_element(By.ID, "login-name").send_keys("Test Student")
        self.driver.find_element(By.ID, "login-email").send_keys("someone@example.com")
        Select(self.driver.find_element(By.ID, "login-university")).select_by_value("AKTU")
        Select(self.driver.find_element(By.ID, "login-course")).select_by_value("B.Tech")

        # College/branch options are loaded at runtime from the CMS, so
        # there's no fixed value to select by — just pick the first real
        # option (index 0 is the "— Select —" placeholder) once it's populated.
        college_select = Select(self.driver.find_element(By.ID, "login-college"))
        WebDriverWait(self.driver, 10).until(lambda d: len(college_select.options) > 1)
        college_select.select_by_index(1)

        branch_select = Select(self.driver.find_element(By.ID, "login-branch"))
        WebDriverWait(self.driver, 10).until(lambda d: len(branch_select.options) > 1)
        branch_select.select_by_index(1)

        self.driver.find_element(By.XPATH, '//button[contains(text(),"Continue")]').click()
        WebDriverWait(self.driver, 12).until(
            EC.visibility_of_element_located((By.ID, "login-verification"))
        )
        self.assertTrue(self.driver.find_element(By.ID, "login-verification").is_displayed())

    def test_mobile_viewport_renders_without_horizontal_overflow(self):
        mobile = make_driver(width=390, height=844)
        try:
            mobile.get(BASE_URL + "/")
            WebDriverWait(mobile, 10).until(EC.visibility_of_element_located((By.ID, "login-name")))
            body_width = mobile.execute_script("return document.body.scrollWidth")
            viewport_width = mobile.execute_script("return window.innerWidth")
            self.assertLessEqual(body_width, viewport_width + 5)
        finally:
            mobile.quit()


if __name__ == "__main__":
    unittest.main(verbosity=2)
