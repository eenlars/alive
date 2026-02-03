"use client"

import { createContext, useContext } from "react"
import type { ChatInputContextValue } from "./types"

const ChatInputContext = createContext<ChatInputContextValue | null>(null)

export function useChatInput() {
  const context = useContext(ChatInputContext)
  if (!context) {
    throw new Error("ChatInput compound components must be used within ChatInput.Root")
  }
  return context
}

export const ChatInputProvider = ChatInputContext.Provider
