export async function checkSlugAvailability(slug: string): Promise<{ available: boolean | null; error?: string }> {
  try {
    const res = await fetch(`/api/sites/check-availability?slug=${encodeURIComponent(slug.toLowerCase())}`)

    if (!res.ok) {
      console.error("[checkSlugAvailability] API returned non-OK status:", res.status)
      return { available: null, error: "Failed to check availability" }
    }

    const data = await res.json()
    return { available: data.available }
  } catch (error) {
    console.error("[checkSlugAvailability] Request failed:", error)
    return { available: null, error: "Network error" }
  }
}
