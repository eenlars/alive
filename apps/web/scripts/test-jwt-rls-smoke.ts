#!/usr/bin/env bun
/**
 * JWT + RLS smoke test for the single Supabase database.
 *
 * What this verifies:
 * 1. JWT-backed RLS enforces org isolation in Postgres (read/write checks).
 * 2. Over-scoped JWT claims do NOT bypass DB membership checks.
 * 3. Key app routes honor the JWT cookie and return org-scoped data.
 *
 * Usage:
 *   bun scripts/test-jwt-rls-smoke.ts
 *   bun scripts/test-jwt-rls-smoke.ts --db-only
 *   bun scripts/test-jwt-rls-smoke.ts --db-only --check-admin-writes
 *   bun scripts/test-jwt-rls-smoke.ts --base-url http://localhost:8998
 *   bun scripts/test-jwt-rls-smoke.ts --keep-data
 */

import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { COOKIE_NAMES, type OrgRole } from "@webalive/shared"
import { hash as hashPassword } from "bcrypt"
import { config as loadDotenv } from "dotenv"

const DEFAULT_BASE_URL = "http://localhost:8997"
const DEFAULT_SCOPES = ["workspace:access", "workspace:list", "org:read"] as const
const TEST_USER_PASSWORD = "rls-smoke-password-123"

type SessionOrgRole = OrgRole

interface CliOptions {
  baseUrl: string
  dbOnly: boolean
  checkAdminWrites: boolean
  keepData: boolean
}

interface SupabaseConfig {
  url: string
  anonKey: string
  serviceKey: string
}

interface SmokeState {
  runId: string
  userIds: string[]
  orgIds: string[]
  domainIds: string[]
}

interface Fixture {
  user1Id: string
  user2Id: string
  user1Email: string
  org1Id: string
  org2Id: string
  domain1Id: string
  domain2Id: string
  domain1Hostname: string
  domain2Hostname: string
  memberToken: string
  ownerToken: string
  overScopedToken: string
}

type CreateSessionTokenInput = {
  userId: string
  email: string
  name: string | null
  scopes: string[]
  orgIds: string[]
  orgRoles: Record<string, SessionOrgRole>
}

type CreateSessionToken = (input: CreateSessionTokenInput) => Promise<string>

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  let baseUrl = DEFAULT_BASE_URL

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--base-url") {
      const value = argv[i + 1]
      assertCondition(value && !value.startsWith("--"), "--base-url requires a value")
      baseUrl = value
      i += 1
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    dbOnly: argv.includes("--db-only"),
    checkAdminWrites: argv.includes("--check-admin-writes"),
    keepData: argv.includes("--keep-data"),
  }
}

function loadEnvFiles() {
  const cwd = process.cwd()
  const explicitEnvFile = process.env.ENV_FILE
  const files = [
    explicitEnvFile ? resolve(cwd, explicitEnvFile) : null,
    explicitEnvFile ? resolve(cwd, "..", "..", explicitEnvFile) : null,
    resolve(cwd, ".env.local"),
    resolve(cwd, ".env"),
    resolve(cwd, "..", "..", ".env.local"),
    resolve(cwd, "..", "..", ".env"),
  ].filter((value): value is string => typeof value === "string")

  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file)) continue
    seen.add(file)
    loadDotenv({ path: file, override: false, quiet: true })
  }
}

function readEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim() !== "") {
      return value
    }
  }
  throw new Error(`Missing required environment variable(s): ${names.join(" or ")}`)
}

function ensureJwtSigningEnv() {
  const algorithm = process.env.JWT_ALGORITHM
  if (algorithm === "ES256") {
    assertCondition(
      process.env.JWT_ES256_PRIVATE_KEY,
      "JWT_ALGORITHM=ES256 requires JWT_ES256_PRIVATE_KEY for smoke token generation",
    )
    return
  }

  assertCondition(process.env.JWT_SECRET, "JWT_SECRET is required for HS256 smoke token generation")
}

let createSessionTokenFn: CreateSessionToken | null = null

async function getCreateSessionToken(): Promise<CreateSessionToken> {
  if (!createSessionTokenFn) {
    // The env package validates many variables by default; this script only needs JWT config.
    process.env.SKIP_ENV_VALIDATION ??= "1"
    const mod = await import("../features/auth/lib/jwt")
    createSessionTokenFn = mod.createSessionToken as CreateSessionToken
  }

  return createSessionTokenFn
}

function createServiceClients(config: SupabaseConfig) {
  const iam = createClient(config.url, config.serviceKey, {
    db: { schema: "iam" },
  })
  const app = createClient(config.url, config.serviceKey, {
    db: { schema: "app" },
  })
  return { iam, app }
}

function createRlsClients(config: SupabaseConfig, token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const iam = createClient(config.url, config.anonKey, {
    db: { schema: "iam" },
    global: { headers },
  })
  const app = createClient(config.url, config.anonKey, {
    db: { schema: "app" },
    global: { headers },
  })
  return { iam, app }
}

function toRecord(value: unknown, context: string): Record<string, unknown> {
  assertCondition(typeof value === "object" && value !== null, `${context}: expected JSON object`)
  return value as Record<string, unknown>
}

function toArray(value: unknown, context: string): unknown[] {
  assertCondition(Array.isArray(value), `${context}: expected JSON array`)
  return value
}

async function step(name: string, fn: () => Promise<void>) {
  const start = Date.now()
  await fn()
  console.log(`[PASS] ${name} (${Date.now() - start}ms)`)
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetchWithTimeout(url, init)
  const text = await response.text()

  let body: unknown = null
  if (text !== "") {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
  }

  return {
    status: response.status,
    body,
    headers: response.headers,
  }
}

function makeCookie(token: string): string {
  return `${COOKIE_NAMES.SESSION}=${token}`
}

function describeBody(body: unknown): string {
  if (body === null || body === undefined) {
    return "empty body"
  }
  if (typeof body === "string") {
    return body
  }
  try {
    return JSON.stringify(body)
  } catch {
    return String(body)
  }
}

function randomHostname(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}.alive.local`
}

async function createFixture(config: SupabaseConfig, state: SmokeState): Promise<Fixture> {
  const createSessionToken = await getCreateSessionToken()
  const { iam, app } = createServiceClients(config)

  const runSuffix = randomUUID().slice(0, 8)
  const passwordHash = await hashPassword(TEST_USER_PASSWORD, 10)
  const orgOneName = `RLS Smoke Org One ${runSuffix}`
  const orgTwoName = `RLS Smoke Org Two ${runSuffix}`
  const user1Email = `rls-smoke-u1-${runSuffix}@alive.local`
  const user2Email = `rls-smoke-u2-${runSuffix}@alive.local`
  const domain1Hostname = randomHostname(`rls-u1-${runSuffix}`)
  const domain2Hostname = randomHostname(`rls-u2-${runSuffix}`)

  const { data: orgRows, error: orgError } = await iam
    .from("orgs")
    .insert([
      {
        name: orgOneName,
        credits: 100,
        is_test_env: true,
        test_run_id: state.runId,
      },
      {
        name: orgTwoName,
        credits: 100,
        is_test_env: true,
        test_run_id: state.runId,
      },
    ])
    .select("org_id, name")

  assertCondition(!orgError, `Failed to create orgs: ${orgError?.message}`)
  assertCondition(orgRows && orgRows.length === 2, "Expected 2 inserted orgs")

  const org1 = orgRows.find(org => org.name === orgOneName)
  const org2 = orgRows.find(org => org.name === orgTwoName)
  assertCondition(org1?.org_id, "Could not resolve org 1")
  assertCondition(org2?.org_id, "Could not resolve org 2")

  state.orgIds.push(org1.org_id, org2.org_id)

  const { data: userRows, error: userError } = await iam
    .from("users")
    .insert([
      {
        email: user1Email,
        password_hash: passwordHash,
        display_name: "RLS Smoke User 1",
        status: "active",
        is_test_env: true,
        test_run_id: state.runId,
      },
      {
        email: user2Email,
        password_hash: passwordHash,
        display_name: "RLS Smoke User 2",
        status: "active",
        is_test_env: true,
        test_run_id: state.runId,
      },
    ])
    .select("user_id, email")

  assertCondition(!userError, `Failed to create users: ${userError?.message}`)
  assertCondition(userRows && userRows.length === 2, "Expected 2 inserted users")

  const user1 = userRows.find(user => user.email === user1Email)
  const user2 = userRows.find(user => user.email === user2Email)
  assertCondition(user1?.user_id, "Could not resolve user 1")
  assertCondition(user2?.user_id, "Could not resolve user 2")

  state.userIds.push(user1.user_id, user2.user_id)

  const { error: membershipError } = await iam.from("org_memberships").insert([
    {
      org_id: org1.org_id,
      user_id: user1.user_id,
      role: "member",
    },
    {
      org_id: org2.org_id,
      user_id: user2.user_id,
      role: "owner",
    },
  ])

  assertCondition(!membershipError, `Failed to create org memberships: ${membershipError?.message}`)

  const now = Date.now()
  const { data: domainRows, error: domainError } = await app
    .from("domains")
    .insert([
      {
        hostname: domain1Hostname,
        port: 35_000 + (now % 1_000),
        org_id: org1.org_id,
        is_test_env: true,
        test_run_id: state.runId,
      },
      {
        hostname: domain2Hostname,
        port: 36_000 + (now % 1_000),
        org_id: org2.org_id,
        is_test_env: true,
        test_run_id: state.runId,
      },
    ])
    .select("domain_id, hostname")

  assertCondition(!domainError, `Failed to create domains: ${domainError?.message}`)
  assertCondition(domainRows && domainRows.length === 2, "Expected 2 inserted domains")

  const domain1 = domainRows.find(domain => domain.hostname === domain1Hostname)
  const domain2 = domainRows.find(domain => domain.hostname === domain2Hostname)
  assertCondition(domain1?.domain_id, "Could not resolve domain 1")
  assertCondition(domain2?.domain_id, "Could not resolve domain 2")

  state.domainIds.push(domain1.domain_id, domain2.domain_id)

  const memberToken = await createSessionToken({
    userId: user1.user_id,
    email: user1Email,
    name: "RLS Smoke User 1",
    scopes: [...DEFAULT_SCOPES],
    orgIds: [org1.org_id],
    orgRoles: { [org1.org_id]: "member" },
  })

  const ownerToken = await createSessionToken({
    userId: user2.user_id,
    email: user2Email,
    name: "RLS Smoke User 2",
    scopes: [...DEFAULT_SCOPES],
    orgIds: [org2.org_id],
    orgRoles: { [org2.org_id]: "owner" },
  })

  // Intentionally over-scoped JWT for user1 to ensure DB membership remains source of truth.
  const overScopedToken = await createSessionToken({
    userId: user1.user_id,
    email: user1Email,
    name: "RLS Smoke User 1",
    scopes: [...DEFAULT_SCOPES],
    orgIds: [org1.org_id, org2.org_id],
    orgRoles: { [org1.org_id]: "member", [org2.org_id]: "owner" },
  })

  return {
    user1Id: user1.user_id,
    user2Id: user2.user_id,
    user1Email,
    org1Id: org1.org_id,
    org2Id: org2.org_id,
    domain1Id: domain1.domain_id,
    domain2Id: domain2.domain_id,
    domain1Hostname,
    domain2Hostname,
    memberToken,
    ownerToken,
    overScopedToken,
  }
}

async function runDbChecks(config: SupabaseConfig, fixture: Fixture, options: CliOptions) {
  const member = createRlsClients(config, fixture.memberToken)
  const owner = createRlsClients(config, fixture.ownerToken)
  const overScoped = createRlsClients(config, fixture.overScopedToken)
  const unauth = createRlsClients(config)
  const service = createServiceClients(config)

  await step("member sees only own org_membership row", async () => {
    const { data, error } = await member.iam
      .from("org_memberships")
      .select("org_id, user_id")
      .eq("user_id", fixture.user1Id)

    assertCondition(!error, `Query failed: ${error?.message}`)
    assertCondition((data ?? []).length === 1, `Expected 1 membership row, got ${(data ?? []).length}`)
    assertCondition(data?.[0]?.org_id === fixture.org1Id, "Membership org mismatch for user1")
  })

  await step("member cannot read another user's membership row", async () => {
    const { data, error } = await member.iam
      .from("org_memberships")
      .select("org_id, user_id")
      .eq("user_id", fixture.user2Id)

    assertCondition(!error, `Query failed: ${error?.message}`)
    assertCondition((data ?? []).length === 0, "Expected 0 rows for cross-user membership read")
  })

  await step("member sees only own org domain", async () => {
    const { data, error } = await member.app.from("domains").select("domain_id, hostname").order("hostname")
    assertCondition(!error, `Query failed: ${error?.message}`)
    assertCondition((data ?? []).length === 1, `Expected 1 domain, got ${(data ?? []).length}`)
    assertCondition(data?.[0]?.domain_id === fixture.domain1Id, "Member received wrong domain")
  })

  await step("member cannot read other org domain", async () => {
    const { data, error } = await member.app.from("domains").select("domain_id").eq("domain_id", fixture.domain2Id)
    assertCondition(!error, `Query failed: ${error?.message}`)
    assertCondition((data ?? []).length === 0, "Expected 0 rows for cross-org domain read")
  })

  await step("member cannot update domain (write denied)", async () => {
    const blockedHostname = randomHostname("blocked-update")
    const { data, error } = await member.app
      .from("domains")
      .update({ hostname: blockedHostname })
      .eq("domain_id", fixture.domain1Id)
      .select("domain_id, hostname")

    assertCondition((data ?? []).length === 0, `Expected 0 updated rows, got ${(data ?? []).length}`)
    if (error) {
      // Optional: some PostgREST configs return an RLS error instead of zero-row update.
      assertCondition(
        typeof error.message === "string" && error.message.length > 0,
        "Unexpected empty error for blocked member update",
      )
    }

    const { data: persisted, error: persistedError } = await service.app
      .from("domains")
      .select("hostname")
      .eq("domain_id", fixture.domain1Id)
      .single()

    assertCondition(!persistedError, `Service verification failed: ${persistedError?.message}`)
    assertCondition(
      persisted?.hostname === fixture.domain1Hostname,
      "Domain hostname changed despite member write denial",
    )
  })

  if (options.checkAdminWrites) {
    await step("owner can update own org domain", async () => {
      const nextHostname = randomHostname("owner-update")
      const { data, error } = await owner.app
        .from("domains")
        .update({ hostname: nextHostname })
        .eq("domain_id", fixture.domain2Id)
        .select("domain_id, hostname")

      assertCondition(!error, `Owner update failed: ${error?.message}`)
      assertCondition(
        (data ?? []).length === 1,
        `Expected owner update 1 row, got ${(data ?? []).length}. Admin writes appear blocked; inspect iam.is_org_admin() and related RLS policies.`,
      )
      assertCondition(data?.[0]?.hostname === nextHostname, "Owner update returned unexpected hostname")
    })
  } else {
    console.log("[INFO] Skipping admin write check (enable with --check-admin-writes)")
  }

  await step("over-scoped JWT claims cannot bypass DB membership", async () => {
    const { data, error } = await overScoped.app.from("domains").select("domain_id").eq("domain_id", fixture.domain2Id)
    assertCondition(!error, `Query failed: ${error?.message}`)
    assertCondition((data ?? []).length === 0, "Over-scoped token should not read org2 domain for user1")
  })

  await step("unauthenticated anon client sees no fixture domains", async () => {
    const { data, error } = await unauth.app
      .from("domains")
      .select("domain_id")
      .in("domain_id", [fixture.domain1Id, fixture.domain2Id])

    if (error) {
      const deniedByGrant = /permission denied/i.test(error.message)
      assertCondition(deniedByGrant, `Unexpected unauthenticated query error: ${error.message}`)
      return
    }

    assertCondition((data ?? []).length === 0, "Expected unauthenticated query to return 0 rows")
  })
}

async function loginAndGetSessionToken(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  const responseText = await response.text()
  let body: unknown = null
  if (responseText) {
    try {
      body = JSON.parse(responseText) as unknown
    } catch {
      body = responseText
    }
  }

  assertCondition(
    response.ok,
    `Login failed (${response.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`,
  )

  const setCookie = response.headers.get("set-cookie") ?? ""
  const match = setCookie.match(new RegExp(`${COOKIE_NAMES.SESSION}=([^;]+)`))
  assertCondition(match?.[1], `Could not parse ${COOKIE_NAMES.SESSION} from login response`)

  return match[1]
}

async function runApiChecks(baseUrl: string, fixture: Fixture) {
  const sessionToken = await loginAndGetSessionToken(baseUrl, fixture.user1Email, TEST_USER_PASSWORD)
  const sessionCookie = makeCookie(sessionToken)

  await step("organizations API returns only member org", async () => {
    const res = await fetchJson(`${baseUrl}/api/auth/organizations`, {
      headers: {
        Cookie: sessionCookie,
      },
    })

    const organizationsHint =
      res.status === 500
        ? " Hint: JWT signing config likely mismatched between app and Supabase (JWT_SECRET/JWT_ALGORITHM)."
        : ""
    assertCondition(
      res.status === 200,
      `Expected 200 from /api/auth/organizations, got ${res.status}:${organizationsHint} ${describeBody(res.body)}`,
    )

    const body = toRecord(res.body, "/api/auth/organizations")
    const organizations = toArray(body.organizations, "organizations")
    assertCondition(organizations.length === 1, `Expected 1 organization, got ${organizations.length}`)

    const firstOrg = toRecord(organizations[0], "organizations[0]")
    assertCondition(firstOrg.org_id === fixture.org1Id, "organizations API leaked or returned wrong org")
    assertCondition(body.current_user_id === fixture.user1Id, "organizations API returned wrong current_user_id")
  })

  await step("sites API returns only member domain", async () => {
    const res = await fetchJson(`${baseUrl}/api/sites`, {
      headers: {
        Cookie: sessionCookie,
      },
    })

    assertCondition(res.status === 200, `Expected 200 from /api/sites, got ${res.status}: ${describeBody(res.body)}`)
    const body = toRecord(res.body, "/api/sites")
    const sites = toArray(body.sites, "sites")
    assertCondition(sites.length === 1, `Expected 1 site, got ${sites.length}`)

    const firstSite = toRecord(sites[0], "sites[0]")
    assertCondition(firstSite.id === fixture.domain1Id, "sites API returned wrong domain_id")
    assertCondition(firstSite.org_id === fixture.org1Id, "sites API returned wrong org_id")
  })

  await step("sites API blocks explicit foreign org filter", async () => {
    const res = await fetchJson(`${baseUrl}/api/sites?org_id=${encodeURIComponent(fixture.org2Id)}`, {
      headers: {
        Cookie: sessionCookie,
      },
    })
    assertCondition(
      res.status === 403,
      `Expected 403 from /api/sites?org_id=foreign, got ${res.status}: ${describeBody(res.body)}`,
    )
  })

  await step("preview-guard accepts valid JWT session", async () => {
    const res = await fetchJson(`${baseUrl}/api/auth/preview-guard`, {
      headers: {
        Cookie: sessionCookie,
      },
    })
    assertCondition(
      res.status === 200,
      `Expected 200 from /api/auth/preview-guard with session, got ${res.status}: ${describeBody(res.body)}`,
    )
  })

  await step("preview-guard rejects missing auth", async () => {
    const res = await fetchJson(`${baseUrl}/api/auth/preview-guard`)
    assertCondition(
      res.status === 401,
      `Expected 401 from /api/auth/preview-guard without auth, got ${res.status}: ${describeBody(res.body)}`,
    )
  })

  await step("legacy/non-JWT cookie is rejected and cleared", async () => {
    const res = await fetchJson(`${baseUrl}/api/auth/organizations`, {
      headers: {
        Cookie: `${COOKIE_NAMES.SESSION}=legacy-session-value`,
      },
    })

    assertCondition(res.status === 401, `Expected 401 for legacy cookie, got ${res.status}: ${describeBody(res.body)}`)

    const setCookie = res.headers.get("set-cookie") ?? ""
    assertCondition(
      setCookie.includes(`${COOKIE_NAMES.SESSION}=`) && setCookie.toLowerCase().includes("expires="),
      "Expected stale session cookie to be cleared in Set-Cookie response",
    )
  })
}

async function cleanupFixture(config: SupabaseConfig, state: SmokeState) {
  const { iam, app } = createServiceClients(config)

  if (state.domainIds.length > 0) {
    const { error } = await app.from("domains").delete().in("domain_id", state.domainIds)
    if (error) {
      console.error(`[WARN] Domain cleanup failed: ${error.message}`)
    }
  }

  if (state.userIds.length > 0) {
    const { error } = await iam.from("org_memberships").delete().in("user_id", state.userIds)
    if (error) {
      console.error(`[WARN] Membership cleanup failed: ${error.message}`)
    }
  }

  if (state.orgIds.length > 0) {
    const { error } = await iam.from("orgs").delete().in("org_id", state.orgIds)
    if (error) {
      console.error(`[WARN] Org cleanup failed: ${error.message}`)
    }
  }

  if (state.userIds.length > 0) {
    const { error } = await iam.from("users").delete().in("user_id", state.userIds)
    if (error) {
      console.error(`[WARN] User cleanup failed: ${error.message}`)
    }
  }
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2))
  loadEnvFiles()
  ensureJwtSigningEnv()

  const config: SupabaseConfig = {
    url: readEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]),
    anonKey: readEnv(["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
    serviceKey: readEnv(["SUPABASE_SERVICE_ROLE_KEY"]),
  }

  const state: SmokeState = {
    runId: `RLS_SMOKE_${Date.now()}_${randomUUID().slice(0, 8)}`,
    userIds: [],
    orgIds: [],
    domainIds: [],
  }

  console.log("JWT + RLS smoke test starting")
  console.log(`run_id=${state.runId}`)
  console.log(`db_url=${config.url}`)
  console.log(`api_mode=${options.dbOnly ? "disabled (--db-only)" : `enabled (${options.baseUrl})`}`)
  console.log(`admin_write_checks=${options.checkAdminWrites ? "enabled" : "disabled"}`)

  try {
    const fixture = await createFixture(config, state)
    await runDbChecks(config, fixture, options)

    if (!options.dbOnly) {
      await runApiChecks(options.baseUrl, fixture)
    }
  } finally {
    if (options.keepData) {
      console.log(`[INFO] --keep-data enabled, fixture retained (test_run_id=${state.runId})`)
    } else {
      await cleanupFixture(config, state)
    }
  }

  console.log("JWT + RLS smoke test passed")
}

main().catch(error => {
  console.error("JWT + RLS smoke test failed")
  console.error(error)
  process.exit(1)
})
