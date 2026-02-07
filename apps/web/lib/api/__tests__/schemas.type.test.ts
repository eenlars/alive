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
        | "manager/templates"
        | "manager/templates/create"
        | "manager/templates/update"
        | "manager/templates/delete"
        | "auth/organizations"
        | "auth/all-workspaces"
        | "auth/workspaces"
        | "auth/org-members"
        | "auth/org-members/delete"
        | "auth/organizations/update"
        | "user/update"
        | "deploy-subdomain"
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
      >()
    })

    it("should be a union of string literals", () => {
      expectTypeOf<Endpoint>().toBeString()
      expectTypeOf<Endpoint>().not.toEqualTypeOf<string>() // Not just any string
    })
  })

  describe("Request types (Req<E>)", () => {
    it("should extract login request type", () => {
      type LoginReq = Req<"login">

      // Should have required properties
      expectTypeOf<LoginReq>().toHaveProperty("email")
      expectTypeOf<LoginReq>().toHaveProperty("password")
    })

    it("should extract feedback request type", () => {
      type FeedbackReq = Req<"feedback">

      expectTypeOf<FeedbackReq>().toHaveProperty("feedback")
      expectTypeOf<FeedbackReq>().toMatchTypeOf<{ feedback: string }>()

      // Optional properties should be optional
      expectTypeOf<FeedbackReq>().toHaveProperty("email")
      expectTypeOf<FeedbackReq>().toHaveProperty("workspace")
      expectTypeOf<FeedbackReq>().toHaveProperty("conversationId")
    })

    it("should return never for GET endpoint (no request body)", () => {
      type UserReq = Req<"user">

      // User endpoint is GET-only, no request body
      expectTypeOf<UserReq>().toEqualTypeOf<never>()
    })

    it("should return never for DELETE endpoint (no request body)", () => {
      type DeleteReq = Req<"manager/templates/delete">

      // DELETE endpoint has no request body
      expectTypeOf<DeleteReq>().toEqualTypeOf<never>()
    })

    it("should have request type for POST/PUT endpoints", () => {
      type CreateReq = Req<"manager/templates/create">
      type UpdateReq = Req<"manager/templates/update">

      // These should NOT be never
      expectTypeOf<CreateReq>().not.toEqualTypeOf<never>()
      expectTypeOf<UpdateReq>().not.toEqualTypeOf<never>()

      // Should have expected properties
      expectTypeOf<CreateReq>().toHaveProperty("name")
      expectTypeOf<UpdateReq>().toHaveProperty("template_id")
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

      // Different endpoints have different types
      expectTypeOf<LoginReq>().not.toEqualTypeOf<FeedbackReq>()
    })

    it("should distinguish between request types", () => {
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

  describe("Mutation vs Read endpoints", () => {
    it("should have request types only for mutation endpoints", () => {
      // These have req schemas
      type LoginReq = Req<"login">
      type FeedbackReq = Req<"feedback">
      type CancelReq = Req<"claude/stream/cancel">
      type CreateReq = Req<"manager/templates/create">
      type UpdateReq = Req<"manager/templates/update">

      expectTypeOf<LoginReq>().not.toEqualTypeOf<never>()
      expectTypeOf<FeedbackReq>().not.toEqualTypeOf<never>()
      expectTypeOf<CancelReq>().not.toEqualTypeOf<never>()
      expectTypeOf<CreateReq>().not.toEqualTypeOf<never>()
      expectTypeOf<UpdateReq>().not.toEqualTypeOf<never>()

      // These don't have req schemas (GET/DELETE)
      type UserReq = Req<"user">
      type TemplatesReq = Req<"manager/templates">
      type DeleteReq = Req<"manager/templates/delete">

      expectTypeOf<UserReq>().toEqualTypeOf<never>()
      expectTypeOf<TemplatesReq>().toEqualTypeOf<never>()
      expectTypeOf<DeleteReq>().toEqualTypeOf<never>()
    })
  })
})
