import type { Request, Response, Router } from "express"
import TurndownService from "turndown"
import { z } from "zod"
import { RequestCache } from "../cache"
import { Sentry } from "../sentry"
import {
  DEFAULT_BATCH_CONCURRENCY,
  DEFAULT_RETRY_COUNT,
  MAX_BATCH_SIZE,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from "../constants"
import { stealthRequest } from "../index"
import { type RequestConfig, type RequestResponse, RequestSchema } from "../types"

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
})

turndownService.remove(["nav", "header", "footer", "script", "style"])

function htmlToMarkdown(html: string): string {
  let content = html

  const mainMatch = content.match(/<main[^>]*>(.*?)<\/main>/s)
  if (mainMatch?.[1]) {
    content = mainMatch[1]
  } else {
    const articleMatch = content.match(/<article[^>]*>(.*?)<\/article>/s)
    if (articleMatch?.[1]) {
      content = articleMatch[1]
    }
  }

  let markdown = turndownService.turndown(content)
  markdown = markdown.replace(/\n\s*\n\s*\n+/g, "\n\n")
  markdown = markdown.trim()

  return markdown
}

/**
 * Determine if a failed stealthRequest result is worth retrying.
 */
function isRetryable(result: RequestResponse): boolean {
  if (result.success) return false
  const err = (result.error ?? "").toLowerCase()
  return (
    err.includes("timeout") ||
    err.includes("navigation") ||
    err.includes("net::") ||
    err.includes("cloudflare") ||
    err.includes("econnrefused") ||
    err.includes("econnreset") ||
    result.statusCode === 429 ||
    result.statusCode === 503
  )
}

/**
 * Run stealthRequest with retry on transient failures.
 */
async function stealthRequestWithRetry(
  config: RequestConfig,
  retries: number,
): Promise<RequestResponse & { attempts: number }> {
  const maxAttempts = Math.max(1, retries + 1)
  let lastResult: RequestResponse | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await stealthRequest(config)
    if (lastResult.success || attempt >= maxAttempts || !isRetryable(lastResult)) {
      return { ...lastResult, attempts: attempt }
    }
    const baseDelay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
    const jitter = baseDelay * 0.3 * Math.random()
    const delay = Math.min(baseDelay + jitter, RETRY_MAX_DELAY_MS)
    console.log(
      `[${new Date().toISOString()}] Retry ${attempt}/${retries} for ${config.url} in ${Math.round(delay)}ms (${lastResult.error})`,
    )
    await new Promise(r => setTimeout(r, delay))
  }
  // lastResult is always assigned since maxAttempts >= 1
  return { ...lastResult!, attempts: maxAttempts }
}

function buildRequestConfig(params: Record<string, unknown>): RequestConfig {
  // Normalize method to uppercase; default to GET for HTTP route (schema defaults POST for MCP)
  const normalized = { ...params }
  if (typeof normalized.method === "string") {
    normalized.method = normalized.method.toUpperCase()
  } else if (!normalized.method) {
    normalized.method = "GET"
  }
  // Drop body for GET requests — bad clients may send empty string or junk
  if (normalized.method === "GET" && normalized.body !== undefined) {
    delete normalized.body
  }
  return RequestSchema.parse(normalized)
}

function formatResponse(result: RequestResponse, format: string): Record<string, unknown> {
  let responseBody = result.responseBody
  if (
    format === "markdown" &&
    result.format !== "screenshot" &&
    result.format !== "links" &&
    typeof responseBody === "string"
  ) {
    responseBody = htmlToMarkdown(responseBody)
  }

  const response: Record<string, unknown> = {
    success: result.success,
    status: result.statusCode,
    statusText: result.statusText,
    headers: result.responseHeaders,
    body: responseBody,
    url: result.url,
    format: result.format ?? format,
  }

  if (result.networkRequests) {
    response.networkRequests = result.networkRequests
  }
  if (result.jsResult !== undefined) {
    response.jsResult = result.jsResult
  }
  if (result.paginatedPages) {
    response.paginatedPages = result.paginatedPages
  }

  return response
}

const responseCache = new RequestCache<Record<string, unknown>>()

export async function handleFetchRequest(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const format = typeof params.format === "string" ? params.format : "html"
  const cacheTtl = typeof params.cache === "number" ? params.cache : undefined

  const config = buildRequestConfig(params)
  const url = config.url

  // Check cache
  if (cacheTtl && cacheTtl > 0) {
    const cacheKey = RequestCache.buildKey(url, config.method, config.body)
    const cached = responseCache.get(cacheKey)
    if (cached) {
      return { ...cached, cached: true }
    }
  }

  const retries = config.retry ?? DEFAULT_RETRY_COUNT

  console.log(
    `[${new Date().toISOString()}] ${config.method} ${url}${config.originUrl ? ` (origin: ${config.originUrl})` : ""}${config.recordNetworkRequests ? " (recording network)" : ""}${format === "markdown" ? " (-> markdown)" : ""} (retries: ${retries})`,
  )

  const result = await stealthRequestWithRetry(config, retries)

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      url: result.url,
      attempts: result.attempts,
    }
  }

  const response = formatResponse(result, format)
  if (result.attempts > 1) {
    response.attempts = result.attempts
  }

  // Store in cache
  if (cacheTtl && cacheTtl > 0) {
    const cacheKey = RequestCache.buildKey(url, config.method, config.body)
    responseCache.set(cacheKey, response, cacheTtl)
  }

  return response
}

export function registerFetchRoutes(router: Router): void {
  router.post("/fetch", async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, format = "html" } = req.body

      if (!url) {
        res.status(400).json({ error: "URL is required" })
        return
      }

      if (!["html", "markdown"].includes(format)) {
        res.status(400).json({ error: "Format must be 'html' or 'markdown'" })
        return
      }

      const response = await handleFetchRequest(req.body)
      res.json(response)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fields = error.issues.map(i => `${i.path.join(".")}: ${i.message}`)
        res.status(400).json({
          success: false,
          error: "Invalid request parameters",
          validation: fields,
        })
        return
      }
      Sentry.captureException(error, { tags: { route: "/fetch" } })
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
    }
  })

  router.post("/fetch-batch", async (req: Request, res: Response): Promise<void> => {
    try {
      const { requests, concurrency: rawConcurrency } = req.body

      if (!Array.isArray(requests) || requests.length === 0) {
        res.status(400).json({ error: "requests must be a non-empty array" })
        return
      }

      if (requests.length > MAX_BATCH_SIZE) {
        res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} requests per batch` })
        return
      }

      const parsedConcurrency =
        typeof rawConcurrency === "number" && Number.isFinite(rawConcurrency)
          ? rawConcurrency
          : DEFAULT_BATCH_CONCURRENCY
      const effectiveConcurrency = Math.min(Math.max(1, parsedConcurrency), requests.length)
      console.log(
        `[${new Date().toISOString()}] Batch: ${requests.length} requests, concurrency=${effectiveConcurrency}`,
      )

      const results: Array<{ status: "fulfilled" | "rejected"; value?: object; reason?: string; index: number }> = []

      for (let i = 0; i < requests.length; i += effectiveConcurrency) {
        const chunk = requests.slice(i, i + effectiveConcurrency)
        const settled = await Promise.allSettled(
          chunk.map((reqParams: Record<string, unknown>) => handleFetchRequest(reqParams)),
        )

        for (let j = 0; j < settled.length; j++) {
          const entry = settled[j]!
          if (entry.status === "fulfilled") {
            results.push({ status: "fulfilled", value: entry.value, index: i + j })
          } else {
            results.push({
              status: "rejected",
              reason: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
              index: i + j,
            })
          }
        }
      }

      res.json({ success: true, results })
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fields = error.issues.map(i => `${i.path.join(".")}: ${i.message}`)
        res.status(400).json({
          success: false,
          error: "Invalid request parameters",
          validation: fields,
        })
        return
      }
      Sentry.captureException(error, { tags: { route: "/fetch-batch" } })
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
    }
  })
}
