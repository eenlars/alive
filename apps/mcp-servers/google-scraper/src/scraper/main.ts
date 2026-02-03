/**
 * Google Maps Search - Core Logic
 *
 * Searches Google Maps for business information using Puppeteer.
 * Supports both single business pages and multi-result feeds.
 */

import type { GoogleMapsBusiness, GoogleMapsOptions, GoogleMapsResult, SearchInput } from "./types.js"
import {
  cleanupBrowser,
  clickReviewsTabAndWait,
  detectFeed,
  navigateToGoogleMaps,
  normalizeHostname,
  sanitizeJSON,
  setupPage,
} from "./utils.js"
import { searchSingleBusiness } from "./extractors/detail.js"
import { handleMultipleFeed } from "./extractors/multiple.js"

export type SearchResult = { success: true; data: GoogleMapsResult } | { success: false; error: string }

// Default timeout for entire search operation (45 seconds)
const DEFAULT_SEARCH_TIMEOUT_MS = 45000

/**
 * Search Google Maps for business information.
 *
 * @param input - Search configuration (query, mode, result count)
 * @param options - Additional options (logging, website filter, concurrency)
 * @returns Search result with businesses and HTML
 */
export async function searchGoogleMaps(input: SearchInput, options: GoogleMapsOptions = {}): Promise<SearchResult> {
  const {
    onlyIncludeWithWebsite,
    concurrency = 3,
    includeReviews = false,
    maxReviews = 5,
    timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS,
  } = options

  // Wrap entire operation in a timeout
  const timeoutPromise = new Promise<SearchResult>((_, reject) => {
    setTimeout(() => reject(new Error(`Search timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  const searchPromise = executeSearch(input, {
    onlyIncludeWithWebsite,
    concurrency,
    includeReviews,
    maxReviews,
  })

  return Promise.race([searchPromise, timeoutPromise])
}

async function executeSearch(
  input: SearchInput,
  options: {
    onlyIncludeWithWebsite?: string
    concurrency: number
    includeReviews: boolean
    maxReviews: number
  },
): Promise<SearchResult> {
  const { onlyIncludeWithWebsite, concurrency, includeReviews, maxReviews } = options

  const { browser, page } = await setupPage()

  try {
    if (input.mode === "url") {
      await page.goto(input.url, { waitUntil: "networkidle2" })
    } else {
      await navigateToGoogleMaps(page, input.query)
    }
  } catch (err) {
    await cleanupBrowser(browser)
    return {
      success: false,
      error: `Navigation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const isFeed = input.mode !== "url" && (await detectFeed(page))

  if (isFeed) {
    return await handleMultipleFeed({
      page,
      browser,
      input,
      onlyIncludeWithWebsite,
      concurrency,
      includeReviews,
      maxReviews,
    })
  }

  // Single business page - if we need reviews, click the tab first
  if (includeReviews) {
    await clickReviewsTabAndWait(page)
  }

  const html = await page.content()
  const singleRes = await searchSingleBusiness(html, page.url(), { includeReviews, maxReviews })
  await cleanupBrowser(browser)

  if (!singleRes.success) {
    return singleRes
  }

  let bizArr: GoogleMapsBusiness[] =
    singleRes.data.businesses.length > 0
      ? [sanitizeJSON<GoogleMapsBusiness>(singleRes.data.businesses[0] as Record<string, unknown>)]
      : []

  if (onlyIncludeWithWebsite) {
    bizArr = bizArr.filter(
      b => b.bizWebsite && normalizeHostname(b.bizWebsite) === normalizeHostname(onlyIncludeWithWebsite),
    )
  }

  return {
    success: true,
    data: {
      businesses: bizArr,
      html,
    },
  }
}
