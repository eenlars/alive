import { WORKSPACE_STORAGE, type WorkspaceStorageValue } from "@webalive/shared"
import { expect, test } from "./fixtures"
import { gotoChatFast } from "./helpers/assertions"

/**
 * Organization and Workspace Selection - Worker Isolated
 *
 * Tests workspace selection with dedicated worker tenant.
 * Uses authenticatedPage fixture + gotoChatFast for speed.
 */

test.describe("Organization and Workspace Selection", () => {
  test.skip("workspace loads and chat interface is functional", async ({ authenticatedPage, workerTenant }) => {
    await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

    // Workspace-ready already confirmed by gotoChatFast, just verify UI elements
    const messageInput = authenticatedPage.locator('[data-testid="message-input"]')
    await expect(messageInput).toBeVisible({ timeout: 5000 })

    // Verify workspace is set using typed constants from @webalive/shared
    const storageValue = await authenticatedPage.evaluate(key => localStorage.getItem(key), WORKSPACE_STORAGE.KEY)
    expect(storageValue).not.toBeNull()
    const parsed = JSON.parse(storageValue!) as WorkspaceStorageValue
    expect(parsed.state.currentWorkspace).toBe(workerTenant.workspace)

    // Fill message and verify send button is enabled (proves workspace is set)
    await messageInput.fill("test message")
    const sendButton = authenticatedPage.getByTestId("send-button")
    await expect(sendButton).toBeEnabled({ timeout: 5000 })
  })
})
