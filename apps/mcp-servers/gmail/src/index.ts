#!/usr/bin/env node
/**
 * Gmail MCP Server
 *
 * MCP-only server for Gmail functionality.
 * Accepts Bearer tokens via HTTP Authorization header.
 *
 * REST endpoints (send, draft) are handled by Next.js API routes,
 * not this server. This keeps concerns separated:
 * - MCP server: Claude tool calls
 * - Next.js API: User UI actions (Send/Save Draft buttons)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Command } from "commander"
import express from "express"
import { createGmailClient } from "./gmail-client.js"
import { executeTool, tools } from "./tools/index.js"

const DEFAULT_PORT = 8085

// Parse CLI arguments
const program = new Command()
  .option("--transport <stdio|http>", "transport type", "http")
  .option("--port <number>", "port for HTTP transport", DEFAULT_PORT.toString())
  .allowUnknownOption()
  .parse(process.argv)

const cliOptions = program.opts()

// Validate transport option
const allowedTransports = ["stdio", "http"]
if (!allowedTransports.includes(cliOptions.transport)) {
  console.error(`Invalid --transport value: '${cliOptions.transport}'. Must be one of: stdio, http.`)
  process.exit(1)
}

const TRANSPORT_TYPE = cliOptions.transport as "stdio" | "http"
const PORT = parseInt(cliOptions.port, 10) || DEFAULT_PORT

/**
 * Create MCP server with Gmail client injected
 */
function createServer(accessToken?: string) {
  const server = new Server(
    {
      name: "gmail",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools }
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params

    if (!accessToken) {
      return {
        content: [
          { type: "text", text: "Error: No access token provided. Include Authorization: Bearer <token> header." },
        ],
        isError: true,
      }
    }

    const gmail = createGmailClient(accessToken)
    return await executeTool(gmail, name, args || {})
  })

  return server
}

async function startStdioServer() {
  // For stdio, we can't get the token from headers
  // This mode is mainly for testing
  console.error("Warning: stdio mode does not support authentication. Use HTTP mode for production.")
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Gmail MCP Server started (stdio)")
}

async function startHttpServer() {
  const app = express()

  // Parse JSON bodies
  app.use(express.json())

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "gmail" })
  })

  // MCP endpoint - extracts Bearer token from Authorization header
  app.post("/mcp", async (req, res) => {
    try {
      // Extract Bearer token from Authorization header
      const authHeader = req.headers.authorization
      let accessToken: string | undefined

      if (authHeader?.startsWith("Bearer ")) {
        accessToken = authHeader.slice(7)
      }

      if (!accessToken) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Missing Authorization: Bearer <token> header" },
          id: null,
        })
        return
      }

      const server = createServer(accessToken)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })

      res.on("close", () => {
        transport.close()
      })

      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error("Error handling MCP request:", error)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        })
      }
    }
  })

  // Catch-all 404
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" })
  })

  app.listen(PORT, () => {
    console.error(`Gmail MCP Server running on http://localhost:${PORT}/mcp`)
    console.error("Accepts Bearer token via Authorization header")
  })
}

async function main() {
  if (TRANSPORT_TYPE === "http") {
    await startHttpServer()
  } else {
    await startStdioServer()
  }
}

main().catch(error => {
  console.error("Failed to start server:", error)
  process.exit(1)
})
