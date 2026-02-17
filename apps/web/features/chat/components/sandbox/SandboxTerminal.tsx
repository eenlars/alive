"use client"

import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal } from "@xterm/xterm"
import { RotateCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import "@xterm/xterm/css/xterm.css"

interface SandboxTerminalProps {
  workspace: string
}

type TerminalState = "connecting" | "connected" | "disconnected" | "error"

export function SandboxTerminal({ workspace }: SandboxTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<TerminalState>("connecting")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Track mount generation to prevent stale closures from acting on new connections
  const mountGenRef = useRef(0)
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null)

  const connect = useCallback(
    async (term: Terminal, fit: FitAddon, generation: number) => {
      setState("connecting")
      setErrorMsg(null)

      try {
        const res = await fetch("/api/terminal/lease", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.message ?? `Failed to get terminal lease (${res.status})`)
        }

        const leaseData: Record<string, unknown> = await res.json()
        const wsUrl = leaseData.wsUrl
        if (typeof wsUrl !== "string") {
          throw new Error("Invalid lease response: missing wsUrl")
        }

        // Guard: if component re-mounted while we were fetching, bail
        if (generation !== mountGenRef.current) return

        const ws = new WebSocket(wsUrl)
        ws.binaryType = "arraybuffer"
        wsRef.current = ws

        ws.onopen = () => {
          if (generation !== mountGenRef.current) {
            ws.close()
            return
          }
          // Send initial resize
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        }

        ws.onmessage = (event: MessageEvent) => {
          if (event.data instanceof ArrayBuffer) {
            // Binary frame: raw PTY output
            term.write(new Uint8Array(event.data))
          } else {
            // Text frame: JSON control messages
            try {
              if (typeof event.data !== "string") return
              const msg: Record<string, unknown> = JSON.parse(event.data)
              const msgType = typeof msg.type === "string" ? msg.type : ""
              switch (msgType) {
                case "connected":
                  setState("connected")
                  // Re-fit after connected in case container resized during connect
                  requestAnimationFrame(() => {
                    try {
                      fit.fit()
                    } catch {
                      // ignore
                    }
                  })
                  break
                case "exit":
                  term.write(`\r\n[Process exited with code ${msg.exitCode ?? "?"}]\r\n`)
                  setState("disconnected")
                  break
                case "error":
                  term.write(`\r\n[Error: ${msg.message ?? "unknown"}]\r\n`)
                  break
              }
            } catch {
              // Ignore malformed text messages
            }
          }
        }

        ws.onerror = () => {
          if (generation !== mountGenRef.current) return
          setState("error")
          setErrorMsg("Connection error")
        }

        ws.onclose = () => {
          if (generation !== mountGenRef.current) return
          wsRef.current = null
          setState(prev => (prev === "connected" ? "disconnected" : prev))
        }

        // Clean up previous input listener to prevent accumulation on reconnect
        onDataDisposableRef.current?.dispose()

        // Forward terminal input as binary (efficient, matches shell-server-go protocol)
        onDataDisposableRef.current = term.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(new TextEncoder().encode(data))
          }
        })
      } catch (err) {
        if (generation !== mountGenRef.current) return
        setState("error")
        setErrorMsg(err instanceof Error ? err.message : "Failed to connect")
      }
    },
    [workspace],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const generation = ++mountGenRef.current

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1a1a1a",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
    })

    const fit = new FitAddon()
    const webLinks = new WebLinksAddon()
    term.loadAddon(fit)
    term.loadAddon(webLinks)
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fit

    // Initial fit after paint
    requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch {
        // ignore
      }
    })

    // ResizeObserver for panel resizing (critical for the resizable sandbox panel)
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        }
      } catch {
        // ignore
      }
    })
    ro.observe(containerRef.current)

    // Connect
    connect(term, fit, generation)

    return () => {
      mountGenRef.current++
      ro.disconnect()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
      onDataDisposableRef.current?.dispose()
      onDataDisposableRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [connect])

  const handleReconnect = () => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return

    // Close existing connection
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }
    wsRef.current = null

    term.clear()
    connect(term, fit, mountGenRef.current)
  }

  return (
    <div className="relative h-full flex flex-col bg-[#1a1a1a]">
      <div ref={containerRef} className="flex-1 px-1 pt-1 min-h-0" />
      {(state === "disconnected" || state === "error") && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-t border-neutral-800">
          {errorMsg && <span className="text-xs text-red-400 truncate">{errorMsg}</span>}
          {state === "disconnected" && <span className="text-xs text-neutral-500">Disconnected</span>}
          <button
            type="button"
            onClick={handleReconnect}
            className="ml-auto flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <RotateCw size={11} strokeWidth={1.5} />
            Reconnect
          </button>
        </div>
      )}
      {state === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]/80">
          <span className="text-sm text-neutral-500">Connecting...</span>
        </div>
      )}
    </div>
  )
}
