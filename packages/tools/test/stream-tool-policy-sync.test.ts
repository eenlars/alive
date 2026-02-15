import { isStreamPolicyTool } from "@webalive/shared"
import { describe, expect, it } from "vitest"
import { getEnabledMcpToolNames } from "../src/tools/meta/search-tools.js"

describe("stream tool policy sync", () => {
  it("requires a policy entry for every enabled internal MCP tool", () => {
    const internalTools = getEnabledMcpToolNames().filter(
      tool => tool.startsWith("mcp__alive-workspace__") || tool.startsWith("mcp__alive-tools__"),
    )

    const missingPolicies = internalTools.filter(tool => !isStreamPolicyTool(tool))
    expect(missingPolicies).toEqual([])
  })
})
