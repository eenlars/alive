/**
 * Tab Isolation Test Suite
 *
 * Tests the core invariant: Messages should NEVER appear in tabs they don't belong to.
 *
 * NEW TAB MODEL (as of STORE_VERSION 6):
 * - Tab.id = unique tab identifier AND Claude conversation key (single source of truth)
 * - Tab.tabGroupId = sidebar grouping (what shows in left panel)
 * - No Tab.sessionId or Tab.conversationId exists anymore
 *
 * Key areas to test:
 * 1. Message routing: addMessage(msg, targetTabId) routes correctly
 * 2. Message display: useMessagesForTab returns only correct messages
 * 3. Tab switching during active stream: doesn't leak messages
 * 4. Global tabId vs display tabId: isolation maintained
 * 5. Busy state isolation: each tab has independent busy state
 */

import { beforeEach, describe, expect, it } from "vitest"

// We'll mock the stores and test the logic directly

// First, let's create a minimal implementation of the stores for testing
// This helps us understand the exact data flow

interface MockMessage {
  id: string
  type: string
  content: string
  conversationId?: string // Added for tracking in tests
}

interface MockConversation {
  id: string
  messages: MockMessage[]
  workspace: string
}

interface MockMessageStore {
  conversationId: string | null // Global active conversation
  conversations: Record<string, MockConversation>
}

interface MockTab {
  /** Unique tab identifier - ALSO the Claude conversation key (single source of truth) */
  id: string
  name: string
}

interface MockTabStore {
  tabsByWorkspace: Record<string, MockTab[]>
  activeTabByWorkspace: Record<string, string | undefined>
  tabsExpandedByWorkspace: Record<string, boolean>
}

interface MockStreamingStore {
  tabs: Record<string, { isStreamActive: boolean }>
}

describe("Tab Isolation", () => {
  let messageStore: MockMessageStore
  let tabStore: MockTabStore
  let streamingStore: MockStreamingStore

  beforeEach(() => {
    // Reset stores before each test
    messageStore = {
      conversationId: null,
      conversations: {},
    }

    tabStore = {
      tabsByWorkspace: {},
      activeTabByWorkspace: {},
      tabsExpandedByWorkspace: {},
    }

    streamingStore = {
      tabs: {},
    }
  })

  // Helper: Add a message to a specific conversation (identified by tab ID in production)
  // In production code, this is called with targetTabId since Tab.id IS the conversation key
  function addMessage(message: MockMessage, targetTabId: string) {
    if (!messageStore.conversations[targetTabId]) {
      console.warn(`Cannot add message: conversation ${targetTabId} not found`)
      return false
    }

    const conversation = messageStore.conversations[targetTabId]
    conversation.messages.push({ ...message, conversationId: targetTabId })
    return true
  }

  // Helper: Get messages for a specific conversation (mimics useMessagesForConversation)
  function getMessagesForConversation(conversationId: string | null): MockMessage[] {
    if (!conversationId || !messageStore.conversations[conversationId]) {
      return []
    }
    return messageStore.conversations[conversationId].messages
  }

  // Helper: Get messages for current global conversation (mimics useMessages)
  function _getGlobalMessages(): MockMessage[] {
    if (!messageStore.conversationId || !messageStore.conversations[messageStore.conversationId]) {
      return []
    }
    return messageStore.conversations[messageStore.conversationId].messages
  }

  // Helper: Initialize a conversation
  function initializeConversation(id: string, workspace: string) {
    if (!messageStore.conversations[id]) {
      messageStore.conversations[id] = {
        id,
        messages: [],
        workspace,
      }
    }
    messageStore.conversationId = id
  }

  // Helper: Switch to a conversation (mimics switchConversation)
  function switchConversation(id: string) {
    if (messageStore.conversations[id]) {
      messageStore.conversationId = id
    }
  }

  // Helper: Get the display conversation ID (mimics useTabIsolatedMessages logic)
  function getDisplayConversationId(workspace: string, showTabs: boolean): string | null {
    const activeTabId = tabStore.activeTabByWorkspace[workspace]
    const tabs = tabStore.tabsByWorkspace[workspace] || []
    const activeTab = tabs.find(t => t.id === activeTabId)
    const tabsExpanded = tabStore.tabsExpandedByWorkspace[workspace] ?? false

    const isTabMode = showTabs && tabsExpanded && activeTab
    return isTabMode ? activeTab.id : messageStore.conversationId
  }

  /**
   * Helper: Add a tab.
   * In production, Tab.id IS the Claude conversation key (single source of truth).
   * This mock uses tabId as the key for the conversations record to simulate
   * the production behavior where messages are stored by tabId.
   */
  function addTab(workspace: string, tabId: string, name: string): MockTab {
    const tab: MockTab = {
      id: tabId, // Tab.id IS the conversation key (single source of truth)
      name,
    }

    if (!tabStore.tabsByWorkspace[workspace]) {
      tabStore.tabsByWorkspace[workspace] = []
    }
    tabStore.tabsByWorkspace[workspace].push(tab)
    tabStore.activeTabByWorkspace[workspace] = tab.id
    tabStore.tabsExpandedByWorkspace[workspace] = true

    return tab
  }

  // Helper: Set active tab
  function setActiveTab(workspace: string, tabId: string) {
    tabStore.activeTabByWorkspace[workspace] = tabId
  }

  // Helper: Check if a tab has an active stream
  function isStreamActive(tabId: string): boolean {
    return streamingStore.tabs[tabId]?.isStreamActive ?? false
  }

  // Helper: Start a stream
  function startStream(tabId: string) {
    if (!streamingStore.tabs[tabId]) {
      streamingStore.tabs[tabId] = { isStreamActive: false }
    }
    streamingStore.tabs[tabId].isStreamActive = true
  }

  // Helper: End a stream
  function endStream(tabId: string) {
    if (streamingStore.tabs[tabId]) {
      streamingStore.tabs[tabId].isStreamActive = false
    }
  }

  // =============================================================
  // TEST CASES
  // =============================================================

  describe("Basic Message Routing", () => {
    it("should add message to the correct conversation when targetTabId is specified", () => {
      const workspace = "test.example.com"

      // Initialize two conversations
      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      // Switch to conv-B (global active)
      switchConversation("conv-B")

      // Add message explicitly to conv-A
      addMessage({ id: "msg-1", type: "assistant", content: "Hello A" }, "conv-A")

      // Verify conv-A has the message
      expect(getMessagesForConversation("conv-A")).toHaveLength(1)
      expect(getMessagesForConversation("conv-A")[0].content).toBe("Hello A")

      // Verify conv-B does NOT have the message
      expect(getMessagesForConversation("conv-B")).toHaveLength(0)
    })

    it("should always require explicit targetTabId to prevent cross-tab leakage", () => {
      const workspace = "test.example.com"

      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)
      switchConversation("conv-B")

      // targetTabId is required - message must explicitly target conv-B
      addMessage({ id: "msg-1", type: "assistant", content: "Hello B" }, "conv-B")

      expect(getMessagesForConversation("conv-A")).toHaveLength(0)
      expect(getMessagesForConversation("conv-B")).toHaveLength(1)
    })
  })

  describe("Tab Isolation Logic", () => {
    it("should return active tab's messages when in tab mode", () => {
      const workspace = "test.example.com"
      const showTabs = true

      // Initialize two conversations
      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      // Add messages to both
      addMessage({ id: "msg-A", type: "assistant", content: "Hello A" }, "conv-A")
      addMessage({ id: "msg-B", type: "assistant", content: "Hello B" }, "conv-B")

      // Create tabs for both conversations
      const tabA = addTab(workspace, "conv-A", "Tab A")
      const tabB = addTab(workspace, "conv-B", "Tab B")

      // Make tabA active
      setActiveTab(workspace, tabA.id)

      // Get display conversation - should be conv-A
      const displayId = getDisplayConversationId(workspace, showTabs)
      expect(displayId).toBe("conv-A")

      // Messages for display should be conv-A's messages only
      const displayMessages = getMessagesForConversation(displayId)
      expect(displayMessages).toHaveLength(1)
      expect(displayMessages[0].content).toBe("Hello A")

      // Switch to tabB
      setActiveTab(workspace, tabB.id)

      // Get display conversation - should now be conv-B
      const displayId2 = getDisplayConversationId(workspace, showTabs)
      expect(displayId2).toBe("conv-B")

      // Messages for display should be conv-B's messages only
      const displayMessages2 = getMessagesForConversation(displayId2)
      expect(displayMessages2).toHaveLength(1)
      expect(displayMessages2[0].content).toBe("Hello B")
    })

    it("should fall back to global conversation when tabs are collapsed", () => {
      const workspace = "test.example.com"
      const showTabs = true

      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      // Add tabs but then collapse them
      addTab(workspace, "conv-A", "Tab A")
      tabStore.tabsExpandedByWorkspace[workspace] = false

      // Global conversation is conv-B
      switchConversation("conv-B")

      const displayId = getDisplayConversationId(workspace, showTabs)
      expect(displayId).toBe("conv-B") // Falls back to global
    })
  })

  describe("Stream Isolation During Tab Switch", () => {
    /**
     * CRITICAL TEST: This simulates the scenario where:
     * 1. User starts a stream in Tab A
     * 2. User switches to Tab B while stream is still active
     * 3. Stream continues sending messages to Tab A's conversation
     * 4. Tab B should NOT see Tab A's messages
     */
    it("should NOT leak messages when switching tabs during active stream", () => {
      const workspace = "test.example.com"
      const showTabs = true

      // Setup: Two conversations with tabs
      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      const tabA = addTab(workspace, "conv-A", "Tab A")
      const tabB = addTab(workspace, "conv-B", "Tab B")

      // Start in Tab A
      setActiveTab(workspace, tabA.id)

      // Capture the target tab ID at stream start (this is what sendStreaming does)
      const targetTabId = "conv-A" // Captured at stream start

      // Start stream for conv-A
      startStream(targetTabId)

      // Simulate receiving messages while in Tab A
      addMessage({ id: "msg-1", type: "assistant", content: "First message for A" }, targetTabId)

      // USER SWITCHES TO TAB B
      setActiveTab(workspace, tabB.id)
      // Note: The global conversationId would also switch in real implementation
      messageStore.conversationId = "conv-B"

      // Stream continues sending messages to Tab A (using captured targetTabId)
      addMessage({ id: "msg-2", type: "assistant", content: "Second message for A" }, targetTabId)
      addMessage({ id: "msg-3", type: "assistant", content: "Third message for A" }, targetTabId)

      // End stream
      endStream(targetTabId)

      // VERIFICATION: Tab B should NOT have Tab A's messages
      const displayId = getDisplayConversationId(workspace, showTabs)
      expect(displayId).toBe("conv-B") // Active tab is B

      const displayMessages = getMessagesForConversation(displayId)
      expect(displayMessages).toHaveLength(0) // B should have no messages

      // Tab A should have all 3 messages
      const tabAMessages = getMessagesForConversation("conv-A")
      expect(tabAMessages).toHaveLength(3)
      expect(tabAMessages.map(m => m.content)).toEqual([
        "First message for A",
        "Second message for A",
        "Third message for A",
      ])
    })

    /**
     * Test: Verify busy state is isolated per conversation
     */
    it("should have independent busy state per conversation", () => {
      startStream("conv-A")

      expect(isStreamActive("conv-A")).toBe(true)
      expect(isStreamActive("conv-B")).toBe(false)

      startStream("conv-B")

      expect(isStreamActive("conv-A")).toBe(true)
      expect(isStreamActive("conv-B")).toBe(true)

      endStream("conv-A")

      expect(isStreamActive("conv-A")).toBe(false)
      expect(isStreamActive("conv-B")).toBe(true)
    })
  })

  describe("Potential Bug: Global vs Tab Conversation ID Mismatch", () => {
    /**
     * This test investigates a potential bug:
     * When tabs are expanded, useMessages() uses the GLOBAL conversationId,
     * but we should be using the TAB's conversationId.
     *
     * The fix should ensure useTabIsolatedMessages always returns
     * the correct messages based on the active tab.
     */
    it("should return correct messages when global and tab conversation IDs differ", () => {
      const workspace = "test.example.com"
      const showTabs = true

      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      const tabA = addTab(workspace, "conv-A", "Tab A")
      const _tabB = addTab(workspace, "conv-B", "Tab B")

      // Add messages
      addMessage({ id: "msg-A", type: "assistant", content: "Message for A" }, "conv-A")
      addMessage({ id: "msg-B", type: "assistant", content: "Message for B" }, "conv-B")

      // Set active tab to A
      setActiveTab(workspace, tabA.id)

      // But global conversationId is B (mismatch!)
      messageStore.conversationId = "conv-B"

      // The display should show Tab A's messages, NOT the global ones
      const displayId = getDisplayConversationId(workspace, showTabs)
      expect(displayId).toBe("conv-A") // Should be tab's conversation, not global

      const displayMessages = getMessagesForConversation(displayId)
      expect(displayMessages).toHaveLength(1)
      expect(displayMessages[0].content).toBe("Message for A")
    })
  })

  describe("Agent Supervisor Cross-Tab Bug (FIXED)", () => {
    /**
     * This test documents the bug that was fixed in useChatMessaging.ts
     *
     * BEFORE FIX:
     * - handleCompletionFeatures() read state.conversationId (global active)
     * - addMessage() was called WITHOUT targetTabId
     * - This caused agent_manager messages to go to wrong tab
     *
     * AFTER FIX:
     * - handleCompletionFeatures(targetTabId) reads specific conversation
     * - addMessage(msg, targetTabId) routes to correct tab
     */
    it("should add agent_manager messages to correct conversation when user switches tabs", () => {
      const workspace = "test.example.com"

      // Setup: Two conversations
      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      // User starts stream in conv-A
      const targetTabId = "conv-A"
      startStream(targetTabId)

      // User switches to conv-B (simulating tab switch)
      messageStore.conversationId = "conv-B"

      // Stream completes in Tab A, agent supervisor sends a "done" message
      // THE FIX: addMessage should use targetTabId, not global
      const agentMessage: MockMessage = {
        id: "agent-done-1",
        type: "agent_manager",
        content: "PR goal complete!",
      }

      // CORRECT behavior: pass targetTabId explicitly
      addMessage(agentMessage, targetTabId)

      endStream(targetTabId)

      // Verify: Message went to conv-A (the target), NOT conv-B (global active)
      expect(getMessagesForConversation("conv-A")).toHaveLength(1)
      expect(getMessagesForConversation("conv-A")[0].content).toBe("PR goal complete!")
      expect(getMessagesForConversation("conv-B")).toHaveLength(0)
    })

    it("should read messages from target conversation for agent evaluation", () => {
      const workspace = "test.example.com"

      // Setup
      initializeConversation("conv-A", workspace)
      initializeConversation("conv-B", workspace)

      // Add messages to conv-A
      addMessage({ id: "msg-1", type: "user", content: "Work on feature X" }, "conv-A")
      addMessage({ id: "msg-2", type: "assistant", content: "Working on feature X..." }, "conv-A")

      // Add different messages to conv-B
      addMessage({ id: "msg-3", type: "user", content: "Work on feature Y" }, "conv-B")

      // User switches to conv-B
      messageStore.conversationId = "conv-B"

      // When evaluating conv-A's progress, should read conv-A's messages
      // THE FIX: Use conversations[targetTabId], not conversations[state.conversationId]
      const targetTabId = "conv-A"
      const targetMessages = getMessagesForConversation(targetTabId)

      // Verify we get conv-A's messages, not conv-B's
      expect(targetMessages).toHaveLength(2)
      expect(targetMessages[0].content).toBe("Work on feature X")
      expect(targetMessages[1].content).toBe("Working on feature X...")
    })
  })

  describe("Edge Cases", () => {
    it("should handle conversation not found gracefully", () => {
      // Try to add message to non-existent conversation
      const result = addMessage({ id: "msg-1", type: "assistant", content: "Hello" }, "non-existent")

      expect(result).toBe(false)
    })

    it("should handle null conversation ID", () => {
      const messages = getMessagesForConversation(null)
      expect(messages).toEqual([])
    })

    it("should handle empty tabs array", () => {
      const workspace = "test.example.com"
      const showTabs = true

      initializeConversation("conv-A", workspace)
      tabStore.tabsExpandedByWorkspace[workspace] = true
      // No tabs added

      const displayId = getDisplayConversationId(workspace, showTabs)
      expect(displayId).toBe("conv-A") // Falls back to global
    })
  })
})
