"use client"

import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal as XTerm } from "@xterm/xterm"
import { useEffect, useRef, useState } from "react"
import "@xterm/xterm/css/xterm.css"

interface TerminalProps {
  workspace?: string
  onExit?: () => void
}

export function Terminal({ workspace = "root", onExit }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

    // Initialize xterm.js
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
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

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(terminalRef.current)

    // Fit after DOM is painted
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch (err) {
        console.error("Error fitting terminal:", err)
      }
    })

    // Handle window resize
    const handleResize = () => {
      try {
        fitAddon.fit()
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
            }),
          )
        }
      } catch (err) {
        console.error("Error resizing terminal:", err)
      }
    }

    window.addEventListener("resize", handleResize)

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const sessionId = crypto.randomUUID()
    const wsUrl = `${protocol}//${window.location.host}/api/manager/terminal?sessionId=${sessionId}&workspace=${workspace}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)

      // Send initial size
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }),
      )
    }

    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data)

        switch (message.type) {
          case "connected":
            break
          case "data":
            term.write(message.data)
            break
          case "exit":
            term.write(`\r\n\r\n[Process exited with code ${message.exitCode}]\r\n`)
            ws.close()
            setIsConnected(false)
            onExit?.()
            break
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err)
      }
    }

    ws.onerror = () => {
      setError("Connection error. Please refresh to reconnect.")
      setIsConnected(false)
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    // Handle user input
    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input",
            data,
          }),
        )
      }
    })

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize)
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e] rounded-lg overflow-hidden">
      {error && <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 text-sm">{error}</div>}
      <div ref={terminalRef} className="flex-1 p-2" />
      {!isConnected && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">Connecting to terminal...</div>
        </div>
      )}
    </div>
  )
}
