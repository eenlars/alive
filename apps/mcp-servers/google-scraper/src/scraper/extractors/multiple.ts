import * as cheerio from "cheerio"
import type { Element } from "domhandler"
import type { Browser, Page } from "puppeteer"
import { parseRatingText } from "../i18n.js"
import type { GoogleMapsBusiness, GoogleMapsResult, InputAuto, InputMultiple, ProxyConfig } from "../types.js"
import { autoScroll, cleanupBrowser, isNullish, normalizeHostname, sanitizeJSON } from "../utils.js"
import { scrapeDetailPage } from "./detail.js"

type ExtractResult = { success: true; data: GoogleMapsResult } | { success: false; error: string }

function sanitize(text: string): string {
  return text.replace(/·/g, " ").replace(/\n/g, "").replace(/\s+/g, " ").trim()
}

/**
 * Extract multiple business cards from a Google Maps feed page.
 */
export async function searchMultipleBusinesses(html: string, resultCount = 10): Promise<ExtractResult> {
  try {
    const businesses: GoogleMapsBusiness[] = []
    const $ = cheerio.load(html)
    const aTags = $("a")
    const parents: cheerio.Cheerio<Element>[] = []

    aTags.each((_i, el) => {
      const href = $(el).attr("href")
      if (!href) return
      if (href.includes("/maps/place/")) {
        parents.push($(el).parent())
      }
    })

    for (const parent of parents) {
      // Remove Google symbols
      parent.find(".google-symbols").remove()
      parent.find("[class*='google-symbols']").remove()
      parent.find("*:has(.google-symbols)").remove()

      const url = parent.find("a").attr("href")
      const website = parent.find('a[data-value="Website"]').attr("href")
      const storeName = parent.find("div.fontHeadlineSmall").text()
      const ratingText = parent.find("span.fontBodyMedium > span").attr("aria-label")

      const bodyDiv = parent.find("div.fontBodyMedium").first()
      const children = bodyDiv.children()
      const lastChild = children.last()
      const firstOfLast = lastChild.children().first()
      const lastOfLast = lastChild.children().last()
      const phone = lastOfLast?.text()?.split("·")?.[1]?.trim()

      let address = firstOfLast?.text()?.split("·")?.[1]?.trim() ?? ""

      if (isNullish(address)) {
        const addressDiv = parent.find(".W4Efsd .W4Efsd span[aria-hidden='true']").next()
        address = addressDiv.text().trim()
      }

      const finalPhone = sanitize(address.replace(phone ?? "", ""))

      // Parse rating text using i18n-aware parser (handles "4.5 stars", "4,9 Sterne", etc.)
      const { stars, numberOfReviews } = parseRatingText(ratingText)

      businesses.push({
        placeId: `ChI${url?.split("?")?.[0]?.split("ChI")?.[1]}`,
        address: finalPhone,
        category: firstOfLast?.text()?.split("·")?.[0]?.trim(),
        status: "",
        phone: phone ? sanitize(phone) : undefined,
        googleUrl: url,
        bizWebsite: website,
        storeName: sanitize(storeName),
        ratingText,
        stars,
        numberOfReviews,
        mainImage: undefined,
        hours: null,
      })
    }

    const limitedBusinesses = businesses.slice(0, resultCount)

    return {
      success: true,
      data: {
        businesses: limitedBusinesses,
        html,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Keep only businesses whose website hostname matches the filter.
 */
function filterByWebsite(businesses: GoogleMapsBusiness[], onlyIncludeWithWebsite?: string): GoogleMapsBusiness[] {
  if (!onlyIncludeWithWebsite) return businesses

  const targetHost = normalizeHostname(onlyIncludeWithWebsite)
  return businesses.filter(b => b.bizWebsite && normalizeHostname(b.bizWebsite) === targetHost)
}

/**
 * Fetch detail pages in parallel and merge them back into the original list.
 */
async function enrichWithDetails(
  list: GoogleMapsBusiness[],
  proxy?: ProxyConfig,
  concurrency = 3,
  options: { includeReviews?: boolean; maxReviews?: number } = {},
): Promise<GoogleMapsBusiness[]> {
  const googleUrls = list.map(b => b.googleUrl).filter((url): url is string => Boolean(url) && !isNullish(url))

  const batchSize = concurrency
  const results: PromiseSettledResult<{ originalUrl: string; business: GoogleMapsBusiness | null }>[] = []

  for (let i = 0; i < googleUrls.length; i += batchSize) {
    const batch = googleUrls.slice(i, i + batchSize)
    const batchPromises = batch.map(googleUrl => scrapeDetailPage(googleUrl, proxy, options))
    const batchResults = await Promise.allSettled(batchPromises)
    results.push(...batchResults)

    if (i + batchSize < googleUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  const enriched = new Map<string, GoogleMapsBusiness>()

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.business) {
      enriched.set(result.value.business.googleUrl!, result.value.business)
    }
  }

  return list.map(b => enriched.get(b.googleUrl!) ?? b)
}

/**
 * High-level entry point for handling multiple results from a feed.
 */
export async function handleMultipleFeed({
  page,
  browser,
  input,
  proxy,
  onlyIncludeWithWebsite,
  concurrency = 3,
  includeReviews = false,
  maxReviews = 5,
}: {
  page: Page
  browser: Browser
  input: InputMultiple | InputAuto
  proxy?: ProxyConfig
  onlyIncludeWithWebsite?: string
  concurrency?: number
  includeReviews?: boolean
  maxReviews?: number
}): Promise<{ success: true; data: GoogleMapsResult } | { success: false; error: string }> {
  try {
    await autoScroll(page)
    const pageHTML = await page.content()

    const parse = await searchMultipleBusinesses(pageHTML, input.resultCount)

    if (!parse.success) {
      await cleanupBrowser(browser)
      return { success: false, error: parse.error }
    }

    const initial = parse.data.businesses
    const filtered = filterByWebsite(initial, onlyIncludeWithWebsite)
    const final = input.includeDetails
      ? await enrichWithDetails(filtered, proxy, concurrency, { includeReviews, maxReviews })
      : filtered

    await cleanupBrowser(browser)

    return {
      success: true,
      data: {
        businesses: final.length
          ? final
          : initial.map(b => sanitizeJSON<GoogleMapsBusiness>(b as Record<string, unknown>)),
        html: pageHTML,
      },
    }
  } catch (error) {
    await cleanupBrowser(browser)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
