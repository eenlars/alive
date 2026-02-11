import * as fs from "node:fs"
// Test using the debug.ts capture which worked earlier
import {
  cleanupBrowser,
  detectFeed,
  navigateToGoogleMaps,
  REVIEW_TAB_SELECTORS,
  setupPage,
} from "./src/scraper/utils.js"

console.log("Testing Reviews tab click...")

const { browser, page } = await setupPage()

// Use navigation like the working capture script
await navigateToGoogleMaps(page, "prainha itacare brazil")
const isFeed = await detectFeed(page)
console.log("Is feed:", isFeed)

if (!isFeed) {
  // Already on detail page
  console.log("On detail page")
} else {
  // Click first result
  const firstResult = await page.$('a[href*="/maps/place/"]')
  if (firstResult) {
    await firstResult.click()
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15000 }).catch(() => {})
    console.log("Clicked first result")
  }
}

// Look for the rating that opens reviews - check parent structure
const ratingInfo = await page.evaluate(() => {
  const ratingSpan = document.querySelector('span[aria-label*="Sterne"], span[aria-label*="stars"]')
  if (!ratingSpan) return null

  // Walk up to find clickable parent
  let el: Element | null = ratingSpan
  const parents = []
  for (let i = 0; i < 6 && el; i++) {
    parents.push({
      tag: el.tagName,
      classes: el.className?.slice(0, 60),
      ariaLabel: el.getAttribute("aria-label"),
      jsaction: el.getAttribute("jsaction"),
      role: el.getAttribute("role"),
    })
    el = el.parentElement
  }
  return parents
})
console.log("Rating element parents:")
for (const p of ratingInfo || []) {
  console.log("  -", p)
}

// Try each selector
for (const sel of REVIEW_TAB_SELECTORS) {
  const found = await page.$(sel)
  if (found) {
    console.log("Found selector:", sel)
  }
}

// Try clicking with manual implementation to debug
const reviewsButton = await page.$('button[aria-label*="Rezensionen"]')
if (reviewsButton) {
  const btnInfo = await page.evaluate(
    (btn: Element) => ({
      ariaLabel: btn.getAttribute("aria-label"),
      text: btn.textContent,
      rect: btn.getBoundingClientRect(),
    }),
    reviewsButton,
  )
  console.log("Reviews button info:", btnInfo)

  // Try clicking with JS instead of puppeteer click
  await page.evaluate((btn: Element) => (btn as HTMLElement).click(), reviewsButton)
  console.log("Clicked via JS")

  // Wait for reviews to load
  console.log("Waiting for network idle...")
  await page.waitForNetworkIdle({ idleTime: 3000, timeout: 20000 }).catch(() => console.log("Network idle timeout"))

  // Try waiting for review content specifically
  console.log("Waiting for review selectors...")
  await page
    .waitForSelector(".jftiEf, .wiI7pd, [data-review-id]", { timeout: 10000 })
    .catch(() => console.log("Review selector timeout"))

  // Extra wait
  await new Promise(r => setTimeout(r, 2000))
}

// Save HTML
const html = await page.content()
fs.writeFileSync("test-html/beach-detail-debug.html", html)
console.log("Saved HTML:", html.length, "bytes")

// Check for review containers
const reviewCount = await page.evaluate(() => {
  return {
    jftiEf: document.querySelectorAll("div.jftiEf").length,
    wiI7pd: document.querySelectorAll(".wiI7pd").length,
    dataReviewId: document.querySelectorAll("[data-review-id]").length,
  }
})
console.log("Review elements:", reviewCount)

// Also check what the panel contains
const panelText = await page.evaluate(() => {
  const panel = document.querySelector('div[role="main"]')
  return panel?.textContent?.slice(0, 500)
})
console.log("Panel text:", panelText?.slice(0, 300))

await cleanupBrowser(browser)
process.exit(0)

if (!result.success) {
  console.error("Error:", result.error)
  process.exit(1)
}

for (const biz of result.data.businesses) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(biz.storeName)
  console.log(`Rating: ${biz.stars || "N/A"} (${biz.numberOfReviews || 0} reviews)`)
  console.log("Has reviews field:", "reviews" in biz, "| Length:", biz.reviews?.length)

  if (biz.reviews && biz.reviews.length > 0) {
    console.log("\nReviews:")
    for (const r of biz.reviews) {
      console.log(`  * ${r.author} (${r.rating || "?"} stars) - ${r.time}`)
      if (r.text) {
        const preview = r.text.length > 150 ? `${r.text.slice(0, 150)}...` : r.text
        console.log(`    "${preview}"`)
      }
    }
  }
}
