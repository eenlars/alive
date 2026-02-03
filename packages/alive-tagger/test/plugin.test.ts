import { describe, it, expect, vi } from "vitest"
import { aliveTagger } from "../src/plugin"
import type { ResolvedConfig } from "vite"

describe("aliveTagger plugin", () => {
  describe("plugin creation", () => {
    it("creates plugin with correct name", () => {
      const plugin = aliveTagger()
      expect(plugin.name).toBe("alive-tagger")
    })

    it("uses pre enforcement", () => {
      const plugin = aliveTagger()
      expect(plugin.enforce).toBe("pre")
    })

    it("has all required hooks", () => {
      const plugin = aliveTagger()
      expect(typeof plugin.configResolved).toBe("function")
      expect(typeof plugin.resolveId).toBe("function")
      expect(typeof plugin.load).toBe("function")
      expect(typeof plugin.transformIndexHtml).toBe("function")
    })
  })

  describe("options", () => {
    it("defaults to enabled", () => {
      const plugin = aliveTagger()
      // Configure for development mode
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      // Should intercept jsx-dev-runtime
      const result = (plugin.resolveId as (id: string, importer?: string) => string | null)(
        "react/jsx-dev-runtime",
        "src/App.tsx",
      )
      expect(result).toBe("\0alive-jsx/jsx-dev-runtime")
    })

    it("respects enabled: false option", () => {
      const plugin = aliveTagger({ enabled: false })
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      // Should NOT intercept when disabled
      const result = (plugin.resolveId as (id: string, importer?: string) => string | null)(
        "react/jsx-dev-runtime",
        "src/App.tsx",
      )
      expect(result).toBeNull()
    })

    it("respects debug option", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const plugin = aliveTagger({ debug: true })
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      // Debug logging should happen - first arg is the prefix
      expect(consoleSpy).toHaveBeenCalled()
      expect(consoleSpy.mock.calls[0][0]).toBe("[alive-tagger]")

      consoleSpy.mockRestore()
    })
  })

  describe("resolveId", () => {
    it("returns null in production mode", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "production",
      } as ResolvedConfig)

      const result = (plugin.resolveId as (id: string, importer?: string) => string | null)(
        "react/jsx-dev-runtime",
        "src/App.tsx",
      )
      expect(result).toBeNull()
    })

    it("returns null for non jsx-dev-runtime imports", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const result = (plugin.resolveId as (id: string, importer?: string) => string | null)("react", "src/App.tsx")
      expect(result).toBeNull()
    })

    it("intercepts react/jsx-dev-runtime in development", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const result = (plugin.resolveId as (id: string, importer?: string) => string | null)(
        "react/jsx-dev-runtime",
        "src/App.tsx",
      )
      expect(result).toBe("\0alive-jsx/jsx-dev-runtime")
    })

    it("does not intercept its own virtual module", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      // Importing from within our virtual module should not trigger interception
      const result = (plugin.resolveId as (id: string, importer?: string) => string | null)(
        "react/jsx-dev-runtime",
        "\0alive-jsx/something",
      )
      expect(result).toBeNull()
    })
  })

  describe("load", () => {
    it("returns null for unknown ids", () => {
      const plugin = aliveTagger()
      const result = (plugin.load as (id: string) => string | null)("unknown-module")
      expect(result).toBeNull()
    })

    it("returns JSX runtime code for virtual module", () => {
      const plugin = aliveTagger()
      const result = (plugin.load as (id: string) => string | null)("\0alive-jsx/jsx-dev-runtime")
      expect(result).toContain("jsxDEV")
      expect(result).toContain("Fragment")
      expect(result).toContain("SOURCE_KEY")
      expect(result).toContain("sourceElementMap")
    })

    it("includes WeakRef cleanup interval", () => {
      const plugin = aliveTagger()
      const result = (plugin.load as (id: string) => string | null)("\0alive-jsx/jsx-dev-runtime")
      expect(result).toContain("setInterval")
      expect(result).toContain("30000")
      expect(result).toContain("deref()")
    })
  })

  describe("transformIndexHtml", () => {
    it("returns unchanged html in production", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "production",
      } as ResolvedConfig)

      const html = "<html><body><div id='root'></div></body></html>"
      const result = (plugin.transformIndexHtml as (html: string) => string)(html)
      expect(result).toBe(html)
    })

    it("returns unchanged html when disabled", () => {
      const plugin = aliveTagger({ enabled: false })
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const html = "<html><body><div id='root'></div></body></html>"
      const result = (plugin.transformIndexHtml as (html: string) => string)(html)
      expect(result).toBe(html)
    })

    it("injects client script in development", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const html = "<html><body><div id='root'></div></body></html>"
      const result = (plugin.transformIndexHtml as (html: string) => string)(html)

      // Should inject script before </body>
      expect(result).toContain('<script type="module">')
      expect(result).toContain("alive-tagger")
      expect(result).toContain("__aliveTaggerInitialized")
      expect(result).toContain("</body>")
    })

    it("injects client script with all UI elements", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const html = "<html><body></body></html>"
      const result = (plugin.transformIndexHtml as (html: string) => string)(html)

      // Check for UI element IDs
      expect(result).toContain("alive-tagger-overlay")
      expect(result).toContain("alive-tagger-label")
      expect(result).toContain("alive-tagger-crosshair-h")
      expect(result).toContain("alive-tagger-crosshair-v")
      expect(result).toContain("alive-tagger-coords")
    })

    it("injects script with correct event handlers", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const html = "<html><body></body></html>"
      const result = (plugin.transformIndexHtml as (html: string) => string)(html)

      // Check for event handlers
      expect(result).toContain("keydown")
      expect(result).toContain("keyup")
      expect(result).toContain("mousemove")
      expect(result).toContain("click")
      expect(result).toContain("blur")
    })

    it("injects postMessage for parent communication", () => {
      const plugin = aliveTagger()
      ;(plugin.configResolved as (config: ResolvedConfig) => void)({
        mode: "development",
      } as ResolvedConfig)

      const html = "<html><body></body></html>"
      const result = (plugin.transformIndexHtml as (html: string) => string)(html)

      expect(result).toContain("window.parent.postMessage")
      expect(result).toContain("alive-element-selected")
    })
  })
})
