/**
 * Tests for Linear GraphQL query validation
 *
 * These tests ensure the GraphQL query structure is valid and won't
 * cause runtime errors from Linear's API.
 *
 * Background: We had a production incident where `state` was used as a
 * direct argument to `assignedIssues` instead of being nested inside
 * `filter`. This caused a GRAPHQL_VALIDATION_FAILED error.
 */

import { describe, expect, it } from "vitest"
import { buildLinearIssuesQuery } from "../query-builder"

describe("Linear Issues Query Builder", () => {
  describe("query structure validation", () => {
    it("should use filter argument, not direct state argument", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: false })

      // The state filter MUST be inside a filter: { } block
      // NOT as a direct argument like: assignedIssues(state: ...)
      expect(query).toContain("filter:")
      // State must be nested inside filter (whitespace-agnostic)
      expect(query).toMatch(/filter:\s*\{[\s\S]*state:/)

      // Should NOT have state as a direct sibling of first/orderBy
      // This catches: assignedIssues(first: $limit, state: ...) - WRONG
      // The state arg should only appear inside filter: { state: ... }
      const directStatePattern = /assignedIssues\([^)]*,\s*state:/
      expect(query).not.toMatch(directStatePattern)
    })

    it("should exclude completed and canceled state types by default", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: false })

      expect(query).toContain("type: {")
      expect(query).toContain('"completed"')
      expect(query).toContain('"canceled"')
    })

    it("should exclude done/duplicate state names by default", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: false })

      expect(query).toContain("name: {")
      expect(query).toContain('"Done"')
      expect(query).toContain('"Duplicate"')
    })

    it("should not include filter when includeCompleted is true", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: true })

      expect(query).not.toContain("filter:")
      expect(query).not.toContain("nin:")
    })

    it("should include required fields in response", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: false })

      // Essential fields
      expect(query).toContain("id")
      expect(query).toContain("identifier")
      expect(query).toContain("title")
      expect(query).toContain("state {")
      expect(query).toContain("url")
    })

    it("should use valid GraphQL syntax", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: false })

      // Check for balanced braces (basic syntax check)
      const openBraces = (query.match(/{/g) || []).length
      const closeBraces = (query.match(/}/g) || []).length
      expect(openBraces).toBe(closeBraces)

      // Check for balanced parentheses
      const openParens = (query.match(/\(/g) || []).length
      const closeParens = (query.match(/\)/g) || []).length
      expect(openParens).toBe(closeParens)
    })
  })

  describe("query variables", () => {
    it("should declare $limit variable", () => {
      const query = buildLinearIssuesQuery({ includeCompleted: false })

      expect(query).toContain("$limit: Int!")
      expect(query).toContain("first: $limit")
    })
  })
})
