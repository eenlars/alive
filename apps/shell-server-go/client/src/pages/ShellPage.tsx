import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal } from "@xterm/xterm"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import "@xterm/xterm/css/xterm.css"
import "../styles/shell-tabs.css"
import { useConfig } from "../store/config"

// Detect mobile device
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768

// Terminal themes
const darkTheme = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#0dbc79",
  cursorAccent: "#1e1e1e",
  selectionBackground: "rgba(13, 188, 121, 0.3)",
  black: "#1e1e1e",
  red: "#f14c4c",
  green: "#0dbc79",
  yellow: "#e5c07b",
  blue: "#2472c8",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#d4d4d4",
  brightBlack: "#5c5c5c",
  brightRed: "#f14c4c",
  brightGreen: "#0dbc79",
  brightYellow: "#e5c07b",
  brightBlue: "#2472c8",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
}

const lightTheme = {
  background: "#ffffff",
  foreground: "#383a42",
  cursor: "#0dbc79",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(13, 188, 121, 0.3)",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#383a42",
  brightBlack: "#686b77",
  brightRed: "#e45649",
  brightGreen: "#50a14f",
  brightYellow: "#c18401",
  brightBlue: "#4078f2",
  brightMagenta: "#a626a4",
  brightCyan: "#0184bc",
  brightWhite: "#383a42",
}

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)")
const getTerminalTheme = () => (prefersDark.matches ? darkTheme : lightTheme)

interface TerminalTab {
  id: string
  name: string
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  ws: WebSocket
  element: HTMLDivElement
}

const MAX_TABS = 10
const DESKTOP_FONT_SIZE = 14
const DESKTOP_SCROLLBACK = 10000

export function ShellPage() {
  const [searchParams] = useSearchParams()
  const workspace = searchParams.get("workspace") || "root"
  const config = useConfig()

  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const shellContainerRef = useRef<HTMLDivElement>(null)
  const tabCounterRef = useRef(0)
  const tabsRef = useRef<TerminalTab[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Keep ref in sync
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  const backUrl = config?.allowWorkspaceSelection ? "/dashboard" : "/logout"
  const backLabel = config?.allowWorkspaceSelection ? "Dashboard" : "Exit"

  const createTab = useCallback(
    async (options?: { initialCommand?: string; name?: string }) => {
      if (tabsRef.current.length >= MAX_TABS) {
        alert(`Maximum ${MAX_TABS} tabs allowed`)
        return null
      }

      tabCounterRef.current++
      const id = `tab-${tabCounterRef.current}`
      const name = options?.name || `Terminal ${tabCounterRef.current}`

      const wrapper = document.createElement("div")
      wrapper.id = `terminal-${id}`
      wrapper.className = "terminal-wrapper"
      shellContainerRef.current?.appendChild(wrapper)

      const scrollBtn = document.createElement("button")
      scrollBtn.className = "scroll-bottom-btn"
      scrollBtn.innerHTML = "↓"
      scrollBtn.title = "Scroll to bottom"
      wrapper.appendChild(scrollBtn)

      const term = new Terminal({
        cursorBlink: true,
        fontSize: isMobile ? 14 : DESKTOP_FONT_SIZE,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
        fontWeight: "400",
        fontWeightBold: "600",
        letterSpacing: 0,
        lineHeight: 1.2,
        scrollback: isMobile ? 2000 : DESKTOP_SCROLLBACK,
        theme: getTerminalTheme(),
        smoothScrollDuration: isMobile ? 100 : 0,
        scrollSensitivity: isMobile ? 3 : 1,
        fastScrollSensitivity: isMobile ? 10 : 5,
        allowProposedApi: true,
        cursorStyle: "block",
        cursorInactiveStyle: "outline",
        rightClickSelectsWord: true,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
      })

      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()
      const searchAddon = new SearchAddon()

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)
      term.loadAddon(searchAddon)
      term.open(wrapper)

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      let leaseToken = ""
      try {
        const body = new URLSearchParams({ workspace })
        const leaseResponse = await fetch("/api/ws-lease", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          credentials: "same-origin",
          body: body.toString(),
        })

        if (!leaseResponse.ok) {
          throw new Error(`Lease request failed with status ${leaseResponse.status}`)
        }

        const leasePayload = await leaseResponse.json()
        if (!leasePayload?.lease || typeof leasePayload.lease !== "string") {
          throw new Error("Lease response missing token")
        }

        leaseToken = leasePayload.lease
      } catch (error) {
        setIsLoading(false)
        const message = error instanceof Error ? error.message : String(error)
      term.write(`\r\n\x1b[31mFailed to create terminal lease: ${message}\x1b[0m\r\n`)
        term.dispose()
        wrapper.remove()
        return null
      }

      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?lease=${encodeURIComponent(leaseToken)}`)

      ws.onopen = () => {
        setIsLoading(false)
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        if (options?.initialCommand) {
          setTimeout(() => {
            ws.send(JSON.stringify({ type: "input", data: `${options.initialCommand}\n` }))
          }, 100)
        }
      }

      ws.onmessage = event => {
        const msg = JSON.parse(event.data)
        if (msg.type === "data") {
          term.write(msg.data)
        } else if (msg.type === "exit") {
          term.write(`\r\n\r\n[Process exited with code ${msg.exitCode}]\r\n`)
        }
      }

      ws.onerror = () => {
        setIsLoading(false)
        term.write("\r\n\x1b[31mConnection error\x1b[0m\r\n")
      }

      ws.onclose = () => {
        term.write("\r\n\x1b[33mConnection closed\x1b[0m\r\n")
      }

      term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }))
        }
      })

      term.onScroll(() => {
        const viewport = wrapper.querySelector(".xterm-viewport")
        if (viewport) {
          const { scrollTop, scrollHeight, clientHeight } = viewport
          const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50
          scrollBtn.classList.toggle("visible", !isAtBottom)
        }
      })

      scrollBtn.addEventListener("click", () => {
        term.scrollToBottom()
        scrollBtn.classList.remove("visible")
      })

      if (isMobile) {
        wrapper.addEventListener("click", e => {
          if ((e.target as HTMLElement).classList.contains("scroll-bottom-btn")) return
          term.focus()
        })
      }

      const tab: TerminalTab = { id, name, terminal: term, fitAddon, searchAddon, ws, element: wrapper }

      setTabs(prev => [...prev, tab])
      switchToTab(id, [...tabsRef.current, tab])

      return tab
    },
    [workspace],
  )

  const closeTab = useCallback(
    (id: string) => {
      const currentTabs = tabsRef.current
      const index = currentTabs.findIndex(t => t.id === id)
      if (index === -1 || currentTabs.length === 1) return

      const tab = currentTabs[index]
      tab.ws.close()
      tab.terminal.dispose()
      tab.element.remove()

      const newTabs = currentTabs.filter(t => t.id !== id)
      setTabs(newTabs)

      if (activeTabId === id) {
        const newIndex = Math.min(index, newTabs.length - 1)
        switchToTab(newTabs[newIndex].id, newTabs)
      }
    },
    [activeTabId],
  )

  const switchToTab = useCallback((id: string, currentTabs?: TerminalTab[]) => {
    const allTabs = currentTabs || tabsRef.current
    const tab = allTabs.find(t => t.id === id)
    if (!tab) return

    allTabs.forEach(t => t.element.classList.remove("active"))
    tab.element.classList.add("active")
    setActiveTabId(id)

    // Expose for mobile toolbar
    ;(window as any).__activeTerminal = tab.terminal
    ;(window as any).__activeWebSocket = tab.ws

    requestAnimationFrame(() => {
      try {
        tab.fitAddon.fit()
        if (tab.ws.readyState === WebSocket.OPEN) {
          tab.ws.send(JSON.stringify({ type: "resize", cols: tab.terminal.cols, rows: tab.terminal.rows }))
        }
      } catch (e) {
        console.error("Failed to fit terminal:", e)
      }
      tab.terminal.focus()
    })
  }, [])

  // Handle resize
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function handleResize() {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        const activeTab = tabsRef.current.find(t => t.id === activeTabId)
        if (!activeTab) return
        try {
          activeTab.fitAddon.fit()
          if (activeTab.ws.readyState === WebSocket.OPEN) {
            activeTab.ws.send(
              JSON.stringify({
                type: "resize",
                cols: activeTab.terminal.cols,
                rows: activeTab.terminal.rows,
              }),
            )
          }
        } catch (e) {
          console.error("Failed to fit terminal:", e)
        }
      }, 100)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [activeTabId])

  // Create initial tab
  useEffect(() => {
    createTab()

    return () => {
      tabsRef.current.forEach(tab => tab.ws.close())
    }
  }, [])

  // Search functionality
  const handleSearch = useCallback(
    (query: string, direction: "next" | "prev" = "next") => {
      const activeTab = tabsRef.current.find(t => t.id === activeTabId)
      if (!activeTab || !query) return

      if (direction === "next") {
        activeTab.searchAddon.findNext(query, { caseSensitive: false, regex: false })
      } else {
        activeTab.searchAddon.findPrevious(query, { caseSensitive: false, regex: false })
      }
    },
    [activeTabId],
  )

  const clearSearch = useCallback(() => {
    const activeTab = tabsRef.current.find(t => t.id === activeTabId)
    if (activeTab) {
      activeTab.searchAddon.clearDecorations()
    }
    setSearchQuery("")
    setShowSearch(false)
  }, [activeTabId])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Shift+T: New tab
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault()
        createTab()
      }
      // Ctrl+Shift+W: Close tab
      if (e.ctrlKey && e.shiftKey && e.key === "W") {
        e.preventDefault()
        if (activeTabId && tabs.length > 1) closeTab(activeTabId)
      }
      // Ctrl+Tab: Next tab
      if (e.ctrlKey && e.key === "Tab" && !e.shiftKey) {
        e.preventDefault()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const next = (idx + 1) % tabs.length
        switchToTab(tabs[next].id)
      }
      // Ctrl+Shift+Tab: Previous tab
      if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        e.preventDefault()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const prev = (idx - 1 + tabs.length) % tabs.length
        switchToTab(tabs[prev].id)
      }
      // Ctrl+1-9: Switch to tab by number
      if (e.ctrlKey && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault()
        const tabIndex = parseInt(e.key, 10) - 1
        if (tabIndex < tabs.length) {
          switchToTab(tabs[tabIndex].id)
        }
      }
      // Ctrl+F: Search
      if (e.ctrlKey && e.key === "f" && !e.shiftKey && !isMobile) {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      // Escape: Close search
      if (e.key === "Escape" && showSearch) {
        clearSearch()
        const activeTab = tabsRef.current.find(t => t.id === activeTabId)
        activeTab?.terminal.focus()
      }
      // Enter in search: Find next
      if (e.key === "Enter" && showSearch && document.activeElement === searchInputRef.current) {
        e.preventDefault()
        handleSearch(searchQuery, e.shiftKey ? "prev" : "next")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [tabs, activeTabId, showSearch, searchQuery, createTab, closeTab, switchToTab, handleSearch, clearSearch])

  function sendInput(data: string) {
    const tab = tabsRef.current.find(t => t.id === activeTabId)
    if (tab && tab.ws.readyState === WebSocket.OPEN) {
      tab.ws.send(JSON.stringify({ type: "input", data }))
    }
  }

  const renameTab = useCallback((id: string) => {
    const tab = tabsRef.current.find(t => t.id === id)
    if (!tab) return
    const newName = prompt("Tab name:", tab.name)
    if (newName?.trim()) {
      setTabs(prev => prev.map(t => (t.id === id ? { ...t, name: newName.trim() } : t)))
      tab.name = newName.trim()
    }
  }, [])

  return (
    <div className="m-0 p-0 box-border font-sans bg-shell-bg h-screen overflow-hidden">
      {/* Desktop Header with VS Code-style tabs */}
      {!isMobile && (
        <div className="bg-[#252526] border-b border-[#3c3c3c] fixed top-0 left-0 right-0 z-50 h-[35px] flex items-center">
          {/* Tab bar */}
          <div className="flex-1 flex items-center h-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab, index) => (
              <div
                key={tab.id}
                className={`group flex items-center h-full px-3 cursor-pointer text-[13px] border-r border-[#3c3c3c] min-w-[120px] max-w-[200px] ${
                  tab.id === activeTabId ? "bg-[#1e1e1e] text-white" : "bg-[#2d2d2d] text-[#9d9d9d] hover:bg-[#2a2a2a]"
                }`}
                onClick={() => switchToTab(tab.id)}
                onDoubleClick={() => renameTab(tab.id)}
                title={`${tab.name} (Ctrl+${index + 1})`}
              >
                <span className="text-shell-accent mr-2 text-xs">$</span>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{tab.name}</span>
                {tabs.length > 1 && (
                  <span
                    className="ml-2 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-[#5a5a5a] text-sm"
                    onClick={e => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    ×
                  </span>
                )}
              </div>
            ))}
            {/* New tab button inline */}
            <button
              className="h-full px-3 text-[#9d9d9d] hover:text-white hover:bg-[#2a2a2a] text-lg border-none bg-transparent cursor-pointer"
              onClick={() => createTab()}
              title="New Terminal (Ctrl+Shift+T)"
            >
              +
            </button>
          </div>

          {/* Right side actions */}
          <div className="flex items-center h-full px-2 gap-1 border-l border-[#3c3c3c]">
            <button
              className="px-2 py-1 text-xs text-[#c678dd] hover:bg-[#3c3c3c] rounded border-none bg-transparent cursor-pointer"
              onClick={() => createTab({ initialCommand: "claude", name: "Claude" })}
              title="Open Claude Terminal"
            >
              + Claude
            </button>
            <div className="w-px h-4 bg-[#3c3c3c] mx-1" />
            <a
              href={backUrl}
              className="px-2 py-1 text-xs text-[#9d9d9d] hover:text-white hover:bg-[#3c3c3c] rounded no-underline"
            >
              {backLabel}
            </a>
            <a href="/logout" className="px-2 py-1 text-xs text-[#f14c4c] hover:bg-[#3c3c3c] rounded no-underline">
              Logout
            </a>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      {isMobile && (
        <div className="bg-shell-surface px-4 py-2 flex justify-between items-center border-b border-shell-border fixed top-0 left-0 right-0 z-50 h-[41px]">
          <h1 className="text-white text-sm font-semibold">Shell</h1>
          <div className="flex gap-2">
            <a
              href={backUrl}
              className="bg-shell-accent hover:bg-shell-accent-hover text-white no-underline px-3 py-1.5 rounded text-xs transition-colors"
            >
              {backLabel}
            </a>
            <a
              href="/logout"
              className="bg-shell-danger hover:bg-shell-danger-hover text-white no-underline px-3 py-1.5 rounded text-xs transition-colors"
            >
              Logout
            </a>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-base z-40">
          Connecting to shell...
        </div>
      )}

      {/* Desktop Search Bar */}
      {showSearch && !isMobile && (
        <div className="fixed top-[35px] right-4 z-50 bg-[#252526] border border-[#3c3c3c] rounded-b-md shadow-lg p-2 flex items-center gap-2">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              handleSearch(e.target.value)
            }}
            placeholder="Search..."
            className="bg-[#3c3c3c] text-white text-sm px-2 py-1 rounded border-none outline-none w-48 focus:ring-1 focus:ring-shell-accent"
          />
          <button
            className="text-[#9d9d9d] hover:text-white p-1 bg-transparent border-none cursor-pointer"
            onClick={() => handleSearch(searchQuery, "prev")}
            title="Previous (Shift+Enter)"
          >
            ↑
          </button>
          <button
            className="text-[#9d9d9d] hover:text-white p-1 bg-transparent border-none cursor-pointer"
            onClick={() => handleSearch(searchQuery, "next")}
            title="Next (Enter)"
          >
            ↓
          </button>
          <button
            className="text-[#9d9d9d] hover:text-white p-1 bg-transparent border-none cursor-pointer text-sm"
            onClick={clearSearch}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
      )}

      {/* Mobile tab bar */}
      {isMobile && (
        <div
          className="fixed top-[41px] left-0 right-0 bg-[#252526] border-b border-[#3c3c3c] z-50 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="flex p-1.5 gap-1.5 min-w-max">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap min-h-[32px] cursor-pointer ${
                  tab.id === activeTabId ? "bg-shell-accent text-white" : "bg-[#3c3c3c] text-[#9d9d9d]"
                }`}
                onClick={() => switchToTab(tab.id)}
              >
                <span>$ {tab.name}</span>
                {tabs.length > 1 && (
                  <span
                    className="px-1.5 text-sm opacity-70"
                    onClick={e => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    ×
                  </span>
                )}
              </div>
            ))}
            <div
              className="px-3 py-1.5 bg-[#2a2d2e] rounded-md text-shell-accent text-base font-bold min-h-[32px] flex items-center cursor-pointer"
              onClick={() => createTab()}
            >
              +
            </div>
          </div>
        </div>
      )}

      {/* Main container */}
      <div className="fixed left-0 right-0 bottom-0 flex overflow-hidden" style={{ top: isMobile ? "85px" : "35px" }}>
        {/* Terminal container - full width on desktop now */}
        <div ref={shellContainerRef} className="flex-1 overflow-hidden relative" />
      </div>

      {/* Desktop keyboard shortcuts hint */}
      {!isMobile && (
        <div className="fixed bottom-2 right-2 text-[11px] text-[#5c5c5c] z-10 select-none pointer-events-none">
          Ctrl+Shift+T: New tab | Ctrl+Shift+W: Close | Ctrl+Tab: Switch | Ctrl+F: Search
        </div>
      )}

      {/* Mobile toolbar */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-[#252526] border-t border-[#3c3c3c] p-2 z-50"
          style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex gap-1.5 mb-1.5">
            <button
              className="flex-1 p-3 bg-[#3c3c3c] border-none rounded-md text-[#d4d4d4] text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => sendInput("\x1b")}
            >
              Esc
            </button>
            <button
              className="flex-1 p-3 bg-[#3c3c3c] border-none rounded-md text-[#d4d4d4] text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => sendInput("\x1b[A")}
            >
              ▲
            </button>
            <button
              className="flex-1 p-3 bg-[#3c3c3c] border-none rounded-md text-[#d4d4d4] text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => sendInput("\x1b[B")}
            >
              ▼
            </button>
            <button
              className="flex-1 p-3 bg-shell-accent border-none rounded-md text-white text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => sendInput("\r")}
            >
              ⏎
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              className="flex-1 p-3 bg-[#3c3c3c] border-none rounded-md text-[#d4d4d4] text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => {
                const tab = tabsRef.current.find(t => t.id === activeTabId)
                if (tab) tab.terminal.scrollLines(-5)
              }}
            >
              ↑ Scroll
            </button>
            <button
              className="flex-1 p-3 bg-[#3c3c3c] border-none rounded-md text-[#d4d4d4] text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => {
                const tab = tabsRef.current.find(t => t.id === activeTabId)
                if (tab) tab.terminal.scrollLines(5)
              }}
            >
              ↓ Scroll
            </button>
            <button
              className="flex-1 p-3 bg-shell-accent border-none rounded-md text-white text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={() => {
                const tab = tabsRef.current.find(t => t.id === activeTabId)
                if (tab) tab.terminal.scrollToBottom()
              }}
            >
              ⇊
            </button>
            <button
              className="flex-1 p-3 bg-shell-accent border-none rounded-md text-white text-[13px] font-mono cursor-pointer min-h-[44px]"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  sendInput(text)
                } catch {
                  const text = prompt("Paste text:")
                  if (text) sendInput(text)
                }
              }}
            >
              Paste
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
