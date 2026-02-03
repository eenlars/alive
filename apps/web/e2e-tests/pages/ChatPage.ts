/**
 * Page Object Model for Chat Page
 *
 * Benefits:
 * - Centralized selectors (change once, fix everywhere)
 * - Reusable actions
 * - Better error messages
 * - Type-safe interactions
 */
import { expect, type Page } from "@playwright/test"
import { TEST_SELECTORS, TEST_TIMEOUTS } from "../fixtures/test-data"

export class ChatPage {
  constructor(private page: Page) {}

  /**
   * Navigate to chat page
   * Uses domcontentloaded for fast navigation, then waitForReady handles React hydration
   */
  async goto() {
    await this.page.goto("/chat", { waitUntil: "domcontentloaded" })
  }

  /**
   * FAST: Navigate to chat with workspace pre-injected
   *
   * IMPORTANT: Must be used with authenticatedPage fixture which sets up
   * localStorage via context.addInitScript before any navigation.
   *
   * The workspace/orgId params are kept for API compatibility but unused -
   * the fixture handles localStorage injection at context level.
   */
  async gotoFast(_workspace: string, _orgId: string) {
    // Navigate to chat - localStorage is already set via fixture's context.addInitScript
    await this.page.goto("/chat", { waitUntil: "domcontentloaded" })

    // Wait for workspace ready with generous timeout
    // Zustand persist hydration can be very slow under parallel load
    await expect(this.page.locator(TEST_SELECTORS.workspaceReady)).toBeAttached({
      timeout: TEST_TIMEOUTS.max, // 15s - hydration under load can be very slow
    })
  }

  /**
   * Wait for workspace to be fully initialized
   * Should be called before any chat interactions
   */
  async waitForReady() {
    await expect(this.page.locator(TEST_SELECTORS.workspaceReady)).toBeVisible({
      timeout: TEST_TIMEOUTS.slow,
    })
  }

  /**
   * Send a message and wait for send button to be ready
   * @param text Message to send
   */
  async sendMessage(text: string) {
    await this.messageInput.fill(text)
    await expect(this.sendButton).toBeEnabled({ timeout: TEST_TIMEOUTS.fast })
    await this.sendButton.click()
  }

  /**
   * Expect a message to appear in the chat
   * Uses .first() to handle messages appearing in both sidebar and chat area
   */
  async expectMessage(text: string | RegExp) {
    const locator = typeof text === "string" ? this.page.getByText(text, { exact: true }) : this.page.getByText(text)

    await expect(locator.first()).toBeVisible({
      timeout: TEST_TIMEOUTS.medium,
    })
  }

  /**
   * Expect send button to be enabled
   *
   * Note: Uses medium timeout because after sending a message,
   * the button needs time to process response and re-enable
   */
  async expectSendButtonEnabled() {
    await expect(this.sendButton).toBeEnabled({
      timeout: TEST_TIMEOUTS.medium, // 3s - needs time for response cycle
    })
  }

  /**
   * Expect send button to be disabled
   */
  async expectSendButtonDisabled() {
    await expect(this.sendButton).toBeDisabled({
      timeout: TEST_TIMEOUTS.medium, // Need more time as button may render after page loads
    })
  }

  /**
   * Get the message input element
   */
  get messageInput() {
    return this.page.locator(TEST_SELECTORS.messageInput)
  }

  /**
   * Get the send button element
   */
  get sendButton() {
    return this.page.locator(TEST_SELECTORS.sendButton)
  }

  /**
   * Get the stop button element (visible during streaming)
   */
  get stopButton() {
    return this.page.locator(TEST_SELECTORS.stopButton)
  }

  /**
   * Check if send button is visible
   */
  async isSendButtonVisible() {
    return this.sendButton.isVisible()
  }

  /**
   * Check if stop button is visible (indicates streaming)
   */
  async isStopButtonVisible() {
    return this.stopButton.isVisible()
  }
}
