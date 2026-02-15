import { GLOBAL_MCP_PROVIDERS, OAUTH_MCP_PROVIDERS } from "@webalive/shared"
import { afterEach, describe, expect, it } from "vitest"
import {
  searchTools,
  setSearchToolsConnectedProviders,
  withSearchToolsConnectedProviders,
} from "../src/tools/meta/search-tools.js"

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

  it("should hide OAuth external MCP entries when user has no connected providers", async () => {
    setSearchToolsConnectedProviders([])
    const result = await searchTools({ category: "external-mcp", detail_level: "minimal" })
    const output = result.content[0]?.text ?? ""
    const names = parseToolNamesFromMinimalResult(output)

    for (const providerKey of Object.keys(GLOBAL_MCP_PROVIDERS)) {
      expect(names).toContain(normalizeExternalProviderKey(providerKey))
    }

    for (const providerKey of Object.keys(OAUTH_MCP_PROVIDERS)) {
      expect(names).not.toContain(normalizeExternalProviderKey(providerKey))
    }
  })

  it("should show only connected OAuth external MCP entries", async () => {
    const oauthProviderKeys = Object.keys(OAUTH_MCP_PROVIDERS)
    const connectedProviders = oauthProviderKeys.slice(0, 2)
    setSearchToolsConnectedProviders(connectedProviders)

    const result = await searchTools({ category: "external-mcp", detail_level: "minimal" })
    const output = result.content[0]?.text ?? ""
    const names = parseToolNamesFromMinimalResult(output)

    for (const providerKey of Object.keys(GLOBAL_MCP_PROVIDERS)) {
      expect(names).toContain(normalizeExternalProviderKey(providerKey))
    }

    for (const providerKey of connectedProviders) {
      expect(names).toContain(normalizeExternalProviderKey(providerKey))
    }

    const disconnectedProviders = oauthProviderKeys.filter(key => !connectedProviders.includes(key))
    for (const providerKey of disconnectedProviders) {
      expect(names).not.toContain(normalizeExternalProviderKey(providerKey))
    }
  })

  it("should isolate connected providers across concurrent async contexts", async () => {
    const oauthProviderKeys = Object.keys(OAUTH_MCP_PROVIDERS)
    expect(oauthProviderKeys.length).toBeGreaterThanOrEqual(2)
    const firstProvider = oauthProviderKeys[0]!
    const secondProvider = oauthProviderKeys[1]!

    const runScopedSearch = async (provider: string, delayMs: number): Promise<string[]> => {
      return await withSearchToolsConnectedProviders([provider], async () => {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        const result = await searchTools({ category: "external-mcp", detail_level: "minimal" })
        const output = result.content[0]?.text ?? ""
        return parseToolNamesFromMinimalResult(output)
      })
    }

    const [firstNames, secondNames] = await Promise.all([
      runScopedSearch(firstProvider, 25),
      runScopedSearch(secondProvider, 0),
    ])

    expect(firstNames).toContain(firstProvider)
    expect(firstNames).not.toContain(secondProvider)
    expect(secondNames).toContain(secondProvider)
    expect(secondNames).not.toContain(firstProvider)
  })
})
