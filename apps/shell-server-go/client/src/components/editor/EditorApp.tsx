import { useCallback, useEffect, useRef, useState } from "react"
import { checkMtimes, copyEditFile, listEditFiles, readEditFile, writeEditFile } from "../../api/edit"
import { saveTemplate } from "../../api/templates"
import {
  useActiveTab,
  useEditorStore,
  useHasAnyModifiedTab,
  useIsActiveTabModified,
  useIsTabModified,
} from "../../store/editor"
import { CodeEditor } from "./CodeEditor"
import { DirectorySelector } from "./DirectorySelector"
import { EditorFileTree } from "./EditorFileTree"
import { TemplatesPanel } from "./TemplatesPanel"

type SidebarTab = "files" | "templates"

function Tab({ path, name }: { path: string; name: string }) {
  const activeTabPath = useEditorStore(s => s.activeTabPath)
  const setActiveTab = useEditorStore(s => s.setActiveTab)
  const closeTab = useEditorStore(s => s.closeTab)
  const openTabs = useEditorStore(s => s.openTabs)
  const isModified = useIsTabModified(path)
  const isActive = activeTabPath === path
  const tab = openTabs.find(t => t.path === path)
  const isTemplate = tab?.isTemplate ?? false

  return (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer border-r border-shell-border ${
        isActive ? "bg-shell-bg text-white" : "bg-shell-surface text-shell-text-muted hover:text-white"
      }`}
      onClick={() => setActiveTab(path)}
    >
      {isTemplate && <span className="text-shell-accent text-xs mr-1">T</span>}
      <span className="truncate max-w-32">{name}</span>
      {isModified && <span className="text-yellow-400 text-xs">●</span>}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          if (isModified && !confirm("Discard unsaved changes?")) return
          closeTab(path)
        }}
        className="ml-1 text-shell-text-muted hover:text-white text-xs leading-none"
      >
        ×
      </button>
    </div>
  )
}

export function EditorApp() {
  const currentDirectory = useEditorStore(s => s.currentDirectory)
  const editorTree = useEditorStore(s => s.editorTree)
  const editorTreeLoading = useEditorStore(s => s.editorTreeLoading)
  const openTabs = useEditorStore(s => s.openTabs)
  const isSaving = useEditorStore(s => s.isSaving)
  const saveError = useEditorStore(s => s.saveError)
  const saveSuccess = useEditorStore(s => s.saveSuccess)
  const activeTab = useActiveTab()
  const isModified = useIsActiveTabModified()
  const hasAnyModified = useHasAnyModifiedTab()

  // New file creation state
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState("")

  // Copy file state
  const [showCopy, setShowCopy] = useState(false)
  const [copyDestination, setCopyDestination] = useState("")
  const [copyError, setCopyError] = useState("")

  // Sidebar tab state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files")

  const setTree = useEditorStore(s => s.setTree)
  const setTreeLoading = useEditorStore(s => s.setTreeLoading)
  const setTreeError = useEditorStore(s => s.setTreeError)
  const setDirectoryInfo = useEditorStore(s => s.setDirectoryInfo)
  const openTab = useEditorStore(s => s.openTab)
  const setActiveTab = useEditorStore(s => s.setActiveTab)
  const updateTabOriginal = useEditorStore(s => s.updateTabOriginal)
  const setFileLoading = useEditorStore(s => s.setFileLoading)
  const setFileError = useEditorStore(s => s.setFileError)
  const setSaving = useEditorStore(s => s.setSaving)
  const setSaveError = useEditorStore(s => s.setSaveError)
  const setSaveSuccess = useEditorStore(s => s.setSaveSuccess)
  const clearCurrentFile = useEditorStore(s => s.clearCurrentFile)
  const clearSaveStatus = useEditorStore(s => s.clearSaveStatus)
  const refreshTab = useEditorStore(s => s.refreshTab)

  // Track if we're currently checking for changes
  const isCheckingRef = useRef(false)

  // Load file tree when directory changes
  useEffect(() => {
    if (!currentDirectory) {
      setTree([])
      setDirectoryInfo("", "")
      return
    }

    loadFileTree()
  }, [currentDirectory])

  // Warn on unsaved changes before leaving
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasAnyModified) {
        e.preventDefault()
        e.returnValue = ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasAnyModified])

  // Check for file changes on window focus
  const checkForChanges = useCallback(async () => {
    // Filter out template tabs - they don't have real files to check
    const fileTabs = openTabs.filter(t => !t.isTemplate)
    if (!currentDirectory || fileTabs.length === 0 || isCheckingRef.current) return

    isCheckingRef.current = true
    try {
      const files = fileTabs.map(t => ({ path: t.path, mtime: t.mtime }))
      const result = await checkMtimes(currentDirectory, files)

      if (!result.results) return

      for (const file of result.results) {
        if (!file.changed) continue

        const tab = openTabs.find(t => t.path === file.path)
        if (!tab) continue

        const isModified = tab.content !== tab.originalContent

        if (file.deleted) {
          // File was deleted - notify user
          if (confirm(`File "${tab.name}" was deleted externally. Close this tab?`)) {
            useEditorStore.getState().closeTab(tab.path)
          }
        } else if (isModified) {
          // Has local changes + file changed on disk - ask user
          if (confirm(`File "${tab.name}" changed on disk. Reload and lose your changes?`)) {
            // Reload the file
            const content = await readEditFile(currentDirectory, tab.path)
            if (content.content !== undefined) {
              refreshTab(tab.path, content.content, content.mtime || file.mtime)
            }
          }
        } else {
          // No local changes - silently refresh
          const content = await readEditFile(currentDirectory, tab.path)
          if (content.content !== undefined) {
            refreshTab(tab.path, content.content, content.mtime || file.mtime)
          }
        }
      }
    } finally {
      isCheckingRef.current = false
    }
  }, [currentDirectory, openTabs, refreshTab])

  useEffect(() => {
    function handleFocus() {
      checkForChanges()
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [checkForChanges])

  async function loadFileTree() {
    setTreeLoading(true)
    setTreeError("")
    clearCurrentFile()

    try {
      const result = await listEditFiles(currentDirectory)
      if (result.error) {
        setTreeError(result.error)
        setTree([])
      } else {
        setTree(result.tree || [])
        setDirectoryInfo(result.label || "", result.path || "")
      }
    } catch (err) {
      setTreeError((err as Error).message)
      setTree([])
    } finally {
      setTreeLoading(false)
    }
  }

  async function handleFileSelect(path: string) {
    // Check if tab is already open
    const existing = openTabs.find(t => t.path === path)
    if (existing) {
      setActiveTab(path)
      return
    }

    setFileLoading(true)
    setFileError("")
    clearSaveStatus()

    try {
      const result = await readEditFile(currentDirectory, path)
      if (result.error) {
        setFileError(result.binary ? `Cannot edit binary file (${result.extension})` : result.error)
        return
      }

      const name = path.split("/").pop() || path
      if (result.image && result.dataUrl) {
        openTab(path, name, "", result.mtime || 0, { isImage: true, dataUrl: result.dataUrl })
      } else {
        openTab(path, name, result.content || "", result.mtime || 0)
      }
    } catch (err) {
      setFileError((err as Error).message)
    } finally {
      setFileLoading(false)
    }
  }

  async function handleSave() {
    if (!activeTab || !isModified) return

    setSaving(true)
    setSaveError("")
    setSaveSuccess("")

    try {
      // Handle template saves differently
      if (activeTab.isTemplate && activeTab.templateId) {
        const result = await saveTemplate(activeTab.templateId, activeTab.content)
        if (result.error) {
          setSaveError(result.error)
          return
        }
        updateTabOriginal(activeTab.path, activeTab.content, Date.now())
        setSaveSuccess("Template saved!")
      } else {
        const result = await writeEditFile(currentDirectory, activeTab.path, activeTab.content)
        if (result.error) {
          setSaveError(result.error)
          return
        }
        updateTabOriginal(activeTab.path, activeTab.content, result.mtime || Date.now())
        setSaveSuccess("Saved!")
        // Refresh tree to show new file
        loadFileTree()
      }
      setTimeout(() => {
        setSaveSuccess("")
      }, 3000)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function handleNewFile() {
    if (!currentDirectory) return
    setShowNewFile(true)
    setNewFileName("")
  }

  function handleNewFileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newFileName.trim()) return

    const fileName = newFileName.trim()
    // Check if file is already open
    const existing = openTabs.find(t => t.path === fileName)
    if (existing) {
      setActiveTab(fileName)
      setShowNewFile(false)
      setNewFileName("")
      return
    }

    // Create new tab with empty content (mtime 0 = new file)
    const name = fileName.split("/").pop() || fileName
    openTab(fileName, name, "", 0)
    setShowNewFile(false)
    setNewFileName("")
  }

  function handleNewFileCancel() {
    setShowNewFile(false)
    setNewFileName("")
  }

  function handleCopyClick() {
    if (!activeTab) return
    setCopyDestination(activeTab.path)
    setCopyError("")
    setShowCopy(true)
  }

  async function handleCopySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTab || !copyDestination.trim()) return

    const dest = copyDestination.trim()
    if (dest === activeTab.path) {
      setCopyError("Destination must be different from source")
      return
    }

    try {
      const result = await copyEditFile(currentDirectory, activeTab.path, dest)
      if (result.success) {
        setShowCopy(false)
        setCopyDestination("")
        setCopyError("")
        loadFileTree()
        // Open the new file
        const _name = dest.split("/").pop() || dest
        handleFileSelect(dest)
      } else {
        setCopyError(result.error || "Copy failed")
      }
    } catch (err) {
      setCopyError((err as Error).message)
    }
  }

  function handleCopyCancel() {
    setShowCopy(false)
    setCopyDestination("")
    setCopyError("")
  }

  return (
    <div className="h-screen flex flex-col bg-shell-bg">
      {/* Header */}
      <div className="bg-shell-surface px-5 py-3 flex justify-between items-center border-b border-shell-border shrink-0">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-shell-text-muted hover:text-white text-sm no-underline">
            &larr; Back
          </a>
          <h1 className="text-white text-lg font-semibold m-0">File Editor</h1>
        </div>
        <div className="flex items-center gap-3">
          {saveError && <span className="text-shell-danger text-sm">{saveError}</span>}
          {saveSuccess && <span className="text-shell-accent text-sm">{saveSuccess}</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isModified || isSaving}
            className="bg-shell-accent hover:bg-shell-accent-hover disabled:bg-shell-border disabled:cursor-not-allowed text-white border-none px-4 py-2 rounded text-sm cursor-pointer transition-colors"
          >
            {isSaving ? "Saving..." : "Save (Ctrl+S)"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-shell-surface border-r border-shell-border shrink-0 relative">
          <div className="absolute inset-0 flex flex-col">
            {/* Sidebar tabs */}
            <div className="flex border-b border-shell-border shrink-0">
              <button
                type="button"
                onClick={() => setSidebarTab("files")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  sidebarTab === "files"
                    ? "text-white bg-shell-bg border-b-2 border-shell-accent"
                    : "text-shell-text-muted hover:text-white"
                }`}
              >
                Files
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("templates")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  sidebarTab === "templates"
                    ? "text-white bg-shell-bg border-b-2 border-shell-accent"
                    : "text-shell-text-muted hover:text-white"
                }`}
              >
                Templates
              </button>
            </div>

            {/* Files tab content */}
            {sidebarTab === "files" && (
              <>
                <div className="p-3 border-b border-shell-border shrink-0">
                  <DirectorySelector />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-shell-text-muted text-xs truncate">{editorTree.length} files</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleNewFile}
                        disabled={!currentDirectory}
                        className="bg-shell-accent hover:bg-shell-accent-hover text-white border-none rounded px-2 py-1 text-xs cursor-pointer transition-colors disabled:opacity-50"
                        title="Create new file"
                      >
                        + New
                      </button>
                      <button
                        type="button"
                        onClick={loadFileTree}
                        disabled={editorTreeLoading}
                        className="bg-shell-blue hover:bg-shell-blue-hover text-white border-none rounded px-2 py-1 text-xs cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {editorTreeLoading ? "..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                  {/* New file input */}
                  {showNewFile && (
                    <form onSubmit={handleNewFileSubmit} className="mt-2">
                      <input
                        type="text"
                        value={newFileName}
                        onChange={e => setNewFileName(e.target.value)}
                        placeholder="path/to/file.ts"
                        className="w-full bg-shell-bg border border-shell-border rounded px-2 py-1 text-sm text-white placeholder-shell-text-muted focus:outline-none focus:border-shell-accent"
                      />
                      <div className="flex gap-1 mt-1">
                        <button
                          type="submit"
                          disabled={!newFileName.trim()}
                          className="flex-1 bg-shell-accent hover:bg-shell-accent-hover disabled:bg-shell-border text-white border-none rounded px-2 py-1 text-xs cursor-pointer transition-colors"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={handleNewFileCancel}
                          className="flex-1 bg-shell-border hover:bg-shell-text-muted text-white border-none rounded px-2 py-1 text-xs cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <EditorFileTree onFileSelect={handleFileSelect} onRefresh={loadFileTree} />
                </div>
              </>
            )}

            {/* Templates tab content */}
            {sidebarTab === "templates" && (
              <div className="flex-1 overflow-hidden min-h-0">
                <TemplatesPanel
                  onInsertTemplate={content => {
                    navigator.clipboard.writeText(content)
                    alert("Template copied to clipboard!")
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs bar */}
          <div className="bg-shell-surface border-b border-shell-border flex items-center shrink-0 overflow-x-auto">
            {openTabs.length === 0 ? (
              <div className="px-4 py-2 text-shell-text-muted text-sm">No files open</div>
            ) : (
              openTabs.map(tab => <Tab key={tab.path} path={tab.path} name={tab.name} />)
            )}
          </div>
          {/* File toolbar */}
          {activeTab && !activeTab.isImage && !activeTab.isTemplate && (
            <div className="bg-shell-surface border-b border-shell-border px-3 py-1.5 flex items-center gap-2 shrink-0">
              {showCopy ? (
                <form onSubmit={handleCopySubmit} className="flex items-center gap-2 flex-1">
                  <span className="text-shell-text-muted text-xs">Copy to:</span>
                  <input
                    type="text"
                    value={copyDestination}
                    onChange={e => setCopyDestination(e.target.value)}
                    className="flex-1 bg-shell-bg border border-shell-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-shell-accent"
                  />
                  <button
                    type="submit"
                    className="bg-shell-accent hover:bg-shell-accent-hover text-white border-none rounded px-3 py-1 text-xs cursor-pointer transition-colors"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCancel}
                    className="bg-shell-border hover:bg-shell-text-muted text-white border-none rounded px-3 py-1 text-xs cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  {copyError && <span className="text-red-400 text-xs">{copyError}</span>}
                </form>
              ) : (
                <>
                  <span className="text-shell-text-muted text-xs truncate flex-1">{activeTab.path}</span>
                  <button
                    type="button"
                    onClick={handleCopyClick}
                    className="bg-shell-border hover:bg-shell-text-muted text-white border-none rounded px-3 py-1 text-xs cursor-pointer transition-colors"
                  >
                    Copy File
                  </button>
                </>
              )}
            </div>
          )}
          {/* Template toolbar */}
          {activeTab?.isTemplate && (
            <div className="bg-shell-surface border-b border-shell-border px-3 py-1.5 flex items-center gap-2 shrink-0">
              <span className="text-shell-accent text-xs font-medium">Template</span>
              <span className="text-shell-text-muted text-xs">|</span>
              <span className="text-shell-text-muted text-xs truncate flex-1">
                Use with Claude: "Use template: {activeTab.templateId}"
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activeTab.content)
                  setSaveSuccess("Copied to clipboard!")
                  setTimeout(() => setSaveSuccess(""), 2000)
                }}
                className="bg-shell-border hover:bg-shell-text-muted text-white border-none rounded px-3 py-1 text-xs cursor-pointer transition-colors"
              >
                Copy Content
              </button>
            </div>
          )}
          {/* Editor */}
          <div className="flex-1 overflow-hidden bg-shell-code-bg">
            {activeTab?.isImage ? (
              <div className="h-full flex items-center justify-center p-4 overflow-auto">
                <img
                  src={activeTab.dataUrl}
                  alt={activeTab.name}
                  className="max-w-full max-h-full object-contain"
                  style={{ imageRendering: "auto" }}
                />
              </div>
            ) : (
              <CodeEditor onSave={handleSave} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
