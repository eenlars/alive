import type { Browser, HTTPRequest, HTTPResponse, LaunchOptions, Page } from "puppeteer"
import puppeteerExtra from "puppeteer-extra"
import stealthPlugin from "puppeteer-extra-plugin-stealth"
import { DEFAULT_TIMEOUT, USER_AGENTS } from "./constants"
import { type NetworkRequest, type ProxyConfig, type RequestConfig, type RequestResponse, RequestSchema } from "./types"

puppeteerExtra.use(stealthPlugin())

async function setupBrowser(proxy?: ProxyConfig, userAgent?: string): Promise<Browser> {
  const args = ["--no-sandbox", "--disable-setuid-sandbox"]

  if (proxy) {
    args.push(`--proxy-server=${proxy.ip}:${proxy.port}`)
  }

  if (userAgent) {
    args.push(`--user-agent=${userAgent}`)
  }

  const launchOptions: LaunchOptions = {
    headless: true,
    args,
  }

  return await puppeteerExtra.launch(launchOptions)
}

async function cleanupBrowser(browser: Browser) {
  const pages = await browser.pages()
  await Promise.allSettled(pages.map((page: Page) => page.close()))
  try {
    await browser.close()
  } catch {
    // browser may already be closed
  }
}

function setupNetworkCapture(page: Page): {
  getNetworkRequests: () => NetworkRequest[]
  cleanup: () => void
} {
  const networkRequests: NetworkRequest[] = []
  const pendingRequests = new Map<string, NetworkRequest>()

  const requestHandler = (request: HTTPRequest) => {
    const headers: Record<string, string> = {}
    const rawHeaders = request.headers()
    for (const [key, value] of Object.entries(rawHeaders)) {
      headers[key] = value
    }

    const networkRequest: NetworkRequest = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      requestHeaders: headers,
      postData: request.postData(),
      timestamp: Date.now(),
    }

    pendingRequests.set(request.url() + request.method(), networkRequest)
  }

  const responseHandler = (response: HTTPResponse) => {
    const request = response.request()
    const key = request.url() + request.method()
    const networkRequest = pendingRequests.get(key)

    if (networkRequest) {
      const responseHeaders: Record<string, string> = {}
      const rawHeaders = response.headers()
      for (const [hKey, hValue] of Object.entries(rawHeaders)) {
        responseHeaders[hKey] = hValue
      }

      networkRequest.response = {
        status: response.status(),
        statusText: response.statusText(),
        headers: responseHeaders,
        fromCache: response.fromCache(),
        fromServiceWorker: response.fromServiceWorker(),
      }

      networkRequests.push(networkRequest)
      pendingRequests.delete(key)
    }
  }

  page.on("request", requestHandler)
  page.on("response", responseHandler)

  return {
    getNetworkRequests: () => networkRequests,
    cleanup: () => {
      page.off("request", requestHandler)
      page.off("response", responseHandler)
    },
  }
}

const FORBIDDEN_FETCH_HEADERS = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
  "via",
])

function sanitizeHeadersForFetch(headers?: Record<string, string> | null): Record<string, string> {
  if (!headers) return {}

  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (FORBIDDEN_FETCH_HEADERS.has(lowerKey) || lowerKey.startsWith("sec-") || lowerKey.startsWith("proxy-")) {
      continue
    }
    sanitized[key] = value
  }

  return sanitized
}

interface BrowserFetchResult {
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
  url?: string
  error?: string
}

function parseBrowserFetchResult(raw: unknown): BrowserFetchResult {
  if (typeof raw === "object" && raw !== null) return raw as BrowserFetchResult
  return { error: "Unexpected evaluate result" }
}

export async function stealthRequest(input: RequestConfig, proxy?: ProxyConfig): Promise<RequestResponse> {
  let browser: Browser | null = null
  let networkCapture: ReturnType<typeof setupNetworkCapture> | null = null

  try {
    const validated = RequestSchema.parse(input)

    const randomIndex = Math.floor(Math.random() * USER_AGENTS.length)
    const randomUserAgent = USER_AGENTS[randomIndex] ?? USER_AGENTS[0] ?? ""

    browser = await setupBrowser(proxy, randomUserAgent)
    const page = await browser.newPage()

    if (validated.recordNetworkRequests) {
      networkCapture = setupNetworkCapture(page)
    }

    if (proxy) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      })
    }

    // Set extra headers if provided
    if (validated.headers) {
      await page.setExtraHTTPHeaders(validated.headers)
    }

    // For GET requests, use page.goto directly
    if (validated.method === "GET") {
      const response = await page.goto(validated.url, {
        waitUntil: "networkidle0",
        timeout: validated.timeout ?? DEFAULT_TIMEOUT,
      })

      if (!response) {
        return {
          success: false,
          error: "No response received",
          url: validated.url,
          method: validated.method,
          networkRequests: networkCapture?.getNetworkRequests(),
        }
      }

      const html = await page.content()
      const responseHeaders: Record<string, string> = {}
      const headers = response.headers()
      Object.keys(headers).forEach(key => {
        responseHeaders[key] = headers[key] || ""
      })

      return {
        success: response.ok(),
        statusCode: response.status(),
        statusText: response.statusText(),
        responseBody: html,
        responseHeaders,
        url: validated.url,
        method: validated.method,
        networkRequests: networkCapture?.getNetworkRequests(),
      }
    }

    const timeoutMs = validated.timeout ?? DEFAULT_TIMEOUT

    try {
      // use provided originUrl for cookie collection, or fallback to URL's origin
      const navigationUrl = validated.originUrl ?? new URL(validated.url).origin
      await page.goto(navigationUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      })
    } catch {
      // ignore navigation errors; cookies may still have been set
    }

    const sanitizedHeaders = sanitizeHeadersForFetch(validated.headers)
    const postBody = validated.body ? JSON.stringify(validated.body) : undefined

    const fetchResult = parseBrowserFetchResult(
      await page.evaluate(
        async ({ url, method, headers, body, timeout }) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          try {
            const response = await fetch(url, {
              method,
              headers,
              body,
              credentials: "include",
              signal: controller.signal,
            })

            const text = await response.text()
            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value
            })

            return {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders,
              body: text,
              url: response.url,
            }
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : String(error),
            }
          } finally {
            clearTimeout(timeoutId)
          }
        },
        {
          url: validated.url,
          method: validated.method,
          headers: sanitizedHeaders,
          body: postBody,
          timeout: timeoutMs,
        },
      ),
    )

    if (fetchResult.error || !fetchResult.status) {
      return {
        success: false,
        error: fetchResult.error || "No response received",
        url: validated.url,
        method: validated.method,
        networkRequests: networkCapture?.getNetworkRequests(),
      }
    }

    return {
      success: fetchResult.status >= 200 && fetchResult.status < 300,
      statusCode: fetchResult.status,
      statusText: fetchResult.statusText || "",
      responseBody: fetchResult.body || "",
      responseHeaders: fetchResult.headers || {},
      url: fetchResult.url || validated.url,
      method: validated.method,
      networkRequests: networkCapture?.getNetworkRequests(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      url: input.url,
      method: input.method || "POST",
      networkRequests: networkCapture?.getNetworkRequests(),
    }
  } finally {
    try {
      networkCapture?.cleanup()
    } catch {
      /* ignore */
    }
    if (browser) {
      await cleanupBrowser(browser).catch(() => {})
    }
  }
}

export * from "./constants"
export { StealthResponse } from "./StealthResponse"
export type { StealthFetchOptions } from "./stealthFetch"
// Main exports
export { stealthFetch } from "./stealthFetch"
// Advanced/internal exports
export * from "./types"
