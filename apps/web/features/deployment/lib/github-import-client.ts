const FALLBACK_SLUG = "github-site"
const SLUG_MIN_LENGTH = 3
const SLUG_MAX_LENGTH = 20

function sanitizeSlugCandidate(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeSlugLength(slug: string): string {
  let candidate = slug

  if (!candidate) {
    candidate = FALLBACK_SLUG
  }

  if (candidate.length < SLUG_MIN_LENGTH) {
    candidate = sanitizeSlugCandidate(`${candidate}-site`)
  }

  if (candidate.length > SLUG_MAX_LENGTH) {
    candidate = candidate.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "")
  }

  if (!candidate || candidate.length < SLUG_MIN_LENGTH) {
    return FALLBACK_SLUG
  }

  return candidate
}

export function extractGithubRepoName(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const sshMatch = trimmed.match(/^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/)
  if (sshMatch) {
    return sshMatch[2] ?? null
  }

  const shorthandMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/)
  if (shorthandMatch && !trimmed.startsWith("github.com/")) {
    return shorthandMatch[2] ?? null
  }

  const urlCandidate = trimmed.startsWith("github.com/") ? `https://${trimmed}` : trimmed

  if (!urlCandidate.startsWith("https://")) {
    return null
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(urlCandidate)
  } catch {
    return null
  }

  if (parsedUrl.hostname.toLowerCase() !== "github.com") {
    return null
  }

  const parts = parsedUrl.pathname
    .split("/")
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length < 2) {
    return null
  }

  const repoName = parts[1] ?? null
  return repoName?.replace(/\.git$/i, "") ?? null
}

export function isSupportedGithubRepoInput(input: string): boolean {
  return extractGithubRepoName(input) !== null
}

export function deriveGithubImportSlug(input: string): string {
  const repoName = extractGithubRepoName(input)
  const sanitized = sanitizeSlugCandidate(repoName ?? "")
  return normalizeSlugLength(sanitized)
}

export function buildGithubSlugAttempt(baseSlug: string, attempt: number): string {
  const normalizedBase = normalizeSlugLength(sanitizeSlugCandidate(baseSlug))
  if (attempt <= 1) {
    return normalizedBase
  }

  const suffix = `-${attempt}`
  const maxBaseLength = Math.max(1, SLUG_MAX_LENGTH - suffix.length)
  const trimmedBase = normalizedBase.slice(0, maxBaseLength).replace(/-+$/g, "") || "site"
  const candidate = `${trimmedBase}${suffix}`

  return candidate.length > SLUG_MAX_LENGTH ? candidate.slice(0, SLUG_MAX_LENGTH) : candidate
}
