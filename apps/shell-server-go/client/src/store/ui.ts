import { create } from "zustand"
import type { MessageType } from "../types/domain"

interface UIState {
  message: string
  messageType: MessageType
  dropdownOpen: boolean
  dropdownFilter: string
  highlightedIndex: number

  setMessage: (msg: string, type: MessageType) => void
  clearMessage: () => void
  openDropdown: () => void
  closeDropdown: () => void
  setDropdownFilter: (filter: string) => void
  setHighlightedIndex: (index: number) => void
}

export const useUIStore = create<UIState>(set => ({
  message: "",
  messageType: null,
  dropdownOpen: false,
  dropdownFilter: "",
  highlightedIndex: -1,

  setMessage: (msg, type) => set({ message: msg, messageType: type }),
  clearMessage: () => set({ message: "", messageType: null }),
  openDropdown: () => set({ dropdownOpen: true, dropdownFilter: "", highlightedIndex: -1 }),
  closeDropdown: () => set({ dropdownOpen: false, dropdownFilter: "" }),
  setDropdownFilter: filter => set({ dropdownFilter: filter }),
  setHighlightedIndex: index => set({ highlightedIndex: index }),
}))
