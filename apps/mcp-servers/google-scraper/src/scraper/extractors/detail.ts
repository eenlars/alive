import * as cheerio from "cheerio"
import type { GoogleMapsBusiness, GoogleMapsResult, GoogleMapsReview, ProxyConfig } from "../types.js"
import { parseHours, sanitizeJSON, setupPage, cleanupBrowser, clickReviewsTabAndWait } from "../utils.js"
import { isRelativeTime, extractAuthorFromLabel } from "../i18n.js"

type ExtractResult = { success: true; data: GoogleMapsResult } | { success: false; error: string }

/**
 * Parse star rating from aria-label like "5 Sterne", "4 stars", "3 estrelas"
 */
function parseStarRating(label: string | undefined): number | null {
  if (!label) return null
  const match = label.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Extract reviews from HTML using stable selectors.
 *
 * Strategy (in order of stability):
 * 1. Class-based selectors (most reliable for structure, may need updates)
 * 2. data-review-id for deduplication
 * 3. aria-label for ratings (accessibility requirement = stable)
 */
function extractReviews($: cheerio.CheerioAPI, maxReviews = 5): GoogleMapsReview[] {
  const reviews: GoogleMapsReview[] = []
  const seenTexts = new Set<string>()

  // Primary strategy: Use class-based selectors (jftiEf is the review container)
  // These may change but are the most reliable for structure
  $("div.jftiEf").each((_i, el) => {
    if (reviews.length >= maxReviews) return false

    const $review = $(el)

    // Author - try class first, then aria-label fallback
    let author = $review.find(".d4r55").text().trim()
    if (!author) {
      const authorLabel = $review.find('button[aria-label*="Photo"], button[aria-label*="Foto"]').attr("aria-label")
      if (authorLabel) {
        author = extractAuthorFromLabel(authorLabel)
      }
    }

    // Rating - use aria-label (stable accessibility requirement)
    const ratingLabel = $review.find('[role="img"][aria-label]').attr("aria-label")
    const rating = parseStarRating(ratingLabel)

    // Time - class first, then pattern matching fallback using shared utility
    let time = $review.find(".rsqaWe").text().trim()
    if (!time) {
      $review.find("span").each((_, span) => {
        const text = $(span).text().trim()
        if (isRelativeTime(text)) {
          time = text
          return false
        }
      })
    }

    // Review text - try multiple class selectors
    const text = $review.find(".wiI7pd, .MyEned").first().text().trim()

    // Deduplicate by text content
    if (text && seenTexts.has(text)) return
    if (text) seenTexts.add(text)

    if (author || text) {
      reviews.push({
        author: author || "Anonymous",
        rating,
        text: text || "",
        time: time || "",
      })
    }
  })

  // Fallback: If no reviews found via classes, try data-review-id approach
  if (reviews.length === 0) {
    const reviewIds = new Set<string>()

    $("[data-review-id]").each((_, el) => {
      if (reviews.length >= maxReviews) return false

      const reviewId = $(el).attr("data-review-id")
      if (!reviewId || reviewIds.has(reviewId)) return
      reviewIds.add(reviewId)

      // Walk up to find container with review content
      let $container = $(el)
      for (let j = 0; j < 8; j++) {
        const $parent = $container.parent()
        if ($parent.length === 0) break
        const hasRating = $parent.find('[role="img"][aria-label]').length > 0
        const textLen = $parent.find("span, div").text().length
        if (hasRating && textLen > 100) {
          $container = $parent
          break
        }
        $container = $parent
      }

      const ratingLabel = $container.find('[role="img"][aria-label]').first().attr("aria-label")
      const rating = parseStarRating(ratingLabel)

      // Find the longest text block as review content
      let text = ""
      $container.find("span").each((_, span) => {
        const content = $(span).text().trim()
        if (content.length > text.length && content.length > 30 && !content.includes("star")) {
          text = content
        }
      })

      if (text && !seenTexts.has(text)) {
        seenTexts.add(text)
        reviews.push({
          author: "Anonymous",
          rating,
          text,
          time: "",
        })
      }
    })
  }

  return reviews
}

/**
 * Extract business data from a single Google Maps business page.
 */
export async function searchSingleBusiness(
  html: string,
  pageUrl: string,
  options: { includeReviews?: boolean; maxReviews?: number } = {},
): Promise<ExtractResult> {
  const { includeReviews = false, maxReviews = 5 } = options

  try {
    const $ = cheerio.load(html)

    // 1. Name and main image
    const main = $('div[role="main"][aria-label]')
    const storeName = main.attr("aria-label") || null
    const mainImage = main.find("img[decoding='async']").first().attr("src") || null

    // 2. Rating & reviews - try multiple selectors for i18n support
    // Google changes class names frequently, so try multiple approaches
    const stars =
      $(".fontDisplayLarge").text() || // Old selector
      $(".F7nice span[aria-hidden='true']").first().text() || // New selector
      $("span.ceNzKf")
        .attr("aria-label")
        ?.match(/[\d,.]+/)?.[0] || // From aria-label
      null

    // Try to find review count from various aria-labels (reviews, Rezensionen, Reseñas, etc.)
    let numberOfReviews: number | null = null

    // Strategy 1: Look for aria-label with review keywords
    $("span[aria-label], button[aria-label]").each((_, el) => {
      if (numberOfReviews !== null) return false
      const label = $(el).attr("aria-label") || ""
      // Check if label contains review-related words and numbers
      if (
        label.match(/\d+/) &&
        label.match(/review|rezension|reseña|avalia|avis|recensi|beoordel|отзыв|评论|レビュー/i)
      ) {
        const match = label.match(/[\d.,\s]+/)
        if (match) {
          const cleanNum = match[0].replace(/[\s.]/g, "").replace(",", "")
          const parsed = parseInt(cleanNum, 10)
          if (!Number.isNaN(parsed)) {
            numberOfReviews = parsed
          }
        }
      }
    })

    // Strategy 2: Parse from visible text near rating (e.g., "(123)" or "123 reviews")
    if (numberOfReviews === null) {
      // Try old selector
      const ratingArea = $(".fontDisplayLarge").parent()
      let ratingAreaText = ratingArea.text()

      // Try new selector if old one failed
      if (!ratingAreaText) {
        ratingAreaText = $(".F7nice").parent().parent().text()
      }

      const countMatch = ratingAreaText.match(/\((\d+(?:[.,]\d+)?)\)/)
      if (countMatch) {
        const cleanNum = countMatch[1].replace(/[.,]/g, "")
        numberOfReviews = parseInt(cleanNum, 10)
      }
    }

    // Strategy 3: Look for text like "104 Google-Rezensionen" or similar
    if (numberOfReviews === null) {
      $("span, div, a").each((_, el) => {
        if (numberOfReviews !== null) return false
        const text = $(el).text().trim()
        // Match patterns like "104 Rezensionen", "104 Rezension", "1.234 reviews", "5K reviews"
        // Handles singular/plural in multiple languages
        const match = text.match(
          /^([\d.,]+)\s*(?:K)?\s*(?:Google-)?(?:Rezension(?:en)?|reviews?|avalia(?:ções|ção)?|avis|recensi(?:oni|one)?|beoordel(?:ingen)?)/i,
        )
        if (match) {
          const numStr = match[1].replace(/[\s.]/g, "").replace(",", "")
          let num = parseInt(numStr, 10)
          if (match[0].includes("K") || match[0].includes("k")) {
            num *= 1000
          }
          if (!Number.isNaN(num)) {
            numberOfReviews = num
          }
        }
      })
    }

    // 3. Website, phone, address, category, status
    const bizWebsite = $('a[data-item-id="authority"]').attr("href") || null
    const phoneLabel = $('button[data-item-id^="phone:"]').attr("aria-label") || ""
    const phone = phoneLabel.replace(/^Phone:\s*/, "").trim() || null
    const addressLabel = $('button[data-item-id="address"]').attr("aria-label") || ""
    const address = addressLabel.replace(/^Address:\s*/, "").trim() || null
    const category = $('button[jsaction*="category"]').text().trim() || null

    // Hours/status
    const hoursText = $('div[aria-expanded][jsaction*="openhours"] span.ZDu9vd').text().trim()
    const status = hoursText ? hoursText.split("⋅").map(s => s.trim())[0] : null
    const hoursTable = $("div.fontBodyMedium table.fontBodyMedium").first().parent().html() || null

    // Place ID from URL
    const placeIdMatch = pageUrl.match(/ChI[^?&]+/)
    const placeId = placeIdMatch?.[0] ?? null

    const googleUrl = $('a[href^="https://www.google.com/maps/place"]').attr("href") || pageUrl || null

    // Extract reviews if requested
    const reviews = includeReviews ? extractReviews($, maxReviews) : undefined

    const business: GoogleMapsBusiness = {
      placeId: placeId || undefined,
      storeName: storeName || undefined,
      ratingText: undefined,
      stars: stars || null,
      numberOfReviews,
      googleUrl: googleUrl || undefined,
      bizWebsite: bizWebsite || undefined,
      address: address || undefined,
      category: category || undefined,
      status: status || undefined,
      phone: phone || undefined,
      mainImage: mainImage || undefined,
      hours: parseHours(hoursTable),
      reviews,
    }

    return {
      success: true,
      data: {
        businesses: [business],
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
 * Scrape a single detail URL in its own ephemeral browser.
 */
export async function scrapeDetailPage(
  googleUrl: string,
  proxy?: ProxyConfig,
  options: { includeReviews?: boolean; maxReviews?: number } = {},
): Promise<{ originalUrl: string; business: GoogleMapsBusiness | null }> {
  const { includeReviews = false, maxReviews = 5 } = options

  try {
    const { browser, page } = await setupPage(proxy)
    await page.goto(googleUrl, { waitUntil: "networkidle2" })

    // Wait for rating section to fully load (review count is often loaded async)
    try {
      await page.waitForSelector(".F7nice, .fontDisplayLarge", { timeout: 5000 })
      // Give extra time for review count to render (it's often loaded via JS after rating)
      await new Promise(resolve => setTimeout(resolve, 1500))
    } catch {
      // Rating section not found, continue anyway
    }

    // If we need reviews, click the Reviews tab and wait for content
    if (includeReviews) {
      await clickReviewsTabAndWait(page)
    }

    // Try to extract review count directly from the page using JS evaluation
    // This catches dynamically loaded content that may not be in HTML
    const pageReviewCount = await page
      .evaluate(() => {
        // Look for text like "104 Rezensionen", "1.234 reviews", "104 Rezension" (singular/plural)
        const allText = document.body.innerText
        // Pattern matches: number + optional space + review word (handles singular/plural in multiple languages)
        const pattern =
          /(\d+(?:[.,]\d+)?)\s*(?:Google-)?(?:Rezension(?:en)?|reviews?|avalia(?:ções|ção)?|avis|recensi(?:oni|one)?|beoordel(?:ingen)?|отзыв)/gi
        const match = pattern.exec(allText)
        if (match) {
          const numStr = match[1].replace(/[\s.]/g, "").replace(",", "")
          const num = parseInt(numStr, 10)
          if (!Number.isNaN(num) && num > 0) {
            return num
          }
        }
        return null
      })
      .catch(() => null)

    const html = await page.content()
    const result = await searchSingleBusiness(html, googleUrl, { includeReviews, maxReviews })
    await cleanupBrowser(browser)

    if (result.success && result.data.businesses.length > 0) {
      const business = result.data.businesses[0]
      // Use page-evaluated review count if HTML extraction failed
      if (business.numberOfReviews === null && pageReviewCount !== null) {
        business.numberOfReviews = pageReviewCount
      }
      return {
        originalUrl: googleUrl,
        business: sanitizeJSON<GoogleMapsBusiness>(business as Record<string, unknown>),
      }
    }
    return { originalUrl: googleUrl, business: null }
  } catch {
    return { originalUrl: googleUrl, business: null }
  }
}
