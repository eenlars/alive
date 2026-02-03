import { test } from "@playwright/test"
import { SECURITY, TEST_CONFIG } from "@webalive/shared"

test("debug chat page error", async ({ page }) => {
  // Capture console errors
  const errors: string[] = []
  page.on("console", msg => {
    if (msg.type() === "error") {
      errors.push(msg.text())
      console.log("Browser error:", msg.text())
    }
  })

  // Capture page errors
  page.on("pageerror", error => {
    console.log("Page error:", error.message)
    errors.push(error.message)
  })

  // Login first
  await page.goto(TEST_CONFIG.BASE_URL)
  await page.getByTestId("email-input").fill(SECURITY.LOCAL_TEST.EMAIL)
  await page.getByTestId("password-input").fill(SECURITY.LOCAL_TEST.PASSWORD)
  await page.getByTestId("login-button").click()

  // Wait for navigation
  await page.waitForURL("**/chat", { timeout: 10000 })

  // Wait a bit to see if errors appear
  await page.waitForTimeout(3000)

  console.log("All errors:", errors)

  // Try to find error details
  const errorDetails = await page.locator('details summary:has-text("Error details")').count()
  if (errorDetails > 0) {
    await page.locator('details summary:has-text("Error details")').click()
    const errorText = await page.locator("details pre").textContent()
    console.log("Error details:", errorText)
  }

  // Take a screenshot
  await page.screenshot({ path: "/tmp/debug-chat.png", fullPage: true })
})
