"use client"

import { create } from "zustand"

interface ConversationSidebarState {
  isOpen: boolean
}

interface ConversationSidebarActions {
  actions: {
    toggleSidebar: () => void
    openSidebar: () => void
    closeSidebar: () => void
  }
}

type ConversationSidebarStore = ConversationSidebarState & ConversationSidebarActions

const useConversationSidebarStoreBase = create<ConversationSidebarStore>()(set => ({
  // Default to closed to keep server and client render consistent.
  isOpen: false,
  actions: {
    toggleSidebar: () => set(state => ({ isOpen: !state.isOpen })),
    openSidebar: () => set({ isOpen: true }),
    closeSidebar: () => set({ isOpen: false }),
  },
}))

export const useSidebarOpen = () => useConversationSidebarStoreBase(state => state.isOpen)

export const useSidebarActions = () => useConversationSidebarStoreBase(state => state.actions)
