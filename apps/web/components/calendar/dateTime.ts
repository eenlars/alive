import type { EventDraft } from "./types"

const HAS_TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/

function tryParse(dateTime: string): Date | null {
  const parsed = new Date(dateTime)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function toDateTimeLocalValue(dateTime: string): string {
  const parsed = tryParse(dateTime)
  if (!parsed) {
    return dateTime.slice(0, 16)
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

export function toApiDateTime(dateTime: string): string {
  if (HAS_TIMEZONE_SUFFIX.test(dateTime)) {
    return dateTime
  }

  const parsed = tryParse(dateTime)
  if (!parsed) {
    return dateTime
  }

  return parsed.toISOString()
}

export function normalizeDraftDateTimesForApi(draft: EventDraft): EventDraft {
  return {
    ...draft,
    start: {
      ...draft.start,
      dateTime: toApiDateTime(draft.start.dateTime),
    },
    end: {
      ...draft.end,
      dateTime: toApiDateTime(draft.end.dateTime),
    },
  }
}
