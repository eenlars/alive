import type { Browser, HTTPRequest, HTTPResponse, LaunchOptions, Page, ScreenshotOptions } from "puppeteer"
import puppeteerExtra from "puppeteer-extra"
import stealthPlugin from "puppeteer-extra-plugin-stealth"
import {
  CF_CHALLENGE_POLL_MS,
  CF_CHALLENGE_WAIT_MS,
  DEFAULT_TIMEOUT,
  PAGINATION_SETTLE_MS,
  USER_AGENTS,
} from "./constants"
import {
  type ExtractedLink,
  type NetworkRequest,
  type ProxyConfig,
  type RequestConfig,
  type RequestResponse,
  RequestSchema,
} from "./types"

puppeteerExtra.use(stealthPlugin())

async function setupBrowser(proxy?: ProxyConfig, userAgent?: string): Promise<Browser> {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--window-size=1920,1080",
    "--disable-dev-shm-usage",
  ]

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

/**
 * Set up a page with realistic browser fingerprint.
 */
async function configurePage(page: Page): Promise<void> {
  await page.setViewport({ width: 1920, height: 1080 })
  await page.setExtraHTTPHeaders({
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  })
}

/**
 * Detect whether the page is showing a Cloudflare challenge/block.
 */
async function detectCloudflareChallenge(page: Page, statusCode: number): Promise<boolean> {
  // Cloudflare challenge pages return 403 or 503
  if (statusCode !== 403 && statusCode !== 503) return false

  return page.evaluate(() => {
    const html = document.documentElement.innerHTML
    return (
      html.includes("cf-challenge") ||
      html.includes("cf-turnstile") ||
      html.includes("challenge-platform") ||
      html.includes("Just a moment") ||
      html.includes("Checking if the site connection is secure") ||
      html.includes("Verify you are human")
    )
  })
}

/**
 * Wait for a Cloudflare challenge to resolve by polling for page changes.
 */
async function waitForChallengeResolution(page: Page): Promise<boolean> {
  const deadline = Date.now() + CF_CHALLENGE_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, CF_CHALLENGE_POLL_MS))
    const stillBlocked = await page
      .evaluate(() => {
        const html = document.documentElement.innerHTML
        return (
          html.includes("cf-challenge") ||
          html.includes("cf-turnstile") ||
          html.includes("challenge-platform") ||
          html.includes("Just a moment") ||
          html.includes("Verify you are human")
        )
      })
      .catch(() => true)

    if (!stillBlocked) return true
  }
  return false
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

/**
 * Wait for a CSS selector, then optionally execute JS in the page context.
 */
async function postNavigationProcessing(
  page: Page,
  waitFor: string | null | undefined,
  executeJs: string | null | undefined,
  timeout: number,
): Promise<{ jsResult?: unknown }> {
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout })
  }

  let jsResult: unknown
  if (executeJs) {
    jsResult = await page.evaluate(executeJs)
  }

  return { jsResult }
}

/**
 * Capture page content in the requested format.
 */
async function captureContent(
  page: Page,
  screenshot: RequestConfig["screenshot"],
  extractLinks: boolean,
): Promise<{ body: unknown; format: "html" | "links" | "screenshot" }> {
  // Screenshot takes priority
  if (screenshot) {
    const opts: ScreenshotOptions = { encoding: "base64" }
    if (typeof screenshot === "object") {
      opts.type = screenshot.type ?? "png"
      opts.fullPage = screenshot.fullPage ?? false
    } else {
      opts.type = "png"
      opts.fullPage = false
    }
    const data = await page.screenshot(opts)
    return { body: data, format: "screenshot" }
  }

  if (extractLinks) {
    const links: ExtractedLink[] = await page.evaluate(() => {
      const anchors = document.querySelectorAll("a[href]")
      return Array.from(anchors).map(a => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLAnchorElement).textContent?.trim() ?? "",
      }))
    })
    return { body: links, format: "links" }
  }

  const html = await page.content()
  return { body: html, format: "html" }
}

/**
 * Follow pagination by clicking a "next" selector repeatedly, collecting content from each page.
 */
async function paginationLoop(
  page: Page,
  selector: string,
  maxPages: number,
  screenshot: RequestConfig["screenshot"],
  extractLinks: boolean,
  timeout: number,
): Promise<{ pages: Array<{ body: unknown; format: "html" | "links" | "screenshot"; url: string }> }> {
  const pages: Array<{ body: unknown; format: "html" | "links" | "screenshot"; url: string }> = []

  for (let i = 0; i < maxPages; i++) {
    const nextButton = await page.$(selector)
    if (!nextButton) break

    // Check if element is visible and not disabled
    const isClickable = await page.evaluate(el => {
      const htmlEl = el as HTMLElement
      if (htmlEl.hasAttribute("disabled")) return false
      const style = window.getComputedStyle(htmlEl)
      return style.display !== "none" && style.visibility !== "hidden"
    }, nextButton)
    if (!isClickable) break

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout }).catch(() => {
        // Some SPAs don't trigger navigation; fall back to settle delay
      }),
      nextButton.click(),
    ])

    // Allow dynamic content to settle
    await new Promise(r => setTimeout(r, PAGINATION_SETTLE_MS))

    const captured = await captureContent(page, screenshot, extractLinks)
    pages.push({ ...captured, url: page.url() })
  }

  return { pages }
}

export async function stealthRequest(input: RequestConfig, proxy?: ProxyConfig): Promise<RequestResponse> {
  let browser: Browser | null = null
  let networkCapture: ReturnType<typeof setupNetworkCapture> | null = null

  try {
    const validated = RequestSchema.parse(input)

    // DOM features require GET method
    const hasDomFeatures =
      validated.waitFor ||
      validated.extractLinks ||
      validated.screenshot ||
      validated.executeJs ||
      validated.followPagination
    if (hasDomFeatures && validated.method !== "GET") {
      return {
        success: false,
        error: "DOM features (waitFor, extractLinks, screenshot, executeJs, followPagination) require method: GET",
        url: validated.url,
        method: validated.method,
      }
    }

    const randomIndex = Math.floor(Math.random() * USER_AGENTS.length)
    const randomUserAgent = USER_AGENTS[randomIndex] ?? USER_AGENTS[0] ?? ""

    browser = await setupBrowser(proxy, randomUserAgent)
    const page = await browser.newPage()
    await configurePage(page)

    if (validated.recordNetworkRequests) {
      networkCapture = setupNetworkCapture(page)
    }

    if (proxy) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      })
    }

    // Merge user headers on top of the realistic defaults
    if (validated.headers) {
      await page.setExtraHTTPHeaders(validated.headers)
    }

    const timeoutMs = validated.timeout ?? DEFAULT_TIMEOUT

    // For GET requests, use page.goto directly
    if (validated.method === "GET") {
      const response = await page.goto(validated.url, {
        waitUntil: "networkidle0",
        timeout: timeoutMs,
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

      // Detect and wait through Cloudflare challenges
      const statusCode = response.status()
      const isCfChallenge = await detectCloudflareChallenge(page, statusCode)
      if (isCfChallenge) {
        const resolved = await waitForChallengeResolution(page)
        if (!resolved) {
          return {
            success: false,
            error: "Cloudflare challenge did not resolve",
            statusCode,
            url: validated.url,
            method: validated.method,
            networkRequests: networkCapture?.getNetworkRequests(),
          }
        }
      }

      const responseHeaders: Record<string, string> = {}
      const headers = isCfChallenge ? {} : response.headers()
      Object.keys(headers).forEach(key => {
        responseHeaders[key] = headers[key] || ""
      })

      // Post-navigation processing (waitFor + executeJs)
      const { jsResult } = await postNavigationProcessing(page, validated.waitFor, validated.executeJs, timeoutMs)

      // Capture content in requested format
      const captured = await captureContent(page, validated.screenshot, validated.extractLinks)

      // Follow pagination if configured
      let paginatedPages: Array<{ body: unknown; format: string; url: string }> | undefined
      if (validated.followPagination) {
        const { pages: extraPages } = await paginationLoop(
          page,
          validated.followPagination.selector,
          validated.followPagination.maxPages,
          validated.screenshot,
          validated.extractLinks,
          timeoutMs,
        )

        if (extraPages.length > 0) {
          // Merge: for links, concat all arrays. For HTML, join. For screenshot, keep all.
          if (captured.format === "links" && Array.isArray(captured.body)) {
            const allLinks = [...(captured.body as ExtractedLink[])]
            for (const p of extraPages) {
              if (Array.isArray(p.body)) {
                allLinks.push(...(p.body as ExtractedLink[]))
              }
            }
            captured.body = allLinks
          } else {
            paginatedPages = extraPages
          }
        }
      }

      const finalStatusCode = isCfChallenge ? 200 : response.status()
      const result: RequestResponse = {
        success: isCfChallenge ? true : response.ok(),
        statusCode: finalStatusCode,
        statusText: isCfChallenge ? "OK" : response.statusText(),
        responseBody: captured.body,
        responseHeaders,
        format: captured.format,
        url: validated.url,
        method: validated.method,
        networkRequests: networkCapture?.getNetworkRequests(),
      }

      if (jsResult !== undefined) {
        ;(result as Record<string, unknown>).jsResult = jsResult
      }
      if (paginatedPages) {
        ;(result as Record<string, unknown>).paginatedPages = paginatedPages
      }

      return result
    }

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

export { RequestCache } from "./cache"
export * from "./constants"
export { StealthResponse } from "./StealthResponse"
export type { StealthFetchOptions } from "./stealthFetch"
// Main exports
export { stealthFetch } from "./stealthFetch"
// Advanced/internal exports
export * from "./types"
