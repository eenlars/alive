"use client"
import { createContext, type ReactNode, useCallback, useContext, useState } from "react"

export interface SandboxEntry {
  id: string
  timestamp: string
  type: "log" | "error" | "info" | "success"
  message: string
  data?: unknown
}

/** Element selection context from alive-tagger Cmd+Click */
export interface ElementSelection {
  displayName: string
  fileName: string
  lineNumber: number
  columnNumber?: number
}

/** View mode for the right panel (site preview, code editor, terminal, files) */
export type PanelView = "site" | "code" | "terminal" | "files"

/** State for the right panel */
export interface PanelState {
  view: PanelView
  /** Current path in site preview (URL path) */
  sitePath: string
  /** Currently open file path (for code view) */
  filePath: string | null
  /** Expanded folders in the file tree */
  expandedFolders: Set<string>
  /** Width of the file tree sidebar */
  treeWidth: number
  /** Whether tree sidebar is collapsed */
  treeCollapsed: boolean
}

/** @deprecated Use PanelView instead */
export type PreviewMode = PanelView
/** @deprecated Use PanelState instead */
export type PreviewState = PanelState

interface PanelContextType {
  entries: SandboxEntry[]
  addEntry: (entry: Omit<SandboxEntry, "id" | "timestamp">) => void
  clearEntries: () => void
  /** Currently selected element (from alive-tagger) */
  selectedElement: ElementSelection | null
  /** Set selected element - called from panel when receiving postMessage */
  setSelectedElement: (element: ElementSelection | null) => void
  /** Callback for when element is selected - set by chat page to insert into input */
  onElementSelect: ((element: ElementSelection) => void) | null
  /** Register the callback for element selection */
  registerElementSelectHandler: (handler: (element: ElementSelection) => void) => void
  /** Whether element selector mode is active */
  selectorActive: boolean
  /** Activate element selector mode in the preview iframe */
  activateSelector: () => void
  /** Deactivate element selector mode */
  deactivateSelector: () => void
  /** Panel state */
  panel: PanelState
  /** Set panel view */
  setPanelView: (view: PanelView) => void
  /** Open a file in code view */
  openFile: (filePath: string) => void
  /** Close current file */
  closeFile: () => void
  /** Toggle folder expanded state */
  toggleFolder: (path: string) => void
  /** Set tree sidebar width */
  setTreeWidth: (width: number) => void
  /** Toggle tree sidebar collapsed */
  toggleTreeCollapsed: () => void
  /** Set site preview path */
  setSitePath: (path: string) => void
}

const PanelContext = createContext<PanelContextType | undefined>(undefined)

const DEFAULT_TREE_WIDTH = 200

const DEFAULT_PANEL_STATE: PanelState = {
  view: "site",
  sitePath: "/",
  filePath: null,
  expandedFolders: new Set<string>(),
  treeWidth: DEFAULT_TREE_WIDTH,
  treeCollapsed: false,
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<SandboxEntry[]>([])
  const [selectedElement, setSelectedElementState] = useState<ElementSelection | null>(null)
  const [onElementSelect, setOnElementSelect] = useState<((element: ElementSelection) => void) | null>(null)
  const [panel, setPanel] = useState<PanelState>(DEFAULT_PANEL_STATE)
  const [selectorActive, setSelectorActive] = useState(false)

  const addEntry = (entry: Omit<SandboxEntry, "id" | "timestamp">) => {
    const newEntry: SandboxEntry = {
      ...entry,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
    }
    setEntries(prev => [...prev, newEntry])
  }

  const clearEntries = () => {
    setEntries([])
  }

  const setSelectedElement = useCallback(
    (element: ElementSelection | null) => {
      setSelectedElementState(element)
      // Deactivate selector when element is selected
      if (element) {
        setSelectorActive(false)
      }
      if (element && onElementSelect) {
        onElementSelect(element)
      }
    },
    [onElementSelect],
  )

  const activateSelector = useCallback(() => {
    setSelectorActive(prev => !prev)
  }, [])

  const deactivateSelector = useCallback(() => {
    setSelectorActive(false)
  }, [])

  const registerElementSelectHandler = useCallback((handler: (element: ElementSelection) => void) => {
    setOnElementSelect(() => handler)
  }, [])

  const setPanelView = useCallback((view: PanelView) => {
    setPanel(prev => ({ ...prev, view }))
  }, [])

  const openFile = useCallback((filePath: string) => {
    // Auto-expand parent folders when opening a file
    const parts = filePath.split("/")
    const parentPaths: string[] = []
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join("/"))
    }

    setPanel(prev => {
      const newExpanded = new Set(prev.expandedFolders)
      for (const p of parentPaths) {
        newExpanded.add(p)
      }
      return { ...prev, view: "code", filePath, expandedFolders: newExpanded }
    })
  }, [])

  const closeFile = useCallback(() => {
    setPanel(prev => ({ ...prev, filePath: null }))
  }, [])

  const toggleFolder = useCallback((path: string) => {
    setPanel(prev => {
      const newExpanded = new Set(prev.expandedFolders)
      if (newExpanded.has(path)) {
        newExpanded.delete(path)
      } else {
        newExpanded.add(path)
      }
      return { ...prev, expandedFolders: newExpanded }
    })
  }, [])

  const setTreeWidth = useCallback((width: number) => {
    setPanel(prev => ({ ...prev, treeWidth: width }))
  }, [])

  const toggleTreeCollapsed = useCallback(() => {
    setPanel(prev => ({ ...prev, treeCollapsed: !prev.treeCollapsed }))
  }, [])

  const setSitePath = useCallback((sitePath: string) => {
    setPanel(prev => ({ ...prev, sitePath }))
  }, [])

  return (
    <PanelContext.Provider
      value={{
        entries,
        addEntry,
        clearEntries,
        selectedElement,
        setSelectedElement,
        onElementSelect,
        registerElementSelectHandler,
        selectorActive,
        activateSelector,
        deactivateSelector,
        panel,
        setPanelView,
        openFile,
        closeFile,
        toggleFolder,
        setTreeWidth,
        toggleTreeCollapsed,
        setSitePath,
      }}
    >
      {children}
    </PanelContext.Provider>
  )
}

export function usePanelContext() {
  const context = useContext(PanelContext)
  if (!context) {
    throw new Error("usePanelContext must be used within PanelProvider")
  }
  return context
}

/** @deprecated Use PanelProvider instead */
export const SandboxProvider = PanelProvider
/** @deprecated Use usePanelContext instead */
export const useSandboxContext = usePanelContext
