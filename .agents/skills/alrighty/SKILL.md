---
name: alrighty
description: Migrate API routes to use handleBody/alrighty typed API pattern. Type-safe request parsing and response validation.
---

# alrighty — Typed API Pattern

Type-safe API from schema to client. One schema, both sides validated.

## Architecture

```
schemas.ts          →  Single source of truth (Zod schemas)
  ↓                       ↓
server.ts           →  handleBody() parses req, alrighty() validates res
api-client.ts       →  postty/getty send validated requests, parse responses
```

| File | Purpose |
|------|---------|
| `apps/web/lib/api/schemas.ts` | Schema registry — every endpoint's req + res |
| `apps/web/lib/api/server.ts` | `handleBody`, `alrighty`, `fail` |
| `apps/web/lib/api/api-client.ts` | `postty`, `getty`, `putty`, `patchy`, `delly` |

## Step 1: Define the Schema

Add to `apiSchemas` in `schemas.ts`:

```typescript
"my-endpoint": {
  req: z.object({
    name: z.string().min(1),
    count: z.number().int().positive(),
  }).brand<"MyEndpointRequest">(),
  res: z.object({
    ok: z.literal(true),
    result: z.string(),
  }),
},
```

**Rules:**
- `req` MUST have `.brand<"NameRequest">()` — prevents passing unvalidated data to `postty`
- `res` defines the success shape — errors bypass `alrighty`
- If the Zod schema already exists elsewhere (e.g. `@webalive/shared`), import it:

```typescript
import { AutomationTriggerRequestSchema, AutomationTriggerResponseSchema } from "@webalive/shared"

"internal/automation/trigger": {
  req: AutomationTriggerRequestSchema.brand<"TriggerRequest">(),
  res: AutomationTriggerResponseSchema,
},
```

## Step 2: Server Side (Route Handler)

```typescript
import { handleBody, isHandleBodyError, alrighty } from "@/lib/api/server"

export async function POST(request: NextRequest) {
  // Parse + validate request body against schema
  const parsed = await handleBody("my-endpoint", request)
  if (isHandleBodyError(parsed)) return parsed  // 400 with validation errors

  // `parsed` is fully typed as Req<"my-endpoint">
  const { name, count } = parsed

  // ... business logic ...

  // Validate response against schema before sending
  return alrighty("my-endpoint", { ok: true, result: "done" })
}
```

**What `handleBody` does:**
- Parses JSON body (catches `SyntaxError`)
- Detects Content-Type (JSON, FormData)
- Validates against `apiSchemas[endpoint].req`
- Returns `Req<E>` (branded type) on success, `NextResponse` (400) on error

**What `alrighty` does:**
- Validates payload against `apiSchemas[endpoint].res` at runtime
- Returns `NextResponse` with validated JSON

**Error responses** (auth, not found, domain errors) bypass alrighty:
```typescript
if (!user) return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
```

## Step 3: Client Side (React/Hooks)

```typescript
import { postty } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"
import type { Res } from "@/lib/api/schemas"

// 1. Validate input (REQUIRED — raw objects won't compile)
const validated = validateRequest("my-endpoint", { name: "test", count: 5 })

// 2. Send — response is typed as Res<"my-endpoint">
const data = await postty("my-endpoint", validated)
// data.ok, data.result are fully typed
```

**Available methods:**

| Method | HTTP | Body | Example |
|--------|------|------|---------|
| `getty(endpoint)` | GET | No | `getty("user")` |
| `postty(endpoint, body)` | POST | Yes (validated) | `postty("login", validated)` |
| `putty(endpoint, body)` | PUT | Yes (validated) | `putty("settings", validated)` |
| `patchy(endpoint, body)` | PATCH | Yes (validated) | `patchy("profile", validated)` |
| `delly(endpoint)` | DELETE | No | `delly("session")` |

**Dynamic paths** (when URL differs from schema key):
```typescript
// Schema key is "integrations/connect", but URL is /api/integrations/linear
await postty("integrations/connect", validated, undefined, `/api/integrations/${provider}`)
```

**With TanStack Query:**
```typescript
const query = useQuery<Res<"user">, ApiError>({
  queryKey: ["user"],
  queryFn: () => getty("user"),
})
```

## Type Extraction

```typescript
import type { Req, Res, Endpoint } from "@/lib/api/schemas"

type LoginReq = Req<"login">           // { email: string, password: string }
type LoginRes = Res<"login">           // { ok: boolean, userId?: string, ... }
type AllEndpoints = Endpoint            // union of all endpoint keys
```

## Full Example: Adding a New Endpoint

### 1. Schema (`schemas.ts`)
```typescript
"widgets/create": {
  req: z.object({
    title: z.string().min(1).max(100),
    color: z.enum(["red", "blue", "green"]),
  }).brand<"WidgetCreateRequest">(),
  res: z.object({
    ok: z.literal(true),
    widget: z.object({ id: z.string(), title: z.string(), color: z.string() }),
  }),
},
```

### 2. Route (`app/api/widgets/route.ts`)
```typescript
import { handleBody, isHandleBodyError, alrighty } from "@/lib/api/server"
import { createErrorResponse } from "@/features/auth/lib/auth"

export async function POST(request: NextRequest) {
  const parsed = await handleBody("widgets/create", request)
  if (isHandleBodyError(parsed)) return parsed

  const widget = await db.widgets.create(parsed)
  return alrighty("widgets/create", { ok: true, widget })
}
```

### 3. Client (`components/WidgetForm.tsx`)
```typescript
import { postty } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"

async function createWidget(title: string, color: string) {
  const validated = validateRequest("widgets/create", { title, color })
  const { widget } = await postty("widgets/create", validated)
  return widget // typed: { id: string, title: string, color: string }
}
```

## Checklist

- [ ] Schema in `apiSchemas` with `.brand<>()` on req
- [ ] Route uses `handleBody` + `isHandleBodyError`
- [ ] Route returns `alrighty()` for success
- [ ] Client uses `validateRequest` → `postty`/`getty`
- [ ] No `as` casts, no `any`
- [ ] `bun run type-check` passes

## Common Mistakes

1. **Forgetting `.brand<>()`** — raw objects will pass type checks without it
2. **Using `alrighty` for errors** — only success responses go through it
3. **Importing server modules in schemas.ts** — schemas are shared client+server
4. **Skipping `validateRequest`** — `postty` requires branded types, raw objects won't compile
