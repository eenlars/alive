import { beforeAll, describe, expect, it } from "vitest"
import { searchGoogleMaps } from "../src/scraper/main.js"

/**
 * Integration tests for the Google Maps scraper.
 *
 * These tests hit the real Google Maps website to verify the scraper works.
 * They require Chrome to be installed (run `bun run setup` first).
 *
 * Set PUPPETEER_CACHE_DIR if Chrome is in a custom location.
 */

describe("Google Maps Scraper", () => {
  beforeAll(() => {
    // Ensure PUPPETEER_CACHE_DIR is set for CI/custom installs
    if (!process.env.PUPPETEER_CACHE_DIR && !process.env.PUPPETEER_EXECUTABLE_PATH) {
      console.log("Tip: Set PUPPETEER_CACHE_DIR or PUPPETEER_EXECUTABLE_PATH if Chrome is not found")
    }
  })

  describe("searchGoogleMaps", () => {
    it("should find businesses for a valid query", async () => {
      const result = await searchGoogleMaps({
        mode: "auto",
        query: "Starbucks Amsterdam",
        resultCount: 3,
        includeDetails: false,
      })

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.businesses.length).toBeGreaterThan(0)

        const firstBusiness = result.data.businesses[0]
        expect(firstBusiness.storeName).toBeTruthy()
        expect(firstBusiness.storeName?.toLowerCase()).toContain("starbucks")

        console.log("\n=== Search Results ===")
        result.data.businesses.forEach((biz, i) => {
          console.log(`${i + 1}. ${biz.storeName}`)
          console.log(`   Address: ${biz.address || "N/A"}`)
          console.log(`   Phone: ${biz.phone || "N/A"}`)
        })
        console.log("======================\n")
      }
    })

    it("should return store names, not 'Unknown Business'", async () => {
      const result = await searchGoogleMaps({
        mode: "auto",
        query: "Albert Heijn Amsterdam",
        resultCount: 3,
        includeDetails: false,
      })

      expect(result.success).toBe(true)

      if (result.success) {
        const businesses = result.data.businesses

        // Should have results
        expect(businesses.length).toBeGreaterThan(0)

        // None should be "Unknown Business"
        const unknownCount = businesses.filter(b => !b.storeName || b.storeName === "Unknown Business").length

        expect(unknownCount).toBe(0)

        // At least one should contain "Albert Heijn" (case insensitive)
        const hasAlbertHeijn = businesses.some(b => b.storeName?.toLowerCase().includes("albert"))
        expect(hasAlbertHeijn).toBe(true)
      }
    })

    it("should filter by domain when domainFilter is provided", async () => {
      const result = await searchGoogleMaps(
        {
          mode: "auto",
          query: "supermarket Amsterdam",
          resultCount: 10,
          includeDetails: false,
        },
        {
          onlyIncludeWithWebsite: "ah.nl", // Albert Heijn uses ah.nl
        },
      )

      expect(result.success).toBe(true)

      if (result.success && result.data.businesses.length > 0) {
        // All results should have ah.nl website
        result.data.businesses.forEach(biz => {
          if (biz.bizWebsite) {
            expect(biz.bizWebsite.toLowerCase()).toContain("ah.nl")
          }
        })
      }
    })

    it("should handle a query with no results gracefully", async () => {
      const result = await searchGoogleMaps({
        mode: "auto",
        query: "xyznonexistent12345businessplace",
        resultCount: 3,
        includeDetails: false,
      })

      // Should not error
      expect(result.success).toBe(true)

      if (result.success) {
        // May have 0 results, which is fine
        expect(result.data.businesses).toBeDefined()
      }
    })
  })
})
