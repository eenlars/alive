import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { useDexieMessageStore } from "../dexieMessageStore"
import { getMessageDb } from "../messageDb"

const TEST_USER_ID = "test-user-tool-state"
const TEST_ORG_ID = "test-org-tool-state"
const TEST_WORKSPACE = "tool-state.test.com"
const TEST_TAB_ID = "tab-tool-state"
const TEST_TAB_GROUP_ID = "tabgroup-tool-state"

function sdkMessage(id: string, content: object): UIMessage {
  return {
    id,
    type: "sdk_message",
    content,
    timestamp: new Date(),
  }
}

describe("updateToolResultContentByToolUseId", () => {
  beforeEach(async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, TEST_TAB_GROUP_ID, TEST_TAB_ID)
  })

  afterEach(async () => {
    const db = getMessageDb(TEST_USER_ID)
    await db.delete()
    await db.open()
  })

  it("updates the matching tool_result block and marks message pending sync", async () => {
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    await store.addMessage(
      sdkMessage("tool-result-msg", {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_email_1",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    to: ["user@example.com"],
                    subject: "Re: FW: Online versie",
                    body: "Body",
                    status: "draft",
                  }),
                },
              ],
            },
          ],
        },
      }),
      TEST_TAB_ID,
    )

    const updated = await store.updateToolResultContentByToolUseId(TEST_TAB_ID, "toolu_email_1", content => {
      const blocks = content as Array<{ type: string; text: string }>
      const parsed = JSON.parse(blocks[0].text) as Record<string, unknown>
      const next = [{ ...blocks[0], text: JSON.stringify({ ...parsed, status: "sent", id: "gmail-msg-1" }) }]
      return next
    })

    expect(updated).toBe(true)

    const message = await db.messages.get("tool-result-msg")
    expect(message?.pendingSync).toBe(true)
    expect(message?.content.kind).toBe("sdk_message")

    const sdkData = (message?.content as { kind: "sdk_message"; data: Record<string, unknown> }).data
    const toolResult = ((sdkData.message as { content: unknown[] }).content[0] as { content: Array<{ text: string }> })
      .content[0]
    const payload = JSON.parse(toolResult.text) as Record<string, unknown>

    expect(payload.status).toBe("sent")
    expect(payload.id).toBe("gmail-msg-1")
  })
})
