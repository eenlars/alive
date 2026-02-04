/**
 * Minimal cron expression parser and human-readable description generator
 * Parses standard 5-field cron expressions (minute hour day month weekday)
 */

import type { CronParts } from "./types"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/**
 * Parse a cron expression into its 5 parts
 */
export function parseCronExpression(expression: string): CronParts | null {
  const parts = expression.trim().split(/\s+/)

  if (parts.length !== 5) {
    return null
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  // Basic validation - check if parts contain valid characters
  const validChars = /^[\d,\-*/]+$/
  if (![minute, hour, dayOfMonth, month, dayOfWeek].every(p => validChars.test(p))) {
    return null
  }

  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  }
}

/**
 * Generate a human-readable description of a cron expression
 */
export function describeCron(expression: string): string {
  const parts = parseCronExpression(expression)

  if (!parts) {
    return "Invalid cron expression"
  }

  const { minute, hour, dayOfMonth, month, dayOfWeek } = parts

  try {
    // Handle special cases first
    if (minute === "*/5" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "Every 5 minutes"
    }

    if (minute === "*/10" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "Every 10 minutes"
    }

    if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "Every hour, at minute 0"
    }

    // Build the description piece by piece
    const parts: string[] = []

    // Time part
    if (minute !== "*" && hour !== "*") {
      const h = parseIntOrNull(hour)
      const m = parseIntOrNull(minute)

      if (typeof h === "number" && typeof m === "number" && h >= 0 && h < 24 && m >= 0 && m < 60) {
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
        parts.push(`at ${timeStr}`)
      }
    } else if (hour !== "*") {
      const h = parseIntOrNull(hour)
      if (typeof h === "number" && h >= 0 && h < 24) {
        parts.push(`at ${String(h).padStart(2, "0")}:00`)
      }
    }

    // Weekday part
    if (dayOfWeek !== "*") {
      const days = parseDayOfWeek(dayOfWeek)
      if (days.length > 0) {
        if (days.length === 5 && days.every((_, i) => days[i] === i + 1)) {
          parts.push("on weekdays")
        } else if (days.length === 2 && days[0] === 0 && days[1] === 6) {
          parts.push("on weekends")
        } else {
          const dayNames = days.map(d => WEEKDAYS[d])
          parts.push(`on ${dayNames.join(", ")}`)
        }
      }
    } else if (dayOfMonth !== "*") {
      // Only show month/date if not using weekday
      const dates = parseDayOfMonth(dayOfMonth)
      if (dates.length > 0) {
        if (dates.length === 1 && dates[0] === 1) {
          parts.push("on the 1st of the month")
        } else {
          parts.push(`on day${dates.length > 1 ? "s" : ""} ${dates.join(", ")}`)
        }
      }

      // Month part
      if (month !== "*") {
        const months = parseMonth(month)
        if (months.length > 0 && months.length < 12) {
          const monthNames = months.map(m => MONTHS[m - 1])
          parts.push(`in ${monthNames.join(", ")}`)
        }
      }
    }

    // If we have no meaningful description, return the raw expression
    if (parts.length === 0) {
      return `Cron: ${expression}`
    }

    return parts.join(" ")
  } catch {
    return `Cron: ${expression}`
  }
}

/**
 * Parse day of month field (1-31)
 */
function parseDayOfMonth(field: string): number[] {
  if (field === "*") return []
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10)
    if (Number.isNaN(step)) return []
    const result = []
    for (let i = 1; i <= 31; i += step) result.push(i)
    return result
  }

  const dates: number[] = []
  const parts = field.split(",")

  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(s => parseInt(s, 10))
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let i = start; i <= end && i <= 31; i++) dates.push(i)
      }
    } else {
      const num = parseInt(part, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= 31) dates.push(num)
    }
  }

  return [...new Set(dates)].sort((a, b) => a - b)
}

/**
 * Parse month field (1-12)
 */
function parseMonth(field: string): number[] {
  if (field === "*") return []
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10)
    if (Number.isNaN(step)) return []
    const result = []
    for (let i = 1; i <= 12; i += step) result.push(i)
    return result
  }

  const months: number[] = []
  const parts = field.split(",")

  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(s => parseInt(s, 10))
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let i = start; i <= end && i <= 12; i++) months.push(i)
      }
    } else {
      const num = parseInt(part, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= 12) months.push(num)
    }
  }

  return [...new Set(months)].sort((a, b) => a - b)
}

/**
 * Parse day of week field (0-7, where 0 and 7 are Sunday)
 */
function parseDayOfWeek(field: string): number[] {
  if (field === "*") return []
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10)
    if (Number.isNaN(step)) return []
    const result = []
    for (let i = 0; i <= 6; i += step) result.push(i)
    return result
  }

  const days: number[] = []
  const parts = field.split(",")

  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(s => parseInt(s, 10))
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let i = start; i <= end && i <= 7; i++) {
          const day = i === 7 ? 0 : i
          days.push(day)
        }
      }
    } else {
      const num = parseInt(part, 10)
      if (!Number.isNaN(num)) {
        const day = num === 7 ? 0 : num
        if (day >= 0 && day <= 6) days.push(day)
      }
    }
  }

  return [...new Set(days)].sort((a, b) => a - b)
}

/**
 * Try to parse an integer, return null if invalid
 */
function parseIntOrNull(value: string): number | null {
  const num = parseInt(value, 10)
  return Number.isNaN(num) ? null : num
}
