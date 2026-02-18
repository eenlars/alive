/**
 * Chat E2E Tests - Fast Version
 *
 * Uses authenticatedPage fixture + gotoFast for speed.
 * No login flow, state pre-injected before navigation.
 */

import { expect, test } from "./fixtures"
import { TEST_MESSAGES, TEST_TIMEOUTS } from "./fixtures/test-data"
import { handlers } from "./lib/handlers"
import { ChatPage } from "./pages/ChatPage"

test("has chat interface", async ({ authenticatedPage, workerTenant }) => {
  const chat = new ChatPage(authenticatedPage)
  await chat.gotoFast(workerTenant.workspace, workerTenant.orgId)

  await expect(chat.messageInput).toBeVisible({ timeout: TEST_TIMEOUTS.medium })
  await expect(chat.sendButton).toBeVisible({ timeout: TEST_TIMEOUTS.fast })
})

test("can send a message and receive response", async ({ authenticatedPage, workerTenant }) => {
  await authenticatedPage.route("**/api/claude/stream", handlers.text("Hi there! How can I help you today?"))

  const chat = new ChatPage(authenticatedPage)
  await chat.gotoFast(workerTenant.workspace, workerTenant.orgId)

  await chat.sendMessage(TEST_MESSAGES.simple)
  await chat.expectMessage(TEST_MESSAGES.simple)
  await chat.expectMessage(/Hi there.*help you today/)
})

test("can send multiple messages", async ({ authenticatedPage, workerTenant }) => {
  await authenticatedPage.route("**/api/claude/stream", handlers.text("Response received"))

  const chat = new ChatPage(authenticatedPage)
  await chat.gotoFast(workerTenant.workspace, workerTenant.orgId)

  // First message
  await chat.sendMessage(TEST_MESSAGES.simple)
  await chat.expectMessage(TEST_MESSAGES.simple)
  await chat.expectMessage("Response received")

  // Verify ready for next message
  await chat.messageInput.fill(TEST_MESSAGES.question)
  await chat.expectSendButtonEnabled()

  // Second message
  await chat.sendButton.click()
  await chat.expectMessage(TEST_MESSAGES.question)
  await chat.expectMessage("Response received")
})

test("can send a message that reads a file", async ({ authenticatedPage, workerTenant }) => {
  const readPath = "/workspace/README.md"
  const readContent = "# Alive\nSending messages must always work."
  const readResponse = "I read /workspace/README.md. First line: # Alive"

  await authenticatedPage.route("**/api/claude/stream", handlers.fileRead(readPath, readContent, readResponse))

  const chat = new ChatPage(authenticatedPage)
  await chat.gotoFast(workerTenant.workspace, workerTenant.orgId)

  const prompt = "Read README.md and tell me the first line."
  await chat.sendMessage(prompt)
  await chat.expectMessage(prompt)
  await chat.expectMessage(readResponse)
})
