# Architectural Design Document

## Multi‑Instance OAuth, Lockbox Hardening & Dynamic Integration Visibility

---

## 1. Executive Summary

We're doing three things at once:

1. **Killing the global OAuth singleton**
   So that OAuth becomes an explicit, injectable dependency and we can safely run multiple configs (providers, tenants, environments, tests) in a single process.

2. **Making lockbox instance‑aware and race‑proof**
   By adding an `instance_id` dimension and a partial unique index so `is_current` can never cross-contaminate between different OAuth configs or test workers.

3. **Introducing a DB‑driven "Integrations Registry & Policy Engine"**
   So that integrations like Linear are visible or hidden based on database state, not hardcoded lists or redeploys, and we can scale to 100+ providers with rich visibility rules.

This design is intended to be **long‑lived**: it works across all four environments (`local`, `dev`, `staging`, `prod`) and integrates cleanly with your existing E2E run/worker isolation system.

---

## 2. Problem Statement

### 2.1 Code‑level: Global OAuth singleton anti‑pattern

Current pattern (simplified):

```ts
import { oauth } from '@webalive/oauth-core';

class SomeService {
  async handleAuth() {
    const token = await oauth.refreshTokens('linear', 'user123');
  }
}
```

Why this is bad:

* **Hidden dependency**
  The service *looks* self-contained but secretly depends on a global `oauth` instance. You can't tell what it needs by looking at its constructor.

* **Hard to test**
  All tests share one global instance. One test changes configuration or state, other tests mysteriously fail. You can't spin up an alternate `OAuthManager` for a test case without hacking globals.

* **No real isolation or parallelism**
  When multiple test workers or subsystems run in parallel, they all hit the same singleton. Token rotation, cache invalidation, or config changes in one place affect everyone else.

* **No clean multi‑config support**
  You can't have `linear-prod` and `linear-sandbox` or per-tenant OAuth configs in the same process without gnarly conditionals, flags, or implicit global switches.

* **Tight coupling**
  Every caller is tied to the concrete singleton from `@webalive/oauth-core`. Swapping the implementation out later is expensive and invasive.

In short: the singleton turns OAuth into **global shared state** instead of a **normal dependency** that can be passed, configured, replaced, and isolated.

---

### 2.2 Data‑level: No instance dimension & `is_current` collisions

Today's `lockbox.user_secrets` has logical keys like:

* `user_id`
* `namespace`
* `name`
* `version`
* `is_current`

But **no field that says which OAuth config/instance created the secret**. Typical rotation logic is:

> "Insert new row with `is_current = true` and bump `version`. Mark older rows for this user+namespace+name as `is_current = false`."

If two different OAuth configs share `(user_id, namespace, name)` (e.g., two Linear apps, or prod vs sandbox, or two test workers), a sloppy `UPDATE` can demote the other config's "current" token. This is especially dangerous in:

* Parallel E2E runs
* Multi‑tenant scenarios
* Multi‑env or multi‑provider setups in one process

Also, there's no DB‑level guarantee that **only one current secret** exists for a given logical key. An app bug or race condition could easily create multiple `is_current = true` rows.

---

### 2.3 Multi‑tenant, multi‑env & E2E isolation constraints

You already have:

* **Four deployment environments**: `local`, `dev`, `staging`, `prod`.
* **E2E isolation** with:

  * A per‑run `runId` (e.g., `E2E_2025-11-21T10:30:00Z`).
  * One tenant (org + domain + user) per Playwright worker:

    * `e2e-w0@alive.local`, `e2e-w1@alive.local`, ...
  * `test_run_id` on core tables (`iam.users`, `iam.orgs`, `app.domains`).
  * Cleanup that deletes all rows with this `test_run_id`, relying on FKs and cascade.

This is already very good.

But OAuth secrets in lockbox need to behave consistently with this:

* Multiple workers and multiple runs must not interfere.
* Secrets must be deleted automatically when their test users are cleaned up.
* Future multi‑tenant / multi‑config scenarios should not require schema rethinks.

---

### 2.4 Integration visibility: from "hardcoded menu" to policy engine

Right now:

* OAuth integrations are **hardcoded**.
* All authenticated users see the same integrations.
* You need an immediate rule: **Linear is visible only to `admin@example.com`**, while everyone else should not even see it.

Long‑term:

* You want to support **100+ providers** (GitHub, Slack, Stripe, etc.).
* Some should be **public**, some **admin-only**, some **beta/private**, some per‑user.
* Adding/changing these rules should **not require a deploy**.

Constraints:

* Secrets must stay in `lockbox.*`.
* Visibility checks must be fast (no decrypting 100 secrets just to build the Settings page).
* Existing connections must keep working ("grandfathering").

---

## 3. Target Architecture Overview

At a high level:

1. **OAuthManager becomes multi‑instance and explicit**

   * No global singleton.
   * Code receives an `OAuthManager` instance via DI.
   * Each instance is identified by an `instance_id` and bound to a specific `environment`, `namespace`, and provider.

2. **Lockbox becomes instance‑aware & race‑proof**

   * `lockbox.user_secrets` and `lockbox.secret_keys` gain an `instance_id` column.
   * DB enforces at most **one `is_current = true`** row per `(user_id, instance_id, namespace, name)` via a partial unique index.
   * Rotation must always be scoped by `instance_id`.

3. **Integrations Registry & Policy Engine**

   * New `integrations` schema with:

     * `integrations.providers` (the "menu" of apps).
     * `integrations.access_policies` (who may see/use each provider).
   * A server-side function `integrations.get_available_integrations(user_id)`:

     * Enforces global kill switch (`is_active`).
     * Enforces visibility rules (`visibility_level`, access policies).
     * Honors "grandfathering" if the user already has a connection in lockbox.

4. **Clean env & E2E story**

   * Each environment (`local/dev/staging/prod`) runs the same design.
   * Instance IDs are deterministic in normal operation and encode:

     * Provider
     * Environment
     * Tenant/workspace (if needed)
   * In E2E, we derive instance IDs that incorporate `runId` and worker index for belt‑and‑suspenders isolation, even though workers already have distinct users/tenants.

---

## 4. Database Schema Changes (Migrations)

### 4.1 `lockbox.user_secrets`: add `instance_id`, `expires_at`, and safety indexes

**Goal**: Partition secrets by OAuth instance and guarantee **exactly one current secret per (user, instance, namespace, name)**.

```sql
BEGIN;

-- 1) Add instance_id and expires_at
ALTER TABLE lockbox.user_secrets
  ADD COLUMN IF NOT EXISTS instance_id text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz NULL;

-- 2) Drop old indexes that don't know about instance_id
DROP INDEX IF EXISTS lockbox.user_secrets_user_ns_name_ver_idx;
DROP INDEX IF EXISTS lockbox.idx_user_secrets_lookup_user;

-- 3) Unique index per version history for a given user+instance+namespace+name
CREATE UNIQUE INDEX IF NOT EXISTS user_secrets_instance_version_idx
ON lockbox.user_secrets (user_id, instance_id, namespace, name, version DESC);

-- 4) CRITICAL: ensure at most one current secret per user+instance+namespace+name
CREATE UNIQUE INDEX IF NOT EXISTS user_secrets_one_current_per_instance_idx
ON lockbox.user_secrets (user_id, instance_id, namespace, name)
WHERE is_current = true;

-- 5) TTL / cleanup index for optional sweeper jobs
CREATE INDEX IF NOT EXISTS idx_user_secrets_expires_at
ON lockbox.user_secrets (expires_at)
WHERE expires_at IS NOT NULL;

COMMIT;
```

Notes:

* Existing rows get `instance_id = 'default'`. New code will set a meaningful `instance_id`.
* The partial unique index is the enforcement mechanism that protects against sloppy or buggy rotation logic.

---

### 4.2 `lockbox.secret_keys`: add `instance_id`, relax `environment`

**Goal**: Align secret keys with instance awareness and support real environments (`local/dev/staging/prod/test` etc.) without re-migrating every time.

```sql
BEGIN;

-- 1) Add instance_id to mirror user_secrets
ALTER TABLE lockbox.secret_keys
  ADD COLUMN IF NOT EXISTS instance_id text NOT NULL DEFAULT 'default';

-- 2) Relax environment constraint: just require non-empty
ALTER TABLE lockbox.secret_keys
  DROP CONSTRAINT IF EXISTS secret_keys_environment_check;

ALTER TABLE lockbox.secret_keys
  ADD CONSTRAINT secret_keys_env_len_check
  CHECK (char_length(environment) > 0);

-- 3) Helpful index for lookups by user + instance
CREATE INDEX IF NOT EXISTS secret_keys_user_instance_idx
ON lockbox.secret_keys (user_id, instance_id);

COMMIT;
```

Application code is responsible for using a well-defined set of environment strings like `'local'`, `'dev'`, `'staging'`, `'prod'`, `'test'`.

---

### 4.3 New `integrations` schema: registry & access policies

**Goal**: Move integration metadata & visibility rules into the DB.

```sql
BEGIN;

-- A. Schema
CREATE SCHEMA IF NOT EXISTS integrations;

-- 1. Provider definitions (the registry/menu)
CREATE TABLE IF NOT EXISTS integrations.providers (
  provider_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key    text NOT NULL UNIQUE,      -- e.g., 'linear', 'github'
  display_name    text NOT NULL,

  -- Global controls
  is_active       boolean NOT NULL DEFAULT true,           -- global kill switch
  visibility_level text NOT NULL DEFAULT 'admin_only',     -- 'public', 'admin_only', 'beta', etc.

  -- Non-sensitive metadata
  logo_path       text,
  default_scopes  jsonb DEFAULT '[]'::jsonb,

  created_at      timestamptz DEFAULT now()
);

-- 2. Per-user access policies (VIP list)
CREATE TABLE IF NOT EXISTS integrations.access_policies (
  policy_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  user_id     text NOT NULL,  -- references iam.users(user_id)

  created_at  timestamptz DEFAULT now(),

  CONSTRAINT access_policies_provider_fk FOREIGN KEY (provider_id)
    REFERENCES integrations.providers(provider_id) ON DELETE CASCADE,

  CONSTRAINT access_policies_user_fk FOREIGN KEY (user_id)
    REFERENCES iam.users(user_id) ON DELETE CASCADE,

  UNIQUE (provider_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_providers_visibility
  ON integrations.providers (is_active, visibility_level);

CREATE INDEX IF NOT EXISTS idx_policies_lookup
  ON integrations.access_policies (user_id, provider_id);

COMMIT;
```

This schema:

* Drives the Settings UI ("which integrations exist?").
* Drives access control ("who can see/click which integrations?").
* Is decoupled from where tokens are stored (`lockbox.*`).

---

### 4.4 RPC / function: `integrations.get_available_integrations`

**Goal**: Return the list of visible integrations for a given user, including "is_connected" and honoring:

* Global kill switch.
* Visibility level.
* Explicit per-user access policies.
* Grandfathering (if the user already has a connection stored in lockbox).

```sql
CREATE OR REPLACE FUNCTION integrations.get_available_integrations(p_user_id text)
RETURNS TABLE (
  provider_key      text,
  display_name      text,
  logo_path         text,
  is_connected      boolean,
  visibility_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  SELECT
    op.provider_key,
    op.display_name,
    op.logo_path,
    -- "Grandfathering": any current connection for this provider
    EXISTS (
      SELECT 1
      FROM lockbox.user_secrets us
      WHERE us.user_id   = p_user_id
        AND us.namespace = 'oauth_connections'
        AND us.name      = op.provider_key
        AND us.is_current = true
    ) AS is_connected,
    op.visibility_level AS visibility_status
  FROM integrations.providers op
  WHERE
    -- Master kill switch: provider must be globally active
    op.is_active = true
    AND (
      -- Public providers
      op.visibility_level = 'public'
      OR
      -- Explicit policy grant
      EXISTS (
        SELECT 1
        FROM integrations.access_policies oap
        WHERE oap.provider_id = op.provider_id
          AND oap.user_id     = p_user_id
      )
      OR
      -- Grandfathered: user already has a current connection stored
      EXISTS (
        SELECT 1
        FROM lockbox.user_secrets us
        WHERE us.user_id   = p_user_id
          AND us.namespace = 'oauth_connections'
          AND us.name      = op.provider_key
          AND us.is_current = true
      )
    );
END;
$;
```

> Note: For this visibility check we **don't** filter by `instance_id`, on purpose. If the user has *any* current connection to a provider (regardless of instance_id), we treat them as "connected" and let that count for grandfathering.

---

### 4.5 Initial seeding for Linear visibility

**Goal**: Make Linear admin‑only and initially visible only to `admin@example.com`.

```sql
BEGIN;

-- 1. Create the Linear provider
INSERT INTO integrations.providers (provider_key, display_name, visibility_level, is_active)
VALUES ('linear', 'Linear', 'admin_only', true)
ON CONFLICT (provider_key) DO NOTHING;

-- 2. Grant access to the platform owner
INSERT INTO integrations.access_policies (provider_id, user_id)
SELECT p.provider_id, u.user_id
FROM integrations.providers p
JOIN iam.users u ON u.email = 'admin@example.com'
WHERE p.provider_key = 'linear'
ON CONFLICT (provider_id, user_id) DO NOTHING;

COMMIT;
```

---

## 5. Application Logic Changes

### 5.1 OAuthManager: from singleton to explicit, instance‑aware service

Define a config shape roughly like:

```ts
interface OAuthManagerConfig {
  provider: string;            // 'linear', 'github', ...
  instanceId: string;          // maps to lockbox.*.instance_id
  namespace: string;           // e.g. 'oauth_connections'
  environment: string;         // 'local' | 'dev' | 'staging' | 'prod' | 'test'
  defaultTtlSeconds?: number;  // optional, for user_secrets.expires_at
}
```

Then:

* **No more global `oauth` export.**
* Create instances via DI / app wiring:

```ts
// Example: prod Linear instance
const linearProdOAuth = new OAuthManager({
  provider: 'linear',
  instanceId: 'linear:prod',      // deterministic
  namespace: 'oauth_connections',
  environment: 'prod',
  defaultTtlSeconds: undefined    // or token expiry-based
});
```

All lockbox queries **must** use `(user_id, instance_id, namespace, name)`.

---

### 5.2 Secret rotation with `is_current` safety

When rotating a secret:

1. Insert the new row:

```sql
INSERT INTO lockbox.user_secrets (
  user_id,
  instance_id,
  namespace,
  name,
  version,
  ciphertext,
  iv,
  auth_tag,
  scope,
  is_current,
  expires_at,
  created_by,
  updated_by
)
VALUES ($userId, $instanceId, $namespace, $name, $version,
        $ciphertext, $iv, $authTag, $scopeJson,
        true, $expiresAt, $actor, $actor)
RETURNING user_secret_id;
```

2. Demote older rows **scoped by instance_id**:

```sql
UPDATE lockbox.user_secrets
SET is_current = false, updated_at = now()
WHERE user_id    = $userId
  AND instance_id = $instanceId
  AND namespace  = $namespace
  AND name       = $name
  AND is_current = true
  AND user_secret_id <> $newId;
```

If, for any reason, two rows end up `is_current = true` for the same `(user_id, instance_id, namespace, name)`, the partial unique index `user_secrets_one_current_per_instance_idx` will raise an error, flushing out bugs early.

Getting the current secret is always:

```sql
SELECT *
FROM lockbox.user_secrets
WHERE user_id    = $userId
  AND instance_id = $instanceId
  AND namespace  = $namespace
  AND name       = $name
  AND is_current = true;
```

---

### 5.3 TTL (`expires_at`) semantics

* `expires_at` is optional but lets you:

  * Model provider token expiry.
  * Set short TTLs for test secrets.
* A background job (in non‑local environments) can periodically:

  ```sql
  DELETE FROM lockbox.user_secrets
  WHERE expires_at < now();
  ```

This is not required for correctness (test cleanup already happens via user deletion), but it's nice for hygiene.

---

### 5.4 Integration visibility in the app (Next.js / API)

**Settings UI:**

* Instead of hardcoding providers, call:

  * `rpc('integrations.get_available_integrations', { userId: currentUserId })` (based on your RPC wiring).
* Render based on returned fields:

  * Show the provider if it appears in the result.
  * Display `is_connected` status.
  * Optionally style based on `visibility_status` (public vs admin_only, etc.).

**Guarding connect flows:**

* For `/api/auth/linear` or similar:

  * First call `integrations.get_available_integrations(userId)` server-side.
  * If there is no entry with `provider_key = 'linear'` for this user → **403 Forbidden**.
  * This ensures users can't "guess" or call hidden providers.

**Grandfathering:**

* If you previously had users connected to Linear via lockbox but not in `access_policies`, they'll still see Linear as long as:

  * `is_active = true`, and
  * There's a `user_secrets` row with `namespace = 'oauth_connections'`, `name = 'linear'`, `is_current = true`.

---

## 6. E2E: How this fits into your current run/worker architecture

You already have:

* `runId = "E2E_..."` per test run.
* A unique user & tenant per worker (`e2e-w0@alive.local`, `e2e-w1@alive.local`, ...).
* `test_run_id` on IAM and domains, with FK cascades cleaning everything at teardown.

Now we layer **instance IDs** on top.

A robust pattern:

```ts
function buildInstanceId(provider: string, env: string, runId: string, workerIndex: number) {
  return `${provider}:${env}:${runId}:w${workerIndex}`;
}
```

Then in your E2E setup/fixtures:

```ts
const runId = process.env.E2E_RUN_ID;        // e.g. E2E_2025-11-21T10:30:00Z
const env   = process.env.E2E_ENV || 'dev';  // or 'staging', etc.
const workerIndex = testInfo.workerIndex;    // Playwright's worker index

const oauth = new OAuthManager({
  provider: 'linear',
  instanceId: buildInstanceId('linear', env, runId, workerIndex),
  namespace: 'oauth_connections',
  environment: env,
  defaultTtlSeconds: 600
});
```

Why this is extremely robust:

* Workers already use **different users**, so lockbox rows are separated by `user_id`.
* We add **instance_id** per provider+run+worker as an extra isolation dimension.
* When teardown deletes `iam.users` for that `runId`, FK cascades wipe `user_secrets` and `secret_keys` automatically.
* Even if, in the future, workers share a user (e.g., non-tenant tests), `instance_id` ensures their secrets still don't collide.

---

## 7. Final Action Plan

### 7.1 Database

Run the migrations, in order, on each environment (`local`, then `dev`, `staging`, `prod`):

1. **`lockbox.user_secrets` migration (instance_id + indexes + expires_at).**
2. **`lockbox.secret_keys` migration (instance_id + relaxed environment).**
3. **`integrations` schema creation:**

   * `integrations.providers`
   * `integrations.access_policies`
   * indexes.
4. **Create `integrations.get_available_integrations(p_user_id)` function.**
5. **Seed Linear provider & owner access** via the insert statements for `admin@example.com`.

### 7.2 Application code

1. **Refactor `@webalive/oauth-core`:**

   * Remove the global singleton export.
   * Implement `class OAuthManager` with `OAuthManagerConfig`.
   * Ensure all DB interactions include `instance_id`.

2. **Update all consumers:**

   * Replace `import { oauth }` with injected `OAuthManager` instances.
   * Wire one or more instances at app startup per environment.

3. **Implement safe rotation logic & current-secret fetch** using the new indexes and `instance_id`.

4. **Hook up Next.js settings page** to call `integrations.get_available_integrations(userId)` and render integrations dynamically.

5. **Guard OAuth connect endpoints** so that they only allow providers returned by `get_available_integrations`.

6. **Integrate with E2E:**

   * In global setup, keep using `runId` and per-worker tenants.
   * For each worker/provider, construct a deterministic `instanceId` from `(provider, env, runId, workerIndex)` and use it when creating `OAuthManager`.
   * Optionally set `defaultTtlSeconds` for test secrets.

7. (Optional) **Add a small sweeper job** that periodically deletes `lockbox.user_secrets` where `expires_at < now()` in non‑local envs.

---

If you implement everything above, you get:

* No singleton.
* Clean, testable, multi-instance OAuth.
* Database‑enforced isolation for current tokens.
* A dynamic, DB‑driven integration registry and policy engine.
* E2E that's both hermetic and easy to debug.
* A design that will comfortably handle many providers and many tenants for a long time.
