---
name: Typed API (alrighty)
description: Migrate API routes to use handleBody/alrighty typed API pattern. Type-safe request parsing and response validation.
---

# Typed API Migration Guide (handleBody + alrighty)

You are migrating an API route to use the typed API system. This replaces manual `req.json()` + Zod validation with schema-driven, type-safe request/response handling.

## The System

| File | Purpose |
|------|---------|
| `apps/web/lib/api/schemas.ts` | Schema registry — single source of truth for req/res shapes |
| `apps/web/lib/api/server.ts` | Server helpers: `handleBody`, `alrighty`, `fail` |
| `apps/web/lib/api/api-client.ts` | Client helpers: `postty`, `getty`, `putty`, `patchy`, `delly` |

## Step-by-Step Migration

### Step 1: Define schema in `schemas.ts`

Add your endpoint to the `apiSchemas` object:

```typescript
"my-endpoint": {
  req: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
  }).brand<"MyEndpointRequest">(),
  res: z.object({
    ok: z.literal(true),
    data: z.string(),
  }),
},
```

**Rules:**
- `req` schema MUST have `.brand<"NameRequest">()` — this prevents passing unvalidated data
- `res` schema defines the success shape only — errors bypass `alrighty`
- If the endpoint already has a Zod schema elsewhere (e.g., `guards.ts`), either import it or inline it here. Schemas.ts is the canonical source.

### Step 2: Update the route handler

**Before (manual):**
```typescript
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const result = mySchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const { name, email } = result.data
  // ... business logic ...
  return NextResponse.json({ ok: true, data: "done" })
}
```

**After (typed):**
```typescript
import { handleBody, isHandleBodyError, alrighty } from "@/lib/api/server"

export async function POST(request: NextRequest) {
  const parsed = await handleBody("my-endpoint", request)
  if (isHandleBodyError(parsed)) return parsed

  const { name, email } = parsed
  // ... business logic ...
  return alrighty("my-endpoint", { ok: true, data: "done" })
}
```

### Step 3: Handle errors

**For domain-specific errors** (auth, quota, not found), keep using `structuredErrorResponse` or return `NextResponse.json` directly — these bypass `alrighty`:

```typescript
if (!user) {
  return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
}
```

**For schema-based error responses**, use `fail()`:
```typescript
return fail("my-endpoint", "Something went wrong", { code: "MY_ERROR", status: 400 })
```

Note: `fail()` validates against the `res` schema, so it only works if your res schema accepts the `{ success: false, error: {...} }` shape.

### Step 4: Update the client (if applicable)

If the client currently uses raw `fetch`, migrate to `postty`:

```typescript
import { postty, validateRequest } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"

const validated = validateRequest("my-endpoint", { name: "test" })
const result = await postty("my-endpoint", validated)
```

### Step 5: Set cookies on response (if needed)

`alrighty()` returns a `NextResponse`, so you can set cookies on it:

```typescript
const res = alrighty("my-endpoint", { ok: true, data: "done" })
res.cookies.set("session", token, { httpOnly: true, secure: true })
return res
```

## Checklist

- [ ] Schema added to `apiSchemas` in `schemas.ts` with `.brand<>()` on req
- [ ] Route uses `handleBody` + `isHandleBodyError` for request parsing
- [ ] Route uses `alrighty` for success response
- [ ] No `as` casts or `any` types in the route
- [ ] Old validation imports removed (e.g., `validateXxxRequest` from guards)
- [ ] Type check passes: `bun run type-check`

## Key Patterns

**`handleBody` handles:**
- JSON parsing (catches `SyntaxError`)
- Content-Type detection (JSON, FormData)
- Schema validation with proper error messages
- Returns `Req<E>` (branded) on success, `NextResponse` on error

**`alrighty` handles:**
- Response schema validation (catches shape mismatches before sending)
- Returns `NextResponse` with validated JSON body

**`isHandleBodyError` type guard:**
- Distinguishes between parsed data and error response
- Use immediately after `handleBody` for early return

## Common Pitfalls

1. **Don't import server-only modules in schemas.ts** — schemas are used client-side too
2. **Don't forget `.brand<>()`** — without it, raw objects pass type checks
3. **Don't use `alrighty` for error responses** — only success shapes go through it
4. **Don't remove `structuredErrorResponse`** — it handles domain errors that aren't schema violations
