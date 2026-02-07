# @alive-brug/alrighty

Type-safe API client with Zod validation. Define schemas once, get validated requests and responses everywhere.

## Quick Start

```typescript
// schemas.ts
import { createClient, type SchemaRegistry } from "@alive-brug/alrighty"
import { z } from "zod"

const apiSchemas = {
  user: {
    res: z.object({ id: z.string(), email: z.string() })
  },
  login: {
    req: z.object({ email: z.string().email(), password: z.string() }),
    res: z.object({ ok: z.boolean(), userId: z.string().optional() }),
  },
} as const satisfies SchemaRegistry

export const api = createClient(apiSchemas)
```

```typescript
// anywhere.ts
import { api } from "./schemas"

const user = await api.getty("user")           // GET /api/user
const result = await api.postty("login", {     // POST /api/login
  email: "test@example.com",
  password: "secret"
})
```

That's it. Requests and responses are validated automatically.

## With Type Exports (Recommended)

For larger apps, export convenience types:

```typescript
// schemas.ts
import {
  createClient,
  type SchemaRegistry,
  type Endpoint as GenericEndpoint,
  type Req as GenericReq,
  type Res as GenericRes,
} from "@alive-brug/alrighty"
import { z } from "zod"

export const apiSchemas = {
  user: { res: z.object({ id: z.string(), email: z.string() }) },
  login: {
    req: z.object({ email: z.string().email(), password: z.string() }),
    res: z.object({ ok: z.boolean() }),
  },
} as const satisfies SchemaRegistry

export const api = createClient(apiSchemas)

// Convenience types - bind schemas once, use everywhere
export type Endpoint = GenericEndpoint<typeof apiSchemas>
export type Req<E extends Endpoint> = GenericReq<typeof apiSchemas, E>
export type Res<E extends Endpoint> = GenericRes<typeof apiSchemas, E>
```

```typescript
// Now you can use short types anywhere
import type { Req, Res } from "./schemas"

type LoginBody = Req<"login">     // { email: string, password: string }
type LoginResult = Res<"login">   // { ok: boolean }
```

## API Methods

| Method | HTTP | Body Required |
|--------|------|---------------|
| `getty(endpoint)` | GET | No |
| `postty(endpoint, body)` | POST | Yes |
| `putty(endpoint, body)` | PUT | Yes |
| `patchy(endpoint, body)` | PATCH | Yes |
| `deletty(endpoint)` | DELETE | No |

All methods accept an optional `init` parameter for extra fetch options.

## Options

```typescript
const api = createClient(schemas, {
  basePath: "/api",           // Default: "/api"
  credentials: "include",     // Default: "include"
  headers: {                  // Default headers for all requests
    Authorization: `Bearer ${token}`
  }
})
```

## Error Handling

```typescript
import { ApiError } from "@alive-brug/alrighty"

try {
  await api.getty("user")
} catch (e) {
  if (e instanceof ApiError) {
    e.status          // HTTP status code
    e.code            // Error code string
    e.message         // Error message
    e.details         // Additional error details

    // Helpers
    e.isUnauthorized  // status === 401
    e.isForbidden     // status === 403
    e.isNotFound      // status === 404
    e.isRateLimited   // status === 429
    e.isServerError   // status >= 500
    e.isClientError   // status >= 400 && < 500
    e.isNetworkError  // Network failure
    e.isValidationError // Zod validation failed
  }
}
```

## Schema Rules

- `res` is **required** - every endpoint needs a response schema
- `req` is **optional** - omit for GET/DELETE endpoints
- Endpoints without `req` can only use `getty` or `deletty` (TypeScript enforced)
