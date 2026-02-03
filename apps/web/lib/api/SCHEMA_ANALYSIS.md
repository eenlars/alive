# Schema & Zod Typing System: Deep Analysis

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ schemas.ts - Single Source of Truth                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ const apiSchemas = {                                        │ │
│ │   login: { req: ZodObject, res: ZodObject }                │ │
│ │   user: { req: ZodNever, res: ZodObject }                  │ │
│ │ } as const                                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Exports: apiSchemas + Type utilities (Endpoint, Req, Res)      │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           ├────────────────────┬───────────────┤
           ▼                    ▼               ▼
    ┌─────────────┐     ┌──────────────┐  ┌────────────┐
    │ api.types.ts│     │ api-client.ts│  │ server.ts  │
    │             │     │              │  │            │
    │ Re-exports  │────▶│ Client fetch │  │ Server     │
    │ types with  │     │ (getty,      │  │ validation │
    │ different   │     │  postty)     │  │ (handleBody│
    │ impl        │     │              │  │  alrighty) │
    └─────────────┘     └──────────────┘  └────────────┘
```

---

## Critical Flaws Found

### 🔴 FLAW #1: Duplicate Type Definitions

**Location**: Both `schemas.ts` and `api.types.ts` define `Endpoint`, `Req`, and `Res`

**schemas.ts (lines 111-113):**
```typescript
export type Endpoint = keyof typeof apiSchemas
export type Req<E extends Endpoint> = z.infer<(typeof apiSchemas)[E]["req"]>
export type Res<E extends Endpoint> = z.infer<(typeof apiSchemas)[E]["res"]>
```

**api.types.ts (lines 4-15):**
```typescript
export type ApiSchemas = typeof apiSchemas
export type Endpoint = keyof ApiSchemas
export type Req<E extends Endpoint> = ApiSchemas[E] extends { req: infer R }
  ? R extends z.ZodTypeAny ? z.infer<R> : never
  : never
export type Res<E extends Endpoint> = ApiSchemas[E] extends { res: infer R }
  ? R extends z.ZodTypeAny ? z.infer<R> : never
  : never
```

**Impact**:
1. **Code duplication**: Same logic, different implementations
2. **Import confusion**: Which file should consumers import from?
3. **Maintenance burden**: Changes must be synchronized across both files
4. **Fragility**: Types could silently diverge if one is updated

**Current Usage**:
- `api-client.ts` imports from `api.types.ts` (line 5)
- `server.ts` imports from `schemas.ts` (line 3)
- **Inconsistency**: Different parts of the codebase use different sources

**Why Two Approaches?**:
- **Simple approach** (`schemas.ts`): Direct indexed access
  - `(typeof apiSchemas)[E]["req"]` → Shorter, more readable
  - Assumes structure is always `{ req, res }`

- **Defensive approach** (`api.types.ts`): Conditional type with guards
  - `ApiSchemas[E] extends { req: infer R }` → Type-safe extraction
  - Handles missing properties gracefully (returns `never`)
  - Extra check: `R extends z.ZodTypeAny` ensures it's a Zod schema

**Practical Difference**:
In current implementation, both approaches are **functionally equivalent** because all endpoints have both `req` and `res` properties. However, they would diverge if:
- An endpoint omits `req` or `res`
- An endpoint has a non-Zod value for `req` or `res`

---

### 🟡 FLAW #2: `z.never().optional()` Ambiguity

**Location**: `schemas.ts` line 72 (user endpoint)

```typescript
user: {
  req: z.never().optional(), // GET has no body
  res: z.object({ user: ... })
}
```

**The Problem**:
What type does `z.infer<z.never().optional()>` produce?

**TypeScript Resolution**:
```typescript
type UserReq = z.infer<typeof z.never().optional()>
// Resolves to: undefined
```

**Runtime Behavior**:
```typescript
const schema = z.never().optional()
schema.parse(undefined) // ✅ Passes
schema.parse({})        // ❌ Fails: Expected never, received object
schema.parse(null)      // ❌ Fails: Expected never, received null
```

**Impact**:
1. **Client-side**: `Req<"user">` type is `undefined`
   ```typescript
   // This is correct:
   const result = await getty("user")

   // This would fail if we tried to pass a body:
   const result = await postty("user", undefined)
   ```

2. **Server-side**: `handleBody("user", req)` must handle undefined
   - Line 36-38 in `server.ts` handles this:
   ```typescript
   } else if (contentType === "" && (req.method === "GET" || req.method === "DELETE")) {
     raw = undefined  // ✅ Correctly handles no-body requests
   }
   ```

**Better Alternative**:
```typescript
// Option 1: Use z.undefined() explicitly
req: z.undefined()

// Option 2: Use z.void() for no-input schemas
req: z.void()

// Option 3: Don't validate GET requests (skip handleBody)
```

**Why This Matters**:
- `z.never()` semantically means "no valid value exists"
- `.optional()` makes it "no valid value OR undefined"
- This is confusing for developers: "never-but-actually-undefined"

---

### 🟡 FLAW #3: Response Schema Inconsistency

**Location**: All three endpoint response schemas use different shapes

**login endpoint (line 57-64):**
```typescript
res: z.object({
  ok: z.boolean(),
  userId: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  requestId: z.string().optional(),
  details: z.unknown().optional(),
})
```

**user endpoint (line 73-82):**
```typescript
res: z.object({
  user: z.object({
    userId: z.string(),
    email: z.string().email(),
    displayName: z.string().optional(),
    workspaces: z.array(z.string()),
  }).nullable(),
})
```

**feedback endpoint (line 97-103):**
```typescript
res: z.object({
  ok: z.boolean(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
})
```

**The Problem**:
- **No unified error shape**: login/feedback use `{ ok, error, message }`, user doesn't
- **No unified success shape**: Each endpoint has different fields
- **Type discrimination difficulty**: Can't easily discriminate success vs error

**Compare to Defined Envelopes**:
The file defines standard envelopes (lines 10-31) but **doesn't use them**:

```typescript
// Defined but unused:
export const SuccessResponse = <T>(dataSchema: T) => z.object({
  success: z.literal(true),
  data: dataSchema,
})

export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    timestamp: z.string().datetime().optional(),
  }),
})

export const ApiResponse = <T>(dataSchema: T) =>
  z.union([SuccessResponse(dataSchema), ErrorResponse])
```

**Impact**:
1. **Client-side error handling is inconsistent**:
   ```typescript
   // login/feedback:
   if (result.ok) { /* success */ } else { /* error */ }

   // user:
   if (result.user !== null) { /* success */ } else { /* error? */ }
   ```

2. **The helper envelopes are dead code** (defined but never used)

3. **No discriminated union benefits**: TypeScript can't narrow types based on a tag

**Better Approach**:
```typescript
login: {
  req: z.object({ email: z.string().email(), password: z.string() }),
  res: ApiResponse(z.object({ userId: z.string() }))
  // Now res type is:
  // { success: true, data: { userId: string } }
  // | { success: false, error: { code, message, timestamp? } }
}
```

---

### 🟡 FLAW #4: Runtime Validation Mismatch

**Location**: `server.ts` lines 50-53 and `api-client.ts` lines 57-58

**Server validates BOTH request AND response**:
```typescript
// server.ts: handleBody validates REQUEST
const reqSchema = apiSchemas[endpoint]?.req
const result = reqSchema.safeParse(raw)

// server.ts: alrighty validates RESPONSE
const schema = apiSchemas[endpoint].res
const parsed = schema.parse(payload)  // ⚠️ Uses .parse() not .safeParse()
```

**Client validates ONLY response**:
```typescript
// api-client.ts: No request validation, only response
return apiSchemas[endpoint].res.parse(json) as Res<E>
```

**The Problem**:
1. **Request not validated on client**: Developer could send malformed data
   ```typescript
   // TypeScript ALLOWS this (type matches):
   await postty("login", { email: "valid@example.com", password: "test" })

   // TypeScript ALLOWS this too (but it's invalid):
   await postty("login", { email: "invalid-email", password: "" })
   //                              ^^^^^^^^^^^^^^^^ Not a valid email!
   //                                                ^^^^^^^^^ Violates min(1)
   ```
   - TypeScript sees `{ email: string, password: string }` ✅
   - But Zod would reject at runtime ❌

2. **Response validation crashes on failure** (`alrighty` uses `.parse()`):
   ```typescript
   // If payload doesn't match schema:
   const parsed = schema.parse(payload) // 🔥 THROWS ZodError
   ```
   - Server crashes instead of returning error response
   - No graceful error handling

**Impact**:
- **Development**: Developer gets cryptic Zod errors instead of type errors
- **Production**: Invalid server responses crash the server process
- **Security**: No client-side pre-validation means more invalid requests hit server

**Better Approach**:
```typescript
// Client: Validate request BEFORE sending
export const postty = <E extends Endpoint>(endpoint: E, body: Req<E>, ...) => {
  const reqSchema = apiSchemas[endpoint].req
  const validatedBody = reqSchema.parse(body) // Throw if invalid
  return api<E>(endpoint, { ...init, method: "POST", body: validatedBody })
}

// Server: Safe validation with error handling
export function alrighty<E extends Endpoint>(endpoint: E, payload: Res<E>, init?: ResponseInit): NextResponse {
  const schema = apiSchemas[endpoint].res
  const result = schema.safeParse(payload)

  if (!result.success) {
    console.error(`Response validation failed for ${String(endpoint)}:`, result.error)
    // Return error response instead of crashing
    return NextResponse.json({
      error: "Internal validation error"
    }, { status: 500 })
  }

  return NextResponse.json(result.data, init)
}
```

---

### 🟢 FLAW #5: Missing HTTP Method Constraints

**Location**: `api-client.ts` lines 68-92 (getty, postty, putty, delly)

**Current Design**:
```typescript
export const getty = <E extends Endpoint>(...) =>
  api<E>(endpoint, { method: "GET" })

export const postty = <E extends Endpoint>(endpoint: E, body: Req<E>, ...) =>
  api<E>(endpoint, { method: "POST", body })
```

**The Problem**:
Nothing prevents calling the wrong HTTP method for an endpoint:

```typescript
// Type system allows this:
await postty("user", undefined)  // ⚠️ Should be GET, not POST

// And this:
await getty("login")  // ⚠️ Should be POST (with body), not GET
```

**Why It's Not Caught**:
- `Endpoint` type is just `"login" | "user" | "feedback"`
- No association between endpoint and HTTP method
- All methods accept all endpoints

**Better Approach**:
```typescript
// Associate endpoints with methods in schema
export const apiSchemas = {
  login: { method: "POST", req: ..., res: ... },
  user: { method: "GET", req: ..., res: ... },
} as const

// Constrain helpers to only accept matching endpoints
type GetEndpoints = { [K in Endpoint]: typeof apiSchemas[K]["method"] extends "GET" ? K : never }[Endpoint]
type PostEndpoints = { [K in Endpoint]: typeof apiSchemas[K]["method"] extends "POST" ? K : never }[Endpoint]

export const getty = <E extends GetEndpoints>(...) => ...
export const postty = <E extends PostEndpoints>(endpoint: E, body: Req<E>, ...) => ...
```

**Impact**: Medium severity
- Runtime: Server will reject wrong method (404/405)
- Developer experience: Would catch at compile-time instead

---

### 🟢 FLAW #6: Path Override Without Validation

**Location**: `api-client.ts` lines 21-24 and `api.types.ts` line 34

```typescript
// api.types.ts
export type PathOverride = string | undefined

// api-client.ts
async function api<E extends Endpoint>(endpoint: E, init?: ApiInit<E>, pathOverride?: PathOverride) {
  const defaultPath = endpointPath(endpoint)
  const path = pathOverride ?? defaultPath  // ⚠️ Uses override without validation
}
```

**The Problem**:
1. **No type safety**: `PathOverride` is just `string | undefined`
2. **No runtime validation**: Could pass invalid paths
3. **Comment says "DO NOT CHANGE THIS"** but doesn't explain why
4. **Unclear purpose**: When would you override the path?

**Example Misuse**:
```typescript
// Nothing prevents this:
await getty("user", {}, "malicious/path")
await postty("login", { email, password }, "../../../etc/passwd")
```

**Legitimate Use Case** (from api.types.ts line 20):
```typescript
// For dynamic routes, use the pathParams to replace placeholders
// Example: /api/workflow/[wf_id] → /api/workflow/123
```

**Better Approach**:
```typescript
// Option 1: Template literal types (TypeScript 4.1+)
type PathWithParams<P extends string> = P extends `${infer Start}[${infer Param}]${infer Rest}`
  ? `${Start}${string}${PathWithParams<Rest>}`
  : P

// Option 2: Structured path parameters
type PathParams<E extends Endpoint> = E extends "workflow/[wf_id]"
  ? { wf_id: string }
  : never

export const getty = <E extends Endpoint>(
  endpoint: E,
  params?: PathParams<E>,  // Structured, not arbitrary string
  ...
)
```

---

## Type Inference Deep Dive

### How `Req<E>` and `Res<E>` Work

**Step 1: Extract the Zod schema object**
```typescript
type Endpoint = "login" | "user" | "feedback"
type E = "login"

// Index into apiSchemas
(typeof apiSchemas)["login"]
// Result: { req: ZodObject<...>, res: ZodObject<...> }

(typeof apiSchemas)["login"]["req"]
// Result: ZodObject<{ email: ZodString, password: ZodString }>
```

**Step 2: Infer the TypeScript type from Zod schema**
```typescript
type Req<E extends Endpoint> = z.infer<(typeof apiSchemas)[E]["req"]>

// For E = "login":
z.infer<ZodObject<{ email: ZodString, password: ZodString }>>
// Result: { email: string; password: string }
```

**Step 3: Generic type propagation**
```typescript
async function api<E extends Endpoint>(endpoint: E, ...): Promise<Res<E>> {
  // E is bound to literal type, e.g., "login"
  return apiSchemas[endpoint].res.parse(json) as Res<E>
  //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //     Runtime validation produces `unknown`
  //                                          ^^^^^^^^
  //                                          Type assertion for TypeScript
}
```

**Key Insight**:
- **Runtime**: Zod validates and returns `unknown` (must be cast)
- **Compile-time**: TypeScript infers types from schema structure
- **Gap**: Type assertion bridges runtime ↔ compile-time

---

## Runtime vs Compile-Time Type Safety

### Where Type Safety WORKS

✅ **Compile-time**:
```typescript
// TypeScript catches this:
await postty("login", { email: "test", missing: "password" })
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                    Error: Property 'password' is missing
```

✅ **Runtime (response validation)**:
```typescript
// Server returns: { ok: true, userId: 123 }  (number instead of string)
const result = await getty("login")
// 🔥 Throws ApiError: Response validation failed
// Zod error: Expected string, received number
```

### Where Type Safety FAILS

❌ **Compile-time (relaxed constraints)**:
```typescript
// TypeScript DOESN'T catch this:
await postty("login", { email: "not-an-email", password: "" })
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                    Type: { email: string, password: string } ✅
//                    But violates: .email() and .min(1) ❌
```

❌ **Runtime (no client request validation)**:
```typescript
// Developer sends invalid data:
await postty("login", { email: "not-an-email", password: "" })

// Request goes to server with invalid data
// Server's handleBody catches it:
// Response: 400 Bad Request { error: { code: "VALIDATION_ERROR", issues: [...] } }

// Developer only finds out at runtime, not compile-time
```

---

## Consistency Issues Summary

| Aspect | login | user | feedback | Consistent? |
|--------|-------|------|----------|-------------|
| Response shape | `{ ok, userId?, error?, ... }` | `{ user: {...} \| null }` | `{ ok, id?, error?, ... }` | ❌ No |
| Uses `ok` field | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| Error handling | Check `ok === false` | Check `user === null` | Check `ok === false` | ❌ No |
| Uses ApiResponse | ❌ No | ❌ No | ❌ No | ✅ Yes (consistently unused) |
| Request method | POST | GET | POST | N/A |
| Type source | api.types.ts (client) + schemas.ts (server) | Same | Same | ❌ No |

---

## Recommendations

### Priority 1: Critical (Must Fix)

1. **Eliminate duplicate type definitions**
   - Remove types from `schemas.ts`, keep only in `api.types.ts` OR vice versa
   - Update all imports to use single source

2. **Add response validation error handling**
   - Change `alrighty` to use `.safeParse()` instead of `.parse()`
   - Return proper error response instead of crashing

3. **Standardize response shapes**
   - Use `ApiResponse` helper for all endpoints
   - Enable discriminated unions for type narrowing

### Priority 2: High (Should Fix)

4. **Add client-side request validation**
   - Validate request body in `postty/putty` before sending
   - Catch invalid data at compile/runtime boundary

5. **Fix `z.never().optional()` confusion**
   - Use `z.undefined()` or `z.void()` for GET endpoints
   - Or skip `handleBody` entirely for GET requests

### Priority 3: Medium (Nice to Have)

6. **Add HTTP method constraints**
   - Associate methods with endpoints in schema
   - Constrain helpers to only accept matching endpoints

7. **Type-safe path overrides**
   - Use structured params instead of arbitrary strings
   - Validate path patterns

---

## Conclusion

The schema system has a **solid foundation** but suffers from:
- **Duplication** (types defined twice)
- **Inconsistency** (responses use different shapes)
- **Incomplete validation** (client doesn't validate requests, server crashes on invalid responses)
- **Dead code** (ApiResponse helpers defined but unused)

Most issues are **non-breaking** in current state but represent **maintenance debt** and **developer experience problems**. The system works but could fail silently when extended with new endpoints.
