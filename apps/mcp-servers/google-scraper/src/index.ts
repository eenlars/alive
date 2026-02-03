#!/usr/bin/env node
/**
 * Google Scraper MCP Server
 *
 * A standalone MCP server that provides Google Maps search functionality.
 * Supports both stdio and HTTP transports.
 *
 * Usage:
 *   node dist/index.js                          # stdio transport (default)
 *   node dist/index.js --transport http --port 8083  # HTTP transport
 */

// Validate required environment variables
function validateEnv(): void {
  const required = ["GOOGLE_SOCS_COOKIE"] as const
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error("=".repeat(70))
    console.error("FATAL: Missing required environment variables")
    console.error("=".repeat(70))
    console.error("")
    for (const key of missing) {
      console.error(`  - ${key}`)
    }
    console.error("")
    console.error("Create a .env file in apps/mcp-servers/google-scraper/ with:")
    console.error("  GOOGLE_SOCS_COOKIE=<your-cookie-value>")
    console.error("")
    console.error("To get the SOCS cookie value:")
    console.error("  1. Open browser dev tools (F12)")
    console.error("  2. Go to google.com/maps and accept cookies")
    console.error("  3. In dev tools: Application > Cookies > google.com")
    console.error("  4. Find 'SOCS' cookie and copy its value")
    console.error("=".repeat(70))
    process.exit(1)
  }
}

validateEnv()

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { searchGoogleMapsTool, executeSearchGoogleMaps, searchGoogleMapsSchema } from "./tools/search-google-maps.js"
import { checkBrowserAvailability } from "./scraper/utils.js"
import { Command } from "commander"
import express from "express"

const DEFAULT_PORT = 8083

// Parse CLI arguments
const program = new Command()
  .option("--transport <stdio|http>", "transport type", "stdio")
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

function createServer() {
  const server = new Server(
    {
      name: "google-scraper",
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
    return {
      tools: [searchGoogleMapsTool],
    }
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params

    if (name === "search_google_maps") {
      try {
        const parsed = searchGoogleMapsSchema.parse(args)
        return await executeSearchGoogleMaps(parsed)
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        }
      }
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    }
  })

  return server
}

async function startStdioServer() {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Google Scraper MCP Server started (stdio)")
}

async function startHttpServer() {
  const app = express()

  // Parse JSON bodies FIRST
  app.use(express.json())

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "google-scraper" })
  })

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    try {
      const server = createServer()
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
    console.error(`Google Scraper MCP Server running on http://localhost:${PORT}/mcp`)
  })
}

async function main() {
  // Check browser availability on startup
  await checkBrowserAvailability()

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
