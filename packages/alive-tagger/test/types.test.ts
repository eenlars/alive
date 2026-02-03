import { describe, it, expect } from "vitest"
import {
  SOURCE_KEY,
  ELEMENT_SELECTED_MESSAGE_TYPE,
  type SourceInfo,
  type ElementSelectedContext,
  type ElementSelectedMessage,
} from "../src/types"

describe("types", () => {
  describe("SOURCE_KEY", () => {
    it("is a global symbol", () => {
      expect(typeof SOURCE_KEY).toBe("symbol")
      expect(SOURCE_KEY).toBe(Symbol.for("__aliveSource__"))
    })

    it("is consistent across imports", () => {
      const anotherKey = Symbol.for("__aliveSource__")
      expect(SOURCE_KEY).toBe(anotherKey)
    })
  })

  describe("ELEMENT_SELECTED_MESSAGE_TYPE", () => {
    it("has correct value", () => {
      expect(ELEMENT_SELECTED_MESSAGE_TYPE).toBe("alive-element-selected")
    })
  })

  describe("SourceInfo type", () => {
    it("accepts valid source info objects", () => {
      const source: SourceInfo = {
        fileName: "client/pages/Index.tsx",
        lineNumber: 42,
        columnNumber: 10,
        displayName: "Index",
      }
      expect(source.fileName).toBe("client/pages/Index.tsx")
      expect(source.lineNumber).toBe(42)
      expect(source.columnNumber).toBe(10)
      expect(source.displayName).toBe("Index")
    })
  })

  describe("ElementSelectedContext type", () => {
    it("accepts valid context objects", () => {
      const context: ElementSelectedContext = {
        fileName: "client/pages/Index.tsx",
        lineNumber: 42,
        columnNumber: 10,
        displayName: "Index",
        html: "<div>Hello</div>",
        tagName: "div",
        className: "container",
        id: "main",
        parentComponents: ["App", "Layout"],
      }
      expect(context.html).toBe("<div>Hello</div>")
      expect(context.parentComponents).toEqual(["App", "Layout"])
    })
  })

  describe("ElementSelectedMessage type", () => {
    it("accepts valid message objects", () => {
      const message: ElementSelectedMessage = {
        type: ELEMENT_SELECTED_MESSAGE_TYPE,
        context: {
          fileName: "client/pages/Index.tsx",
          lineNumber: 42,
          columnNumber: 10,
          displayName: "Index",
          html: "<div>Hello</div>",
          tagName: "div",
          className: "",
          id: "",
          parentComponents: [],
        },
      }
      expect(message.type).toBe("alive-element-selected")
      expect(message.context.displayName).toBe("Index")
    })
  })
})
