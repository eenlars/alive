import { create } from "zustand"
import type { EditTreeNode } from "../api/edit"

export interface EditorTab {
  path: string
  name: string
  content: string
  originalContent: string
  mtime: number
  // For image tabs
  isImage?: boolean
  dataUrl?: string
  // For template tabs (read-only)
  isTemplate?: boolean
  templateId?: string
}

interface EditorState {
  // Directory selection
  currentDirectory: string
  directoryLabel: string
  directoryPath: string

  // File tree
  editorTree: EditTreeNode[]
  editorTreeLoading: boolean
  editorTreeError: string

  // Tabs
  openTabs: EditorTab[]
  activeTabPath: string

  // Current file loading state
  fileLoading: boolean
  fileError: string

  // Editor state
  isSaving: boolean
  saveError: string
  saveSuccess: string

  // Actions
  setDirectory: (id: string) => void
  setDirectoryInfo: (label: string, path: string) => void
  setTree: (tree: EditTreeNode[]) => void
  setTreeLoading: (loading: boolean) => void
  setTreeError: (error: string) => void

  // Tab actions
  openTab: (
    path: string,
    name: string,
    content: string,
    mtime: number,
    options?: { isImage?: true; dataUrl?: string } | { isTemplate?: true; templateId?: string },
  ) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  updateTabContent: (path: string, content: string) => void
  updateTabOriginal: (path: string, content: string, mtime: number) => void
  refreshTab: (path: string, content: string, mtime: number) => void

  // File loading
  setFileLoading: (loading: boolean) => void
  setFileError: (error: string) => void

  // Save state
  setSaving: (saving: boolean) => void
  setSaveError: (error: string) => void
  setSaveSuccess: (success: string) => void
  clearSaveStatus: () => void

  // Legacy compatibility
  clearCurrentFile: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Directory selection
  currentDirectory: "",
  directoryLabel: "",
  directoryPath: "",

  // File tree
  editorTree: [],
  editorTreeLoading: false,
  editorTreeError: "",

  // Tabs
  openTabs: [],
  activeTabPath: "",

  // File loading state
  fileLoading: false,
  fileError: "",

  // Editor state
  isSaving: false,
  saveError: "",
  saveSuccess: "",

  // Actions
  setDirectory: id => {
    set({ currentDirectory: id, openTabs: [], activeTabPath: "" })
  },
  setDirectoryInfo: (label, path) => set({ directoryLabel: label, directoryPath: path }),
  setTree: tree => set({ editorTree: tree }),
  setTreeLoading: loading => set({ editorTreeLoading: loading }),
  setTreeError: error => set({ editorTreeError: error }),

  // Tab actions
  openTab: (path, name, content, mtime, options) => {
    const { openTabs } = get()
    const existing = openTabs.find(t => t.path === path)
    if (existing) {
      // Tab already open, just activate it
      set({ activeTabPath: path })
    } else {
      // Add new tab
      const tab: EditorTab = { path, name, content, originalContent: content, mtime }
      if (options && "isImage" in options && options.isImage) {
        tab.isImage = true
        tab.dataUrl = options.dataUrl
      } else if (options && "isTemplate" in options && options.isTemplate) {
        tab.isTemplate = true
        tab.templateId = options.templateId
      }
      set({
        openTabs: [...openTabs, tab],
        activeTabPath: path,
      })
    }
  },

  closeTab: path => {
    const { openTabs, activeTabPath } = get()
    const newTabs = openTabs.filter(t => t.path !== path)
    let newActive = activeTabPath

    if (activeTabPath === path) {
      // Find next tab to activate
      const closedIndex = openTabs.findIndex(t => t.path === path)
      if (newTabs.length > 0) {
        newActive = newTabs[Math.min(closedIndex, newTabs.length - 1)].path
      } else {
        newActive = ""
      }
    }

    set({ openTabs: newTabs, activeTabPath: newActive })
  },

  setActiveTab: path => set({ activeTabPath: path }),

  updateTabContent: (path, content) => {
    const { openTabs } = get()
    set({
      openTabs: openTabs.map(t => (t.path === path ? { ...t, content } : t)),
    })
  },

  updateTabOriginal: (path, content, mtime) => {
    const { openTabs } = get()
    set({
      openTabs: openTabs.map(t => (t.path === path ? { ...t, content, originalContent: content, mtime } : t)),
    })
  },

  refreshTab: (path, content, mtime) => {
    const { openTabs } = get()
    set({
      openTabs: openTabs.map(t => (t.path === path ? { ...t, content, originalContent: content, mtime } : t)),
    })
  },

  // File loading
  setFileLoading: loading => set({ fileLoading: loading }),
  setFileError: error => set({ fileError: error }),

  // Save state
  setSaving: saving => set({ isSaving: saving }),
  setSaveError: error => set({ saveError: error }),
  setSaveSuccess: success => set({ saveSuccess: success }),
  clearSaveStatus: () => set({ saveError: "", saveSuccess: "" }),

  // Legacy compatibility
  clearCurrentFile: () => set({ openTabs: [], activeTabPath: "", fileError: "" }),
}))

// Selectors
export const useActiveTab = () => useEditorStore(state => state.openTabs.find(t => t.path === state.activeTabPath))

export const useIsTabModified = (path: string) =>
  useEditorStore(state => {
    const tab = state.openTabs.find(t => t.path === path)
    return tab ? tab.content !== tab.originalContent : false
  })

export const useIsActiveTabModified = () =>
  useEditorStore(state => {
    const tab = state.openTabs.find(t => t.path === state.activeTabPath)
    return tab ? tab.content !== tab.originalContent : false
  })

export const useHasAnyModifiedTab = () =>
  useEditorStore(state => state.openTabs.some(t => t.content !== t.originalContent))

// Legacy compatibility - kept for backwards compat
export const useIsModified = useIsActiveTabModified
