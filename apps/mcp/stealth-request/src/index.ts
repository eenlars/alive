import type { Browser, Page, LaunchOptions, HTTPRequest, HTTPResponse } from "puppeteer"
import puppeteerExtra from "puppeteer-extra"
import stealthPlugin from "puppeteer-extra-plugin-stealth"
import { USER_AGENTS, DEFAULT_TIMEOUT } from "./constants"
import { RequestSchema, type ProxyConfig, type RequestConfig, type RequestResponse, type NetworkRequest } from "./types"

async function setupBrowser(proxy?: ProxyConfig): Promise<Browser> {
  puppeteerExtra.use(stealthPlugin())

  const args = ["--no-sandbox", "--disable-setuid-sandbox"]

  if (proxy) {
    args.push(`--proxy-server=${proxy.ip}:${proxy.port}`)
  }

  const launchOptions: LaunchOptions = {
    headless: true,
    args
  }

  return await puppeteerExtra.launch(launchOptions)
}

async function cleanupBrowser(browser: Browser) {
  const pages = await browser.pages()
  await Promise.all(pages.map((page: Page) => page.close()))
  await browser.close()
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
      timestamp: Date.now()
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
        fromServiceWorker: response.fromServiceWorker()
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
    }
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
  "via"
])

function sanitizeHeadersForFetch(
  headers?: Record<string, string> | null
): Record<string, string> {
  if (!headers) return {}

  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (
      FORBIDDEN_FETCH_HEADERS.has(lowerKey) ||
      lowerKey.startsWith("sec-") ||
      lowerKey.startsWith("proxy-")
    ) {
      continue
    }
    sanitized[key] = value
  }

  return sanitized
}

export async function stealthRequest(
  input: RequestConfig,
  proxy?: ProxyConfig
): Promise<RequestResponse> {
  let browser: Browser | null = null
  let networkCapture: ReturnType<typeof setupNetworkCapture> | null = null

  try {
    const validated = RequestSchema.parse(input)

    browser = await setupBrowser(proxy)
    const page = await browser.newPage()

    if (validated.recordNetworkRequests) {
      networkCapture = setupNetworkCapture(page)
    }

    if (proxy) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      })
    }

    const randomIndex = Math.floor(Math.random() * USER_AGENTS.length)
    const randomUserAgent = USER_AGENTS[randomIndex] ?? USER_AGENTS[0] ?? ""
    await page.setUserAgent(randomUserAgent)

    // Set extra headers if provided
    if (validated.headers) {
      await page.setExtraHTTPHeaders(validated.headers)
    }

    // For GET requests, use page.goto directly
    if (validated.method === "GET") {
      const response = await page.goto(validated.url, {
        waitUntil: "networkidle0",
        timeout: validated.timeout ?? DEFAULT_TIMEOUT
      })

      if (!response) {
        const capturedRequests = networkCapture?.getNetworkRequests()
        networkCapture?.cleanup()
        await cleanupBrowser(browser)
        return {
          success: false,
          error: "No response received",
          url: validated.url,
          method: validated.method,
          networkRequests: capturedRequests
        }
      }

      const html = await page.content()
      const responseHeaders: Record<string, string> = {}
      const headers = response.headers()
      Object.keys(headers).forEach((key) => {
        responseHeaders[key] = headers[key] || ""
      })

      const capturedRequests = networkCapture?.getNetworkRequests()
      networkCapture?.cleanup()
      await cleanupBrowser(browser)

      return {
        success: response.ok(),
        statusCode: response.status(),
        statusText: response.statusText(),
        responseBody: html,
        responseHeaders,
        url: validated.url,
        method: validated.method,
        networkRequests: capturedRequests
      }
    }

    const timeoutMs = validated.timeout ?? DEFAULT_TIMEOUT

    try {
      // use provided originUrl for cookie collection, or fallback to URL's origin
      const navigationUrl = validated.originUrl ?? new URL(validated.url).origin
      await page.goto(navigationUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      })
    } catch {
      // ignore navigation errors; cookies may still have been set
    }

    const sanitizedHeaders = sanitizeHeadersForFetch(validated.headers)
    const postBody = validated.body ? JSON.stringify(validated.body) : undefined

    const fetchResult = (await page.evaluate(
      async ({ url, method, headers, body, timeout }) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
          const response = await fetch(url, {
            method,
            headers,
            body,
            credentials: "include",
            signal: controller.signal
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
            url: response.url
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
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
        timeout: timeoutMs
      }
    )) as {
      status?: number
      statusText?: string
      headers?: Record<string, string>
      body?: string
      url?: string
      error?: string
    }

    if (fetchResult.error || !fetchResult.status) {
      const capturedRequests = networkCapture?.getNetworkRequests()
      networkCapture?.cleanup()
      await cleanupBrowser(browser)
      return {
        success: false,
        error: fetchResult.error || "No response received",
        url: validated.url,
        method: validated.method,
        networkRequests: capturedRequests
      }
    }

    const capturedRequests = networkCapture?.getNetworkRequests()
    networkCapture?.cleanup()
    await cleanupBrowser(browser)

    return {
      success: fetchResult.status >= 200 && fetchResult.status < 300,
      statusCode: fetchResult.status,
      statusText: fetchResult.statusText || "",
      responseBody: fetchResult.body || "",
      responseHeaders: fetchResult.headers || {},
      url: fetchResult.url || validated.url,
      method: validated.method,
      networkRequests: capturedRequests
    }
  } catch (error) {
    const capturedRequests = networkCapture?.getNetworkRequests()
    networkCapture?.cleanup()
    if (browser) {
      await cleanupBrowser(browser)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      url: input.url,
      method: input.method || "POST",
      networkRequests: capturedRequests
    }
  }
}

// Main exports
export { stealthFetch } from "./stealthFetch"
export { StealthResponse } from "./StealthResponse"
export type { StealthFetchOptions } from "./stealthFetch"

// Advanced/internal exports
export * from "./types"
export * from "./constants"
