/**
 * Type Tests for API Schema System
 *
 * These tests verify compile-time type safety using Vitest's expectTypeOf.
 * They are PURE TYPE TESTS - they verify types without executing code.
 *
 * Run: bun run test schemas.type.test.ts
 */

import { describe, expectTypeOf, it } from "vitest"
import type { ApiError } from "../api-client"
import type { Endpoint, Req, Res } from "../schemas"

describe("API Schema Type System", () => {
  describe("Endpoint type", () => {
    it("should only allow defined endpoints", () => {
      expectTypeOf<Endpoint>().toEqualTypeOf<
        | "login"
        | "user"
        | "feedback"
        | "claude/stream/cancel"
        | "templates"
        | "manager/orgs"
        | "manager/templates"
        | "manager/templates/create"
        | "manager/templates/update"
        | "manager/templates/delete"
        | "auth/organizations"
        | "auth/all-workspaces"
        | "auth/workspaces"
        | "auth/org-members"
        | "auth/org-members/create"
        | "auth/org-members/delete"
        | "auth/organizations/update"
        | "user/update"
        | "deploy-subdomain"
        | "import-repo"
        | "automations"
        | "automations/create"
        | "automations/runs"
        | "sites"
        | "worktrees"
        | "worktrees/create"
        | "worktrees/delete"
        | "integrations/available"
        | "integrations/disconnect"
        | "integrations/connect"
        | "drive/list"
        | "drive/read"
        | "drive/delete"
        | "rename-site"
      >()
    })

    it("should be a union of string literals", () => {
      expectTypeOf<Endpoint>().toBeString()
      expectTypeOf<Endpoint>().not.toEqualTypeOf<string>() // Not just any string
    })
  })

  describe("Request types (Req<E>)", () => {
    it("should extract login request type with brand", () => {
      type LoginReq = Req<"login">

      // Should have required properties
      expectTypeOf<LoginReq>().toHaveProperty("email")
      expectTypeOf<LoginReq>().toHaveProperty("password")

      // Should be branded (not assignable from plain object)
      type PlainObj = { email: string; password: string }
      expectTypeOf<PlainObj>().not.toMatchTypeOf<LoginReq>()
    })

    it("should extract feedback request type with brand", () => {
      type FeedbackReq = Req<"feedback">

      expectTypeOf<FeedbackReq>().toHaveProperty("feedback")
      expectTypeOf<FeedbackReq>().toMatchTypeOf<{ feedback: string }>()

      // Optional properties should be optional
      expectTypeOf<FeedbackReq>().toHaveProperty("email")
      expectTypeOf<FeedbackReq>().toHaveProperty("workspace")
      expectTypeOf<FeedbackReq>().toHaveProperty("conversationId")
    })

    it("should have branded type for user GET endpoint", () => {
      type UserReq = Req<"user">

      // User endpoint has branded undefined (GET request, no body)
      // The brand makes it distinct from plain undefined
      type PlainUndefined = undefined
      expectTypeOf<PlainUndefined>().not.toMatchTypeOf<UserReq>()
    })

    it("should not allow plain objects as branded types", () => {
      type LoginReq = Req<"login">
      type PlainLogin = { email: string; password: string }

      // Plain object is NOT the same as branded type
      expectTypeOf<PlainLogin>().not.toEqualTypeOf<LoginReq>()
      expectTypeOf<PlainLogin>().not.toMatchTypeOf<LoginReq>()
    })
  })

  describe("Response types (Res<E>)", () => {
    it("should infer login response type correctly", () => {
      type LoginRes = Res<"login">

      expectTypeOf<LoginRes>().toMatchTypeOf<{ ok: boolean }>()
      expectTypeOf<LoginRes>().toHaveProperty("ok")
      expectTypeOf<LoginRes>().toHaveProperty("userId")
      expectTypeOf<LoginRes>().toHaveProperty("error")
    })

    it("should infer user response type with nullable user", () => {
      type UserRes = Res<"user">

      expectTypeOf<UserRes>().toHaveProperty("user")
      expectTypeOf<UserRes>().toMatchTypeOf<{
        user: {
          id: string
          email: string
          name: string | null
          canSelectAnyModel: boolean
          isAdmin: boolean
          isSuperadmin: boolean
          enabledModels: string[]
        } | null
      }>()
    })

    it("should infer feedback response type", () => {
      type FeedbackRes = Res<"feedback">

      expectTypeOf<FeedbackRes>().toHaveProperty("ok")
      expectTypeOf<FeedbackRes>().toHaveProperty("id")
      expectTypeOf<FeedbackRes>().toHaveProperty("timestamp")
    })
  })

  describe("API Error type", () => {
    it("should have correct error structure", () => {
      expectTypeOf<ApiError>().toHaveProperty("message")
      expectTypeOf<ApiError>().toHaveProperty("status")
      expectTypeOf<ApiError>().toHaveProperty("code")
      expectTypeOf<ApiError>().toHaveProperty("details")
    })
  })

  describe("Type safety guarantees", () => {
    it("should prevent mixing endpoint request types", () => {
      type LoginReq = Req<"login">
      type FeedbackReq = Req<"feedback">

      // Different endpoints have different branded types
      expectTypeOf<LoginReq>().not.toEqualTypeOf<FeedbackReq>()
      expectTypeOf<LoginReq>().not.toMatchTypeOf<FeedbackReq>()
    })

    it("should have distinct brands per endpoint", () => {
      type Login = Req<"login">
      type Feedback = Req<"feedback">
      type User = Req<"user">

      // All three should be different types
      expectTypeOf<Login>().not.toEqualTypeOf<Feedback>()
      expectTypeOf<Login>().not.toEqualTypeOf<User>()
      expectTypeOf<Feedback>().not.toEqualTypeOf<User>()
    })
  })

  describe("Optional and nullable fields", () => {
    it("should handle optional request fields correctly", () => {
      type FeedbackReq = Req<"feedback">

      // Feedback has required 'feedback' field
      expectTypeOf<FeedbackReq>().toHaveProperty("feedback")

      // Email is optional
      expectTypeOf<FeedbackReq>().toHaveProperty("email")
      expectTypeOf<FeedbackReq>().toHaveProperty("workspace")
    })

    it("should handle nullable response fields correctly", () => {
      type UserRes = Res<"user">

      // User can be null
      expectTypeOf<UserRes>().toEqualTypeOf<{
        user: {
          id: string
          email: string
          name: string | null
          canSelectAnyModel: boolean
          isAdmin: boolean
          isSuperadmin: boolean
          enabledModels: string[]
        } | null
      }>()
    })
  })

  describe("Branded type enforcement", () => {
    it("login request should require LoginRequest brand", () => {
      // The branded type includes the brand marker
      type LoginReq = Req<"login">
      type UnbrandedLogin = { email: string; password: string }

      // Branded type is NOT assignable from unbranded
      expectTypeOf<UnbrandedLogin>().not.toMatchTypeOf<LoginReq>()
    })

    it("feedback request should require FeedbackRequest brand", () => {
      type FeedbackReq = Req<"feedback">
      type UnbrandedFeedback = { feedback: string }

      // Branded type is NOT assignable from unbranded
      expectTypeOf<UnbrandedFeedback>().not.toMatchTypeOf<FeedbackReq>()
    })
  })
})
