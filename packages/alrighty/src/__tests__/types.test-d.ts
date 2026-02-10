import { assertType, describe, expectTypeOf, it } from "vitest"
import { z } from "zod"
import {
  createClient,
  type Endpoint,
  type MutationEndpoint,
  type ReadEndpoint,
  type Req,
  type Res,
  type SchemaRegistry,
} from "../index"

// Test schema registry
const schemas = {
  // GET - no req
  user: {
    res: z.object({ id: z.string(), email: z.string() }),
  },
  // POST - has req
  login: {
    req: z.object({ email: z.string(), password: z.string() }),
    res: z.object({ ok: z.boolean(), token: z.string().optional() }),
  },
  // PUT - has req
  update: {
    req: z.object({ name: z.string() }),
    res: z.object({ ok: z.boolean() }),
  },
} satisfies SchemaRegistry

type TestSchemas = typeof schemas

describe("Type Tests", () => {
  describe("Endpoint type", () => {
    it("extracts endpoint names as string union", () => {
      expectTypeOf<Endpoint<TestSchemas>>().toEqualTypeOf<"user" | "login" | "update">()
    })
  })

  describe("MutationEndpoint type", () => {
    it("extracts only endpoints with req schema", () => {
      expectTypeOf<MutationEndpoint<TestSchemas>>().toEqualTypeOf<"login" | "update">()
    })
  })

  describe("ReadEndpoint type", () => {
    it("extracts only endpoints without req schema", () => {
      expectTypeOf<ReadEndpoint<TestSchemas>>().toEqualTypeOf<"user">()
    })
  })

  describe("Req type", () => {
    it("extracts request type for POST endpoint", () => {
      type LoginReq = Req<TestSchemas, "login">
      expectTypeOf<LoginReq>().toEqualTypeOf<{ email: string; password: string }>()
    })

    it("returns never for GET endpoint without req", () => {
      type UserReq = Req<TestSchemas, "user">
      expectTypeOf<UserReq>().toEqualTypeOf<never>()
    })
  })

  describe("Res type", () => {
    it("extracts response type correctly", () => {
      type UserRes = Res<TestSchemas, "user">
      expectTypeOf<UserRes>().toEqualTypeOf<{ id: string; email: string }>()
    })

    it("handles optional fields in response", () => {
      type LoginRes = Res<TestSchemas, "login">
      expectTypeOf<LoginRes>().toEqualTypeOf<{ ok: boolean; token?: string }>()
    })
  })

  describe("createClient return types", () => {
    const { getty, postty, putty, patchy, deletty } = createClient(schemas)

    it("getty returns correct response type", async () => {
      const result = await getty("user")
      expectTypeOf(result).toEqualTypeOf<{ id: string; email: string }>()
    })

    it("getty does not accept body parameter", () => {
      // @ts-expect-error - getty should not have body parameter
      getty("user", { body: {} })
    })

    it("postty requires correct body type", async () => {
      const result = await postty("login", { email: "test@test.com", password: "123" })
      expectTypeOf(result).toEqualTypeOf<{ ok: boolean; token?: string }>()
    })

    it("postty rejects GET-only endpoints", () => {
      // @ts-expect-error - user is GET only, has no req schema
      postty("user", undefined)
    })

    it("postty rejects wrong body type", () => {
      // @ts-expect-error - wrong body shape
      postty("login", { wrong: "shape" })
    })

    it("postty rejects missing required fields", () => {
      // @ts-expect-error - missing password
      postty("login", { email: "test@test.com" })
    })

    it("putty requires correct body type", async () => {
      const result = await putty("update", { name: "Test" })
      expectTypeOf(result).toEqualTypeOf<{ ok: boolean }>()
    })

    it("putty rejects GET-only endpoints", () => {
      // @ts-expect-error - user is GET only
      putty("user", undefined)
    })

    it("patchy requires correct body type", () => {
      assertType<Promise<{ ok: boolean }>>(patchy("update", { name: "Test" }))
    })

    it("patchy rejects GET-only endpoints", () => {
      // @ts-expect-error - user is GET only
      patchy("user", undefined)
    })

    it("deletty works on any endpoint", () => {
      // deletty should work on both GET and mutation endpoints
      assertType<Promise<{ id: string; email: string }>>(deletty("user"))
      assertType<Promise<{ ok: boolean; token?: string }>>(deletty("login"))
    })
  })

  describe("endpoint name type safety", () => {
    const { getty, postty } = createClient(schemas)

    it("rejects invalid endpoint names", () => {
      // @ts-expect-error - invalid endpoint
      getty("nonexistent")
    })

    it("accepts valid endpoint names", () => {
      assertType<Promise<{ id: string; email: string }>>(getty("user"))
      assertType<Promise<{ ok: boolean; token?: string }>>(postty("login", { email: "", password: "" }))
    })
  })

  describe("ClientOptions types", () => {
    it("accepts valid options", () => {
      createClient(schemas, {
        basePath: "/v2",
        credentials: "include",
        headers: { Authorization: "Bearer token" },
      })
    })

    it("accepts Record<string, string> headers", () => {
      createClient(schemas, { headers: { "X-Custom": "value" } })
    })

    it("rejects Headers instance", () => {
      // @ts-expect-error - Headers instance not allowed, use Record<string, string>
      createClient(schemas, { headers: new Headers({ "X-Custom": "value" }) })
    })
  })

  describe("SchemaRegistry constraint", () => {
    it("requires res in every endpoint", () => {
      // @ts-expect-error - missing res property
      const _badSchemas: SchemaRegistry = { noRes: { req: z.object({}) } }
    })

    it("allows req to be optional", () => {
      const goodSchemas = {
        getOnly: { res: z.object({ ok: z.boolean() }) },
      } satisfies SchemaRegistry

      assertType<SchemaRegistry>(goodSchemas)
    })
  })
})
