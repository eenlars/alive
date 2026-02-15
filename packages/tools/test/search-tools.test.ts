import { GLOBAL_MCP_PROVIDERS, OAUTH_MCP_PROVIDERS } from "@webalive/shared"
import { afterEach, describe, expect, it } from "vitest"
import { searchTools, setSearchToolsConnectedProviders } from "../src/tools/meta/search-tools.js"

function parseToolNamesFromMinimalResult(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.match(/^- \*\*(.+?)\*\*$/)?.[1] ?? null)
    .filter((name): name is string => name !== null)
}

function normalizeExternalProviderKey(key: string): string {
  return key.replace(/-/g, "_")
}

describe("search_tools", () => {
  afterEach(() => {
    setSearchToolsConnectedProviders([])
  })

  it("should show global MCP providers regardless of connection status", async () => {
    setSearchToolsConnectedProviders([])
    const result = await searchTools({ category: "external-mcp", detail_level: "minimal" })
    const output = result.content[0]?.text ?? ""
    const names = parseToolNamesFromMinimalResult(output)

    for (const providerKey of Object.keys(GLOBAL_MCP_PROVIDERS)) {
      expect(names).toContain(normalizeExternalProviderKey(providerKey))
    }
  })

  it("should never include OAuth providers in registry (SDK handles their discovery)", async () => {
    // Even with all OAuth providers "connected", they should not appear
    // in search_tools results — the SDK's own MCP server listing handles them
    const allOAuthKeys = Object.keys(OAUTH_MCP_PROVIDERS)
    setSearchToolsConnectedProviders(allOAuthKeys)

    const result = await searchTools({ category: "external-mcp", detail_level: "minimal" })
    const output = result.content[0]?.text ?? ""
    const names = parseToolNamesFromMinimalResult(output)

    for (const providerKey of allOAuthKeys) {
      expect(names).not.toContain(providerKey)
    }
  })
})
