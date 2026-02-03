/**
 * Search Google Maps Tool
 *
 * MCP tool definition for searching Google Maps.
 * Simplified interface - good defaults, no confusing options.
 */

import { z } from "zod"
import { searchGoogleMaps } from "../scraper/main.js"

export const searchGoogleMapsSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Search query for Google Maps (e.g., 'restaurants in Itacaré Brazil', 'coffee shops Amsterdam')"),
  maxResults: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe("Number of results (1-20, default: 5). Use 5-10 for quick lookups, up to 20 for comprehensive lists."),
})

export type SearchGoogleMapsInput = z.infer<typeof searchGoogleMapsSchema>

export const searchGoogleMapsTool = {
  name: "search_google_maps",
  description: `Search Google Maps for businesses - restaurants, shops, services, etc.

Returns: name, address, phone, website, rating, category.

LIMITATIONS:
- Review counts often unavailable for smaller/newer businesses (Google doesn't always display them)
- For detailed reviews, recommend users check TripAdvisor or Google Maps directly

TIPS:
- Be specific: "sushi restaurant Amsterdam Centrum" > "sushi Amsterdam"
- Include location: city, neighborhood, or landmark
- Takes 15-45 seconds (fetches detail pages for each result)

CANNOT FILTER BY:
- Menu items (coffee, yoghurt, specific dishes)
- Amenities (indoor seating, wifi, parking)
- Price range or opening hours
- User preferences or dietary requirements

For these filters, search by business type + location only, then check results manually.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (e.g., 'Italian restaurants near Central Station Amsterdam')",
      },
      maxResults: {
        type: "number",
        description: "Number of results (1-20, default: 5)",
        default: 5,
      },
    },
    required: ["query"],
  },
}

export async function executeSearchGoogleMaps(
  params: SearchGoogleMapsInput,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { query, maxResults = 5 } = params

  try {
    const result = await searchGoogleMaps(
      {
        mode: "auto",
        query,
        resultCount: maxResults,
        includeDetails: true, // Fetch detail pages for full info (address, phone, website)
      },
      {
        concurrency: 3,
      },
    )

    if (!result.success) {
      // Make error messages user-friendly
      const errorMsg = result.error
      if (errorMsg.includes("timed out")) {
        return {
          content: [
            {
              type: "text",
              text: `Search timed out. Google Maps took too long to respond. Try:
- A more specific query
- Fewer results
- Try again in a moment`,
            },
          ],
          isError: true,
        }
      }
      if (errorMsg.includes("Navigation failed")) {
        return {
          content: [
            {
              type: "text",
              text: "Could not reach Google Maps. This might be a temporary issue - please try again.",
            },
          ],
          isError: true,
        }
      }
      return {
        content: [{ type: "text", text: `Search failed: ${errorMsg}` }],
        isError: true,
      }
    }

    if (result.data.businesses.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for "${query}". Try a different search term or location.`,
          },
        ],
      }
    }

    // Format results cleanly
    const formattedResults = result.data.businesses.map((biz, i) => {
      const lines = [`${i + 1}. **${biz.storeName || "Unknown Business"}**`]

      if (biz.category) lines.push(`   ${biz.category}`)
      if (biz.stars) lines.push(`   ⭐ ${biz.stars} (${biz.numberOfReviews ?? 0} reviews)`)
      if (biz.address) lines.push(`   📍 ${biz.address}`)
      if (biz.phone) lines.push(`   📞 ${biz.phone}`)
      if (biz.bizWebsite) lines.push(`   🌐 ${biz.bizWebsite}`)

      return lines.join("\n")
    })

    return {
      content: [
        {
          type: "text",
          text: `Found ${result.data.businesses.length} result(s) for "${query}":\n\n${formattedResults.join("\n\n")}`,
        },
      ],
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)

    // Timeout errors
    if (errorMsg.includes("timed out")) {
      return {
        content: [
          {
            type: "text",
            text: "Search timed out after 45 seconds. Google Maps was too slow. Please try a more specific query or fewer results.",
          },
        ],
        isError: true,
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `Search failed: ${errorMsg}`,
        },
      ],
      isError: true,
    }
  }
}
