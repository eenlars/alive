"use client"

/**
 * Tab Sync - Bridges Dexie tabs to localStorage tabStore
 *
 * When conversations are fetched from the server, the tabs are stored in Dexie (IndexedDB).
 * But the chat UI uses localStorage tabStore for active tab management.
 *
 * This module syncs tabs from Dexie to localStorage to enable cross-device sync:
 * 1. User creates conversation on desktop -> syncs to Supabase
 * 2. User opens iPhone -> fetches from Supabase -> stores in Dexie
 * 3. This module copies Dexie tabs to localStorage tabStore
 * 4. Sidebar shows conversation, clicking it loads the correct messages
 */

import type { Tab } from "@/lib/tabs/tabModel"
import { useTabDataStore } from "@/lib/stores/tabDataStore"
import type { TabGroupId, TabId } from "@/lib/types/ids"
import type { DbTab } from "./messageDb"

/**
 * Sync tabs from Dexie to localStorage tabStore for a specific workspace.
 *
 * This ensures that tabs fetched from the server are available in the UI.
 * Only adds tabs that don't already exist in localStorage (preserves local state).
 */
export function syncDexieTabsToLocalStorage(
  workspace: string,
  dexieTabs: DbTab[],
  conversations: Array<{ id: string; title: string }>,
): void {
  if (typeof window === "undefined") return
  if (dexieTabs.length === 0) return

  const tabDataStore = useTabDataStore.getState()
  const existingTabs = tabDataStore.tabsByWorkspace[workspace] ?? []
  const existingTabIds = new Set(existingTabs.map(t => t.id))

  // Build a map of conversation titles for tab naming
  const titleMap = new Map(conversations.map(c => [c.id, c.title]))

  // Convert Dexie tabs to localStorage Tab format, skipping existing ones
  const newTabs: Tab[] = []
  for (const dexieTab of dexieTabs) {
    // Skip if tab already exists locally
    if (existingTabIds.has(dexieTab.id as TabId)) continue

    // Skip closed tabs (they'll be re-synced if reopened)
    if (dexieTab.closedAt != null) continue

    // Convert DbTab to localStorage Tab format
    const tab: Tab = {
      id: dexieTab.id as TabId,
      tabGroupId: dexieTab.conversationId as TabGroupId,
      name: dexieTab.name || titleMap.get(dexieTab.conversationId) || "Synced tab",
      tabNumber: dexieTab.position + 1, // position is 0-indexed, tabNumber is 1-indexed
      createdAt: dexieTab.createdAt,
      closedAt: dexieTab.closedAt,
    }

    newTabs.push(tab)
  }

  if (newTabs.length === 0) return

  // Update localStorage tabStore
  useTabDataStore.setState(state => ({
    tabsByWorkspace: {
      ...state.tabsByWorkspace,
      [workspace]: [...existingTabs, ...newTabs],
    },
  }))

  console.log(`[tabSync] Synced ${newTabs.length} tabs from server to localStorage for ${workspace}`)
}
