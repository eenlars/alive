import express from "express"
import cors from "cors"
import { stealthFetch } from "./src/index"
import type { StealthFetchOptions } from "./src/index"
import TurndownService from "turndown"
import type { Request, Response } from "express"

// Require puppeteer cache directory
if (!process.env.PUPPETEER_CACHE_DIR) {
  throw new Error("PUPPETEER_CACHE_DIR environment variable is required")
}

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx", // Use # instead of underlines
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
})

// Custom rules to remove nav, header, footer before conversion
turndownService.remove(["nav", "header", "footer", "script", "style"])

// Extract main content if available, else use article, else use body
function htmlToMarkdown(html: string): string {
  let content = html

  // Extract main content if available
  const mainMatch = content.match(/<main[^>]*>(.*?)<\/main>/s)
  if (mainMatch) {
    content = mainMatch[1]
  } else {
    const articleMatch = content.match(/<article[^>]*>(.*?)<\/article>/s)
    if (articleMatch) {
      content = articleMatch[1]
    }
  }

  // Convert HTML to Markdown using Turndown
  let markdown = turndownService.turndown(content)

  // Clean up extra whitespace
  markdown = markdown.replace(/\n\s*\n\s*\n+/g, "\n\n") // Multiple newlines to double
  markdown = markdown.trim()

  return markdown
}

const app = express()
const PORT = 1234

app.use(cors())
app.use(express.json())

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "stealth-server", port: PORT })
})

app.post("/fetch", async (req: Request, res: Response) => {
  try {
    const { url, method = "GET", headers, body, timeout, recordNetworkRequests, originUrl, format = "html" } = req.body

    if (!url) {
      return res.status(400).json({ error: "URL is required" })
    }

    if (!["html", "markdown"].includes(format)) {
      return res.status(400).json({ error: "Format must be 'html' or 'markdown'" })
    }

    console.log(
      `[${new Date().toISOString()}] ${method} ${url}${originUrl ? ` (origin: ${originUrl})` : ""}${recordNetworkRequests ? " (recording network)" : ""}${format === "markdown" ? " (→ markdown)" : ""}`,
    )

    const options: StealthFetchOptions = {
      method,
      headers,
      timeout,
      recordNetworkRequests: recordNetworkRequests ?? false,
      originUrl: originUrl ?? undefined,
    }

    if (body && method !== "GET") {
      options.body = typeof body === "string" ? body : JSON.stringify(body)
    }

    const response = await stealthFetch(url, options)

    // Fixed header handling - sanitize multiline values
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value: string, key: string) => {
      // Replace newlines and carriage returns in header values
      responseHeaders[key] = value.replace(/[\r\n]/g, " ").trim()
    })

    const contentType = response.headers.get("content-type") || ""
    let responseBody: unknown

    if (contentType.includes("application/json")) {
      responseBody = await response.json()
    } else {
      const html = await response.text()
      // Convert to markdown if requested
      if (format === "markdown") {
        responseBody = htmlToMarkdown(html)
      } else {
        responseBody = html
      }
    }

    res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      url: response.url,
      format: format,
      networkRequests: response.networkRequests,
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    })
  }
})

const HOST = "127.0.0.1"
app.listen(PORT, HOST, () => {
  console.log(`Stealth server running on http://${HOST}:${PORT}`)
  console.log(`Health check: http://${HOST}:${PORT}/health`)
  console.log(`POST requests to: http://${HOST}:${PORT}/fetch`)
})
