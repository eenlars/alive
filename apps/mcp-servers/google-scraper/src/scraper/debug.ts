#!/usr/bin/env bun
/**
 * Debug tool for review extraction.
 *
 * Usage:
 *   bun run src/scraper/debug.ts capture "restaurants amsterdam"  # Capture HTML
 *   bun run src/scraper/debug.ts test <html-file>                 # Test extraction
 *   bun run src/scraper/debug.ts explore <html-file>              # Explore selectors
 *   bun run src/scraper/debug.ts i18n                             # Show i18n config
 */

import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as cheerio from "cheerio"
import { setupPage, cleanupBrowser, navigateToGoogleMaps, clickReviewsTabAndWait } from "./utils.js"
import { searchSingleBusiness } from "./extractors/detail.js"
import { debugI18n } from "./i18n.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, "../../test-html")

const [cmd, ...args] = process.argv.slice(2)

switch (cmd) {
  case "capture": {
    const query = args.join(" ") || "restaurants amsterdam"
    await mkdir(OUTPUT_DIR, { recursive: true })
    console.log(`Capturing: ${query}`)

    const { browser, page } = await setupPage()
    try {
      await navigateToGoogleMaps(page, query)
      await new Promise(r => setTimeout(r, 2000))

      // Click first result
      const first = await page.$('a[href*="/maps/place/"]')
      if (first) {
        await first.click()
        await new Promise(r => setTimeout(r, 3000))
      }

      // Load reviews
      const clicked = await clickReviewsTabAndWait(page)
      console.log(clicked ? "Reviews loaded" : "No reviews tab found")

      const html = await page.content()
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      const file = join(OUTPUT_DIR, `${query.slice(0, 30).replace(/\W+/g, "_")}_${ts}.html`)
      await writeFile(file, html)
      console.log(`Saved: ${file} (${(html.length / 1024).toFixed(0)}KB)`)
    } finally {
      await cleanupBrowser(browser)
    }
    break
  }

  case "test": {
    const file = args[0]
    if (!file) {
      console.error("Usage: debug.ts test <html-file>")
      process.exit(1)
    }

    const html = await readFile(file, "utf-8")
    const result = await searchSingleBusiness(html, "https://test.com", { includeReviews: true, maxReviews: 5 })

    if (!result.success) {
      console.error("Error:", result.error)
      process.exit(1)
    }

    const biz = result.data.businesses[0]
    console.log(`Business: ${biz.storeName}`)
    console.log(`Reviews: ${biz.reviews?.length ?? 0}\n`)

    for (const r of biz.reviews ?? []) {
      console.log(`- ${r.author} (${r.rating}★) ${r.time}`)
      console.log(`  ${r.text.slice(0, 100)}${r.text.length > 100 ? "..." : ""}\n`)
    }
    break
  }

  case "explore": {
    const file = args[0]
    if (!file) {
      console.error("Usage: debug.ts explore <html-file>")
      process.exit(1)
    }

    const html = await readFile(file, "utf-8")
    const $ = cheerio.load(html)

    console.log("=== Selector Counts ===")
    for (const sel of ["div.jftiEf", "[data-review-id]", ".wiI7pd", ".d4r55", ".rsqaWe"]) {
      console.log(`${sel}: ${$(sel).length}`)
    }

    console.log("\n=== Sample Reviews ===")
    $("div.jftiEf")
      .slice(0, 2)
      .each((i, el) => {
        const $r = $(el)
        console.log(`\n[${i + 1}] ${$r.find(".d4r55").text().trim() || "?"} - ${$r.find(".rsqaWe").text().trim()}`)
        console.log(`    ${$r.find(".wiI7pd").text().trim().slice(0, 80)}...`)
      })

    console.log("\n=== Stable Patterns ===")
    console.log(`data-review-id: ${$("[data-review-id]").length}`)
    console.log(`contributor links: ${$('a[href*="/contrib/"]').length}`)
    console.log(`star labels: ${$('[role="img"][aria-label]').length}`)
    break
  }

  case "i18n":
    debugI18n()
    break

  case "feed": {
    // Debug feed extraction to see what aria-labels look like
    const query = args.join(" ") || "burger restaurant Itacare Brazil"
    console.log(`Debugging feed for: ${query}\n`)

    const { browser, page } = await setupPage()
    try {
      await navigateToGoogleMaps(page, query)
      await new Promise(r => setTimeout(r, 3000))

      // Get aria-labels from feed
      const data = await page.evaluate(() => {
        const results: Array<{
          name: string
          ariaLabels: string[]
          ratingSpanText: string
          visibleTexts: string[]
          fullCardText: string
        }> = []

        const cards = document.querySelectorAll('a[href*="/maps/place/"]')
        cards.forEach((card, i) => {
          if (i >= 5) return
          const parent = card.parentElement
          if (!parent) return

          // Get name
          const nameEl = parent.querySelector(".fontHeadlineSmall")
          const name = nameEl?.textContent || "Unknown"

          // Get all aria-labels
          const ariaLabels: string[] = []
          parent.querySelectorAll("[aria-label]").forEach(el => {
            const label = el.getAttribute("aria-label")
            if (label) ariaLabels.push(label)
          })

          // Get the specific span used in extraction
          const ratingSpan = parent.querySelector("span.fontBodyMedium > span")
          const ratingSpanText = ratingSpan?.getAttribute("aria-label") || "(not found)"

          // Get visible text that might contain review count
          const visibleTexts: string[] = []
          parent.querySelectorAll("span").forEach(span => {
            const text = span.textContent?.trim()
            if (text?.match(/\(\d+\)|\d+\s*(review|rezension|avalia)/i)) {
              visibleTexts.push(text)
            }
          })

          // Full card text (abbreviated)
          const fullCardText = parent.textContent?.replace(/\s+/g, " ").trim().slice(0, 200) || ""

          results.push({ name, ariaLabels, ratingSpanText, visibleTexts, fullCardText })
        })

        return results
      })

      console.log("=== Feed Debug Results ===\n")
      for (const d of data) {
        console.log(`Name: ${d.name}`)
        console.log(`Rating span aria-label: "${d.ratingSpanText}"`)
        console.log(`Visible texts with numbers: ${d.visibleTexts.length ? d.visibleTexts.join(", ") : "(none)"}`)
        console.log(`Full card text: "${d.fullCardText}"`)
        console.log()
      }

      // Also dump raw HTML of first card for analysis
      const rawHtml = await page.evaluate(() => {
        const card = document.querySelector('a[href*="/maps/place/"]')?.parentElement
        return card?.outerHTML || "not found"
      })
      console.log("\n=== RAW HTML of first card ===\n")
      console.log(rawHtml.slice(0, 3000))
    } finally {
      await cleanupBrowser(browser)
    }
    break
  }

  default:
    console.log(`
Debug tool for Google Maps review extraction

Commands:
  capture <query>    Capture HTML from Google Maps
  test <file>        Test review extraction on HTML file
  explore <file>     Explore HTML structure for selectors
  i18n               Show configured languages
`)
}
