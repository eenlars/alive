import { expect, test } from "./fixtures"

test.skip("homepage loads", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByTestId("email-input")).toBeVisible()
  await expect(page.getByTestId("password-input")).toBeVisible()
  await expect(page.getByTestId("login-button")).toBeVisible()
})
