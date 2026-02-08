/**
 * Tab Rename Propagation Tests
 *
 * Verifies that renaming a tab via the tabStore facade (used by the TabBar UI)
 * propagates the name to BOTH localStorage (tabDataStore) AND Dexie (IndexedDB).
 *
 * Regression test for: tab renames only saved to localStorage, lost on sync
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTabDataStore } from "../tabDataStore"
import { useTabStore } from "../tabStore"

// Mock the Dexie store's renameTab to verify it gets called
const mockDexieRenameTab = vi.fn().mockResolvedValue(undefined)

vi.mock("@/lib/db/dexieMessageStore", () => ({
  useDexieMessageStore: {
    getState: () => ({
      renameTab: mockDexieRenameTab,
    }),
  },
}))

const WORKSPACE = "rename-test.example.com"
const TAB_GROUP = "group-1"

describe("Tab rename propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset stores
    useTabDataStore.setState({ tabsByWorkspace: {} })
  })

  afterEach(() => {
    useTabDataStore.setState({ tabsByWorkspace: {} })
  })

  it("renameTab should update both localStorage and Dexie", () => {
    const actions = useTabStore.getState()

    // Create a tab
    const tab = actions.addTab(WORKSPACE, TAB_GROUP, "Original name")
    expect(tab).not.toBeNull()
    const tabId = tab!.id

    // Rename via the facade (same path as the TabBar UI)
    actions.renameTab(WORKSPACE, tabId, "Renamed by user")

    // Verify localStorage was updated
    const tabs = useTabDataStore.getState().tabsByWorkspace[WORKSPACE] ?? []
    const renamed = tabs.find(t => t.id === tabId)
    expect(renamed).toBeDefined()
    expect(renamed!.name).toBe("Renamed by user")

    // Verify Dexie renameTab was called with the correct arguments
    expect(mockDexieRenameTab).toHaveBeenCalledTimes(1)
    expect(mockDexieRenameTab).toHaveBeenCalledWith(tabId, "Renamed by user")
  })

  it("renameTab should propagate to Dexie even for empty-trimmed names", () => {
    const actions = useTabStore.getState()

    const tab = actions.addTab(WORKSPACE, TAB_GROUP, "Some tab")
    expect(tab).not.toBeNull()
    const tabId = tab!.id

    // Rename with whitespace (tabModel trims to "Untitled")
    actions.renameTab(WORKSPACE, tabId, "   ")

    // localStorage should have "Untitled"
    const tabs = useTabDataStore.getState().tabsByWorkspace[WORKSPACE] ?? []
    const renamed = tabs.find(t => t.id === tabId)
    expect(renamed!.name).toBe("Untitled")

    // Dexie should also be called (it handles its own trimming)
    expect(mockDexieRenameTab).toHaveBeenCalledWith(tabId, "   ")
  })

  it("each rename call should trigger a separate Dexie update", () => {
    const actions = useTabStore.getState()

    const tab = actions.addTab(WORKSPACE, TAB_GROUP, "Tab")
    expect(tab).not.toBeNull()
    const tabId = tab!.id

    actions.renameTab(WORKSPACE, tabId, "First rename")
    actions.renameTab(WORKSPACE, tabId, "Second rename")
    actions.renameTab(WORKSPACE, tabId, "Third rename")

    expect(mockDexieRenameTab).toHaveBeenCalledTimes(3)
    expect(mockDexieRenameTab).toHaveBeenNthCalledWith(1, tabId, "First rename")
    expect(mockDexieRenameTab).toHaveBeenNthCalledWith(2, tabId, "Second rename")
    expect(mockDexieRenameTab).toHaveBeenNthCalledWith(3, tabId, "Third rename")

    // localStorage should reflect the last rename
    const tabs = useTabDataStore.getState().tabsByWorkspace[WORKSPACE] ?? []
    expect(tabs.find(t => t.id === tabId)!.name).toBe("Third rename")
  })

  it("Dexie failure should not break localStorage rename", () => {
    // Simulate Dexie failure
    mockDexieRenameTab.mockRejectedValueOnce(new Error("IndexedDB write failed"))

    const actions = useTabStore.getState()
    const tab = actions.addTab(WORKSPACE, TAB_GROUP, "Tab")
    expect(tab).not.toBeNull()
    const tabId = tab!.id

    // Should not throw — Dexie call is fire-and-forget (void)
    expect(() => actions.renameTab(WORKSPACE, tabId, "New name")).not.toThrow()

    // localStorage should still be updated
    const tabs = useTabDataStore.getState().tabsByWorkspace[WORKSPACE] ?? []
    expect(tabs.find(t => t.id === tabId)!.name).toBe("New name")

    // Dexie was called (even though it failed)
    expect(mockDexieRenameTab).toHaveBeenCalledWith(tabId, "New name")
  })
})
