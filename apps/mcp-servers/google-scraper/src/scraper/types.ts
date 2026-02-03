/**
 * A single user review from Google Maps.
 */
export type GoogleMapsReview = {
  author: string
  rating: number | null
  text: string
  time: string
}

/**
 * Google Maps Business Type
 *
 * Represents a business scraped from Google Maps search results.
 */
export type GoogleMapsBusiness = {
  placeId?: string
  address?: string
  category?: string
  status?: string
  phone?: string
  googleUrl?: string
  bizWebsite?: string
  storeName?: string
  ratingText?: string
  stars: string | null
  numberOfReviews: number | null
  mainImage?: string
  hours: {
    monday?: string
    tuesday?: string
    wednesday?: string
    thursday?: string
    friday?: string
    saturday?: string
    sunday?: string
  } | null
  reviews?: GoogleMapsReview[]
}

export type GoogleMapsResult = {
  businesses: GoogleMapsBusiness[]
  html: string
}

export type SearchMode = "auto" | "multiple" | "single"

export type InputAuto = {
  mode?: "auto"
  query: string
  resultCount: number
  includeDetails?: boolean
}

export type InputMultiple = {
  mode: "multiple"
  query: string
  resultCount: number
  includeDetails?: boolean
}

export type InputUrl = {
  mode: "url"
  url: string
}

export type SearchInput = InputAuto | InputMultiple | InputUrl

export type GoogleMapsOptions = {
  enableLogging?: boolean
  onlyIncludeWithWebsite?: string
  concurrency?: number
  includeReviews?: boolean
  maxReviews?: number
  /** Overall timeout for the search operation in milliseconds (default: 45000) */
  timeoutMs?: number
}

export type ProxyConfig = {
  ip: string
  port: number
  username: string
  password: string
}
