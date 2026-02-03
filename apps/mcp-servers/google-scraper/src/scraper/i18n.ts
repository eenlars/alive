/**
 * Internationalization data for Google Maps scraping.
 * Single source of truth for all language-specific patterns.
 */

// Language definitions with all translatable terms
const LANGS = {
  en: {
    reviews: "Reviews",
    stars: "stars",
    photo: "Photo of",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    time: ["month", "week", "day", "year", "hour", "minute"],
    ago: "ago",
  },
  de: {
    reviews: "Rezensionen",
    stars: "Sterne",
    photo: "Foto von",
    days: ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"],
    time: ["Monat", "Woche", "Tag", "Jahr", "Stunde", "Minute"],
    ago: "vor",
  },
  es: {
    reviews: "Reseñas",
    stars: "estrellas",
    photo: "Foto de",
    days: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    time: ["mes", "semana", "día", "año", "hora", "minuto"],
    ago: "hace",
  },
  pt: {
    reviews: "Avaliações",
    stars: "estrelas",
    photo: "Foto de",
    days: ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"],
    time: ["mês", "semana", "dia", "ano", "hora", "minuto"],
    ago: "atrás",
  },
  fr: {
    reviews: "Avis",
    stars: "étoiles",
    photo: "Photo de",
    days: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    time: ["mois", "semaine", "jour", "an", "heure", "minute"],
    ago: "il y a",
  },
  it: {
    reviews: "Recensioni",
    stars: "stelle",
    photo: "Foto di",
    days: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    time: ["mese", "settimana", "giorno", "anno", "ora", "minuto"],
    ago: "fa",
  },
  nl: {
    reviews: "Beoordelingen",
    stars: "sterren",
    photo: "Foto van",
    days: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
    time: ["maand", "week", "dag", "jaar", "uur", "minuut"],
    ago: "geleden",
  },
  ru: {
    reviews: "Отзывы",
    stars: "звёзд",
    photo: "Фото",
    days: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"],
    time: ["месяц", "неделя", "день", "год", "час", "минута"],
    ago: "назад",
  },
  zh: {
    reviews: "评论",
    stars: "星",
    photo: "照片",
    days: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    time: ["月", "周", "天", "年", "小时", "分钟"],
    ago: "前",
  },
  ja: {
    reviews: "レビュー",
    stars: "つ星",
    photo: "写真",
    days: ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"],
    time: ["か月", "週間", "日", "年", "時間", "分"],
    ago: "前",
  },
} as const

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

// Build derived patterns from LANGS
export const REVIEW_TAB_SELECTORS = [
  ...Object.values(LANGS).map(l => `button[aria-label*="${l.reviews}"]`),
  'button[data-tab-index="1"]', // Fallback
]

export const PHOTO_PREFIXES = Object.values(LANGS).map(l => l.photo)

// Stars patterns for all languages (e.g., "stars", "Sterne", "estrellas")
const STARS_PATTERNS = Object.values(LANGS).map(l => l.stars)

// Reviews patterns for all languages
const REVIEWS_PATTERNS = Object.values(LANGS).map(l => l.reviews)

/**
 * Parse rating text like "4.5 stars 123 Reviews" or "4,9 Sterne 456 Rezensionen"
 * Returns { stars: string | null, numberOfReviews: number | null }
 */
export function parseRatingText(ratingText: string | undefined): {
  stars: string | null
  numberOfReviews: number | null
} {
  if (!ratingText) {
    return { stars: null, numberOfReviews: null }
  }

  // Find which "stars" word is in the text
  let starsWord: string | null = null
  for (const pattern of STARS_PATTERNS) {
    if (ratingText.toLowerCase().includes(pattern.toLowerCase())) {
      starsWord = pattern
      break
    }
  }

  // Find which "reviews" word is in the text
  let reviewsWord: string | null = null
  for (const pattern of REVIEWS_PATTERNS) {
    if (ratingText.toLowerCase().includes(pattern.toLowerCase())) {
      reviewsWord = pattern
      break
    }
  }

  let stars: string | null = null
  let numberOfReviews: number | null = null

  if (starsWord) {
    // Split by the stars word (case-insensitive)
    const starsRegex = new RegExp(starsWord, "i")
    const parts = ratingText.split(starsRegex)
    if (parts[0]) {
      // Extract rating number (handles both "4.5" and "4,5")
      const ratingMatch = parts[0].match(/[\d,.]+/)
      if (ratingMatch) {
        stars = ratingMatch[0].replace(",", ".")
      }
    }
    if (parts[1] && reviewsWord) {
      // Extract review count from the part after stars
      const reviewsRegex = new RegExp(reviewsWord, "i")
      const afterStars = parts[1].split(reviewsRegex)[0]
      const reviewMatch = afterStars?.match(/[\d.,\s]+/)
      if (reviewMatch) {
        // Remove spaces and dots used as thousand separators, keep only digits
        const cleanNum = reviewMatch[0].replace(/[\s.]/g, "").replace(",", "")
        const parsed = parseInt(cleanNum, 10)
        if (!Number.isNaN(parsed)) {
          numberOfReviews = parsed
        }
      }
    }
  }

  return { stars, numberOfReviews }
}

const TIME_UNITS = Object.values(LANGS).flatMap(l => l.time)
const AGO_PATTERNS = Object.values(LANGS).map(l => l.ago)

// Regex for relative time detection
const timeUnitsPattern = TIME_UNITS.join("|")
const agoPattern = AGO_PATTERNS.map(a => (a.includes(" ") ? `^${a}\\s+` : `${a}$`)).join("|")
export const RELATIVE_TIME_REGEX = new RegExp(`\\d+\\s*(${timeUnitsPattern})|${agoPattern}`, "i")

// Day name to key mapping (built from LANGS)
export const DAY_MAP: Record<string, DayKey> = Object.values(LANGS).reduce(
  (acc, lang) => {
    lang.days.forEach((day, i) => {
      acc[day.toLowerCase()] = DAY_KEYS[i]
    })
    return acc
  },
  {} as Record<string, DayKey>,
)

// Helpers
export const isRelativeTime = (text: string) => RELATIVE_TIME_REGEX.test(text)

export function extractAuthorFromLabel(label: string): string {
  for (const prefix of PHOTO_PREFIXES) {
    if (label.toLowerCase().startsWith(prefix.toLowerCase())) {
      return label
        .slice(prefix.length)
        .replace(/^[:\s]+/, "")
        .trim()
    }
  }
  return label
}

// Debug helper - log what languages are configured
export function debugI18n() {
  console.log("Configured languages:", Object.keys(LANGS).join(", "))
  console.log("Review tab selectors:", REVIEW_TAB_SELECTORS.length)
  console.log("Time units:", TIME_UNITS.length)
  console.log("Day mappings:", Object.keys(DAY_MAP).length)
}
