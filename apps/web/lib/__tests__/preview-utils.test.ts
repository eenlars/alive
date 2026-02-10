import { describe, expect, it, vi } from "vitest"

/**
 * Unit tests for preview-utils.ts
 *
 * Tests the actual exported functions. We mock @webalive/env/client
 * to control NEXT_PUBLIC_PREVIEW_BASE without needing real env vars.
 */

vi.mock("@webalive/env/client", () => ({
  env: {
    NEXT_PUBLIC_PREVIEW_BASE: "sonno.tech",
  },
}))

import {
  domainToPreviewLabel,
  extractWorkspaceFromPreviewHost,
  isPreviewHost,
  previewLabelToDomain,
} from "../preview-utils"

describe("preview-utils", () => {
  describe("domainToPreviewLabel", () => {
    it("converts dots to dashes", () => {
      expect(domainToPreviewLabel("protino.sonno.tech")).toBe("protino-sonno-tech")
    })

    it("handles single-part domain", () => {
      expect(domainToPreviewLabel("localhost")).toBe("localhost")
    })

    it("handles multi-level domain", () => {
      expect(domainToPreviewLabel("my.deep.site.alive.best")).toBe("my-deep-site-alive-best")
    })
  })

  describe("previewLabelToDomain", () => {
    it("converts dashes to dots", () => {
      expect(previewLabelToDomain("protino-sonno-tech")).toBe("protino.sonno.tech")
    })

    it("handles single-part label", () => {
      expect(previewLabelToDomain("localhost")).toBe("localhost")
    })
  })

  describe("isPreviewHost", () => {
    it("detects preview hosts", () => {
      expect(isPreviewHost("preview--protino-sonno-tech.sonno.tech")).toBe(true)
    })

    it("rejects normal hosts", () => {
      expect(isPreviewHost("protino.sonno.tech")).toBe(false)
    })

    it("rejects partial prefix", () => {
      expect(isPreviewHost("preview-protino.sonno.tech")).toBe(false)
    })
  })

  describe("extractWorkspaceFromPreviewHost", () => {
    it("extracts workspace from valid preview host", () => {
      expect(extractWorkspaceFromPreviewHost("preview--protino-sonno-tech.sonno.tech")).toBe("protino.sonno.tech")
    })

    it("returns null for non-preview host", () => {
      expect(extractWorkspaceFromPreviewHost("protino.sonno.tech")).toBeNull()
    })

    it("returns null for wrong wildcard suffix", () => {
      expect(extractWorkspaceFromPreviewHost("preview--protino-alive-best.alive.best")).toBeNull()
    })

    it("returns null for empty label", () => {
      expect(extractWorkspaceFromPreviewHost("preview--.sonno.tech")).toBeNull()
    })

    it("returns null for missing prefix", () => {
      expect(extractWorkspaceFromPreviewHost("anything.sonno.tech")).toBeNull()
    })

    it("handles label with multiple dashes (multi-level domain)", () => {
      expect(extractWorkspaceFromPreviewHost("preview--a-b-c-sonno-tech.sonno.tech")).toBe("a.b.c.sonno.tech")
    })
  })

  describe("round-trip: domainToPreviewLabel ↔ previewLabelToDomain", () => {
    it("round-trips a dot-only domain", () => {
      const domain = "protino.sonno.tech"
      expect(previewLabelToDomain(domainToPreviewLabel(domain))).toBe(domain)
    })

    it("domain with literal dashes is lossy (known limitation)", () => {
      // A domain like "my-site.alive.best" contains a real dash.
      // domainToPreviewLabel converts dots→dashes: "my-site-alive-best"
      // previewLabelToDomain converts ALL dashes→dots: "my.site.alive.best"
      // This is lossy — the round-trip does NOT recover the original.
      const domain = "my-site.alive.best"
      const label = domainToPreviewLabel(domain)
      expect(label).toBe("my-site-alive-best")
      expect(previewLabelToDomain(label)).toBe("my.site.alive.best")
      expect(previewLabelToDomain(label)).not.toBe(domain) // lossy!
    })
  })
})
