/**
 * Comprehensive tests for markdown detection utilities
 * Tests real-world Claude responses, edge cases, and rendering decisions
 */

import { describe, expect, it } from "vitest"
import { hasCodeBlock, hasMarkdown } from "@/lib/utils/markdown-utils"

// ============================================================================
// TypeScript Types for Test Fixtures
// ============================================================================

interface MarkdownTestCase {
  text: string
  shouldDetect: boolean
  description: string
  markdownType?: string
}

// ============================================================================
// Test: hasMarkdown()
// ============================================================================

describe("hasMarkdown", () => {
  describe("Headers", () => {
    const testCases: MarkdownTestCase[] = [
      { text: "# Heading 1", shouldDetect: true, description: "H1", markdownType: "header" },
      { text: "## Heading 2", shouldDetect: true, description: "H2", markdownType: "header" },
      { text: "### Heading 3", shouldDetect: true, description: "H3", markdownType: "header" },
      { text: "#### Heading 4", shouldDetect: true, description: "H4", markdownType: "header" },
      { text: "##### Heading 5", shouldDetect: true, description: "H5", markdownType: "header" },
      { text: "###### Heading 6", shouldDetect: true, description: "H6", markdownType: "header" },
      { text: "#No space after hash", shouldDetect: false, description: "hash without space", markdownType: "none" },
      { text: "####### Too many hashes", shouldDetect: false, description: "more than 6 hashes", markdownType: "none" },
      {
        text: "  # Indented header",
        shouldDetect: false,
        description: "indented header (not detected - requires start of line)",
        markdownType: "none",
      },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Code Blocks", () => {
    const testCases: MarkdownTestCase[] = [
      {
        text: "```\ncode here\n```",
        shouldDetect: true,
        description: "simple code block",
        markdownType: "code block",
      },
      {
        text: "```javascript\nconst x = 1\n```",
        shouldDetect: true,
        description: "code block with language",
        markdownType: "code block",
      },
      {
        text: "```ts\ntype Foo = string\n```",
        shouldDetect: true,
        description: "TypeScript code block",
        markdownType: "code block",
      },
      {
        text: "Some text ```inline``` code",
        shouldDetect: true,
        description: "inline code with backticks",
        markdownType: "inline code",
      },
      { text: "```", shouldDetect: false, description: "unclosed code block", markdownType: "none" },
      { text: "``", shouldDetect: false, description: "double backticks only", markdownType: "none" },
      {
        text: "```\nmultiline\ncode\nblock\n```",
        shouldDetect: true,
        description: "multiline code block",
        markdownType: "code block",
      },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Inline Code", () => {
    const testCases: MarkdownTestCase[] = [
      { text: "Use `console.log()` for debugging", shouldDetect: true, description: "inline code" },
      { text: "`variable`", shouldDetect: true, description: "single word in backticks" },
      { text: "The `npm install` command", shouldDetect: true, description: "inline command" },
      { text: "``", shouldDetect: false, description: "empty backticks" },
      { text: "`", shouldDetect: false, description: "single backtick" },
      { text: "This is a `", shouldDetect: false, description: "unclosed inline code" },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Bold and Italic", () => {
    const testCases: MarkdownTestCase[] = [
      { text: "**bold text**", shouldDetect: true, description: "bold with **", markdownType: "bold" },
      { text: "__bold text__", shouldDetect: true, description: "bold with __", markdownType: "bold" },
      { text: "*italic text*", shouldDetect: true, description: "italic with *", markdownType: "italic" },
      { text: "_italic text_", shouldDetect: true, description: "italic with _", markdownType: "italic" },
      { text: "***bold italic***", shouldDetect: true, description: "bold + italic", markdownType: "bold+italic" },
      { text: "**", shouldDetect: false, description: "empty bold markers", markdownType: "none" },
      { text: "__", shouldDetect: false, description: "empty bold markers alt", markdownType: "none" },
      { text: "*", shouldDetect: false, description: "single asterisk", markdownType: "none" },
      { text: "_", shouldDetect: false, description: "single underscore", markdownType: "none" },
      { text: "**unclosed bold", shouldDetect: false, description: "unclosed bold", markdownType: "none" },
      { text: "my_variable_name", shouldDetect: true, description: "underscores in variable name (false positive)" },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Lists", () => {
    const testCases: MarkdownTestCase[] = [
      { text: "- Item 1", shouldDetect: true, description: "unordered list with -", markdownType: "list" },
      { text: "* Item 1", shouldDetect: true, description: "unordered list with *", markdownType: "list" },
      { text: "+ Item 1", shouldDetect: true, description: "unordered list with +", markdownType: "list" },
      { text: "1. First item", shouldDetect: true, description: "ordered list", markdownType: "list" },
      { text: "42. Item", shouldDetect: true, description: "ordered list with large number", markdownType: "list" },
      { text: "  - Indented item", shouldDetect: true, description: "indented list item", markdownType: "list" },
      { text: "-No space", shouldDetect: false, description: "hyphen without space", markdownType: "none" },
      { text: "1.No space", shouldDetect: false, description: "number+dot without space", markdownType: "none" },
      { text: "- ", shouldDetect: true, description: "list marker with space only", markdownType: "list" },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Links and Images", () => {
    const testCases: MarkdownTestCase[] = [
      {
        text: "[Link text](https://example.com)",
        shouldDetect: true,
        description: "standard link",
        markdownType: "link",
      },
      { text: "[GitHub](https://github.com)", shouldDetect: true, description: "link to GitHub", markdownType: "link" },
      {
        text: "![Alt text](image.png)",
        shouldDetect: true,
        description: "image with alt text",
        markdownType: "image",
      },
      { text: "![](image.png)", shouldDetect: true, description: "image without alt text", markdownType: "image" },
      {
        text: "[Link]()",
        shouldDetect: false,
        description: "link with empty URL (not detected - requires URL content)",
        markdownType: "none",
      },
      { text: "[Unclosed link", shouldDetect: false, description: "unclosed link", markdownType: "none" },
      { text: "](no opening)", shouldDetect: false, description: "closing without opening", markdownType: "none" },
      {
        text: "[Link with spaces](https://example.com/path with spaces)",
        shouldDetect: true,
        description: "link with spaces in URL",
      },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Blockquotes and Horizontal Rules", () => {
    const testCases: MarkdownTestCase[] = [
      { text: "> Quote", shouldDetect: true, description: "blockquote", markdownType: "blockquote" },
      {
        text: "  > Indented quote",
        shouldDetect: false,
        description: "indented blockquote (not detected - requires start of line)",
        markdownType: "none",
      },
      { text: "---", shouldDetect: true, description: "horizontal rule with ---", markdownType: "hr" },
      { text: "***", shouldDetect: true, description: "horizontal rule with ***", markdownType: "hr" },
      { text: "___", shouldDetect: true, description: "horizontal rule with ___", markdownType: "hr" },
      { text: "-----", shouldDetect: true, description: "horizontal rule with multiple ---", markdownType: "hr" },
      { text: "  ---  ", shouldDetect: true, description: "horizontal rule with whitespace", markdownType: "hr" },
      { text: "--", shouldDetect: false, description: "only two dashes (not a rule)", markdownType: "none" },
      { text: ">No space", shouldDetect: false, description: "blockquote without space", markdownType: "none" },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Strikethrough", () => {
    const testCases: MarkdownTestCase[] = [
      { text: "~~strikethrough~~", shouldDetect: true, description: "strikethrough text" },
      { text: "This is ~~wrong~~ correct", shouldDetect: true, description: "strikethrough in sentence" },
      { text: "~~", shouldDetect: false, description: "empty strikethrough markers" },
      { text: "~single tilde~", shouldDetect: false, description: "single tildes (not strikethrough)" },
    ]

    for (const { text, shouldDetect, description } of testCases) {
      it(`should ${shouldDetect ? "detect" : "not detect"} ${description}`, () => {
        expect(hasMarkdown(text)).toBe(shouldDetect)
      })
    }
  })

  describe("Real-World Claude Responses", () => {
    it("should detect markdown in typical Claude code response", () => {
      const response = `Here's how to implement that:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

This function **takes a name** and returns a greeting.`

      expect(hasMarkdown(response)).toBe(true)
    })

    it("should detect markdown in Claude explanation with lists", () => {
      const response = `To fix this issue:

1. Check the configuration file
2. Restart the service
3. Verify the logs

Make sure to use \`sudo\` for system commands.`

      expect(hasMarkdown(response)).toBe(true)
    })

    it("should detect markdown in Claude response with emphasis", () => {
      const response = "**Important:** This is a *critical* security fix."
      expect(hasMarkdown(response)).toBe(true)
    })

    it("should NOT detect markdown in plain text response", () => {
      const response = "This is just a plain text response without any special formatting."
      expect(hasMarkdown(response)).toBe(false)
    })

    it("should handle very long Claude responses", () => {
      const longResponse = `# Project Overview\n\n${"Content here.\n".repeat(1000)}\n\n## Conclusion`
      expect(hasMarkdown(longResponse)).toBe(true)
    })
  })

  describe("Edge Cases", () => {
    it("should return false for empty string", () => {
      expect(hasMarkdown("")).toBe(false)
    })

    it("should return false for null", () => {
      expect(hasMarkdown(null as any)).toBe(false)
    })

    it("should return false for undefined", () => {
      expect(hasMarkdown(undefined as any)).toBe(false)
    })

    it("should return false for whitespace-only", () => {
      expect(hasMarkdown("   ")).toBe(false)
      expect(hasMarkdown("\n\n\n")).toBe(false)
      expect(hasMarkdown("\t\t")).toBe(false)
    })

    it("should handle text with multiple markdown types", () => {
      const mixed = "# Header\n\n**Bold** text with `code` and a [link](url)"
      expect(hasMarkdown(mixed)).toBe(true)
    })

    it("should NOT falsely detect email addresses as markdown", () => {
      const email = "Contact me at user_name@example.com"
      // This has _ but doesn't match _text_ pattern (underscore isn't isolated)
      expect(hasMarkdown(email)).toBe(false)
    })

    it("should NOT falsely detect URLs with underscores as markdown", () => {
      const url = "https://example.com/my_page"
      // Contains _ but doesn't match _text_ pattern
      expect(hasMarkdown(url)).toBe(false)
    })

    it("should NOT falsely detect math expressions as markdown", () => {
      const math = "The result is x * y + z"
      // * alone doesn't match *text* pattern (needs content between)
      expect(hasMarkdown(math)).toBe(false)
    })

    it("should NOT falsely detect file paths as markdown", () => {
      const path = "./my/file_path.txt"
      // Contains _ but doesn't match _text_ pattern
      expect(hasMarkdown(path)).toBe(false)
    })
  })

  describe("Multiline Text", () => {
    it("should detect headers across multiple lines", () => {
      const text = `First line
# Header
Third line`
      expect(hasMarkdown(text)).toBe(true)
    })

    it("should detect lists across multiple lines", () => {
      const text = `Intro text
- Item 1
- Item 2
Conclusion`
      expect(hasMarkdown(text)).toBe(true)
    })

    it("should detect blockquotes in multiline", () => {
      const text = `Some text
> This is a quote
More text`
      expect(hasMarkdown(text)).toBe(true)
    })
  })

  describe("Performance", () => {
    it("should handle very long strings efficiently", () => {
      const longText = "a".repeat(100000) // 100k characters
      const start = performance.now()
      hasMarkdown(longText)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100) // Should complete in < 100ms
    })

    it("should handle strings with many patterns efficiently", () => {
      const patterns = "**bold** *italic* `code` [link](url) # header\n".repeat(1000)
      const start = performance.now()
      const result = hasMarkdown(patterns)
      const duration = performance.now() - start

      expect(result).toBe(true)
      expect(duration).toBeLessThan(200) // Allow headroom for CI/deployment load
    })
  })
})

// ============================================================================
// Test: hasCodeBlock()
// ============================================================================

describe("hasCodeBlock", () => {
  describe("Valid Code Blocks", () => {
    it("should detect simple code block", () => {
      expect(hasCodeBlock("```\ncode\n```")).toBe(true)
    })

    it("should detect code block with language", () => {
      expect(hasCodeBlock("```javascript\nconst x = 1\n```")).toBe(true)
      expect(hasCodeBlock("```typescript\ntype Foo = string\n```")).toBe(true)
      expect(hasCodeBlock("```python\nprint('hello')\n```")).toBe(true)
    })

    it("should detect multiline code blocks", () => {
      const code = `\`\`\`typescript
function test() {
  console.log('test');
  return true;
}
\`\`\``
      expect(hasCodeBlock(code)).toBe(true)
    })

    it("should detect code block in longer text", () => {
      const text = `Here is some code:

\`\`\`js
console.log('test');
\`\`\`

And more text after.`
      expect(hasCodeBlock(text)).toBe(true)
    })

    it("should detect multiple code blocks", () => {
      const text = "```js\ncode1\n``` and ```ts\ncode2\n```"
      expect(hasCodeBlock(text)).toBe(true)
    })
  })

  describe("Invalid or Missing Code Blocks", () => {
    it("should NOT detect inline code (single backticks)", () => {
      expect(hasCodeBlock("`inline code`")).toBe(false)
    })

    it("should NOT detect unclosed code block", () => {
      expect(hasCodeBlock("```\ncode without closing")).toBe(false)
    })

    it("should NOT detect opening markers only", () => {
      expect(hasCodeBlock("```")).toBe(false)
    })

    it("should NOT detect plain text", () => {
      expect(hasCodeBlock("Just plain text")).toBe(false)
    })

    it("should NOT detect empty string", () => {
      expect(hasCodeBlock("")).toBe(false)
    })

    it("should NOT detect null or undefined", () => {
      expect(hasCodeBlock(null as any)).toBe(false)
      expect(hasCodeBlock(undefined as any)).toBe(false)
    })
  })

  describe("Edge Cases", () => {
    it("should detect code block with empty content", () => {
      expect(hasCodeBlock("```\n```")).toBe(true)
    })

    it("should detect code block with only whitespace", () => {
      expect(hasCodeBlock("```\n  \n```")).toBe(true)
    })

    it("should handle code blocks with special characters", () => {
      const code = "```\n!@#$%^&*()\n```"
      expect(hasCodeBlock(code)).toBe(true)
    })

    it("should handle code blocks with nested backticks", () => {
      const code = "```\nThis has ` backtick inside\n```"
      expect(hasCodeBlock(code)).toBe(true)
    })

    it("should handle Windows line endings", () => {
      const code = "```\r\ncode\r\n```"
      expect(hasCodeBlock(code)).toBe(true)
    })

    it("should handle mixed line endings", () => {
      const code = "```\ncode\r\nmore\n```"
      expect(hasCodeBlock(code)).toBe(true)
    })
  })

  describe("Real-World Usage", () => {
    it("should detect code in typical Claude response", () => {
      const response = `Here's the implementation:

\`\`\`typescript
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
\`\`\`

This function uses reduce to sum all prices.`

      expect(hasCodeBlock(response)).toBe(true)
    })

    it("should NOT detect inline code in response", () => {
      const response = "Use the `calculateTotal` function for this task."
      expect(hasCodeBlock(response)).toBe(false)
    })

    it("should handle very long code blocks", () => {
      const longCode = `\`\`\`typescript\n${"const x = 1;\n".repeat(10000)}\`\`\``
      expect(hasCodeBlock(longCode)).toBe(true)
    })
  })

  describe("Performance", () => {
    it("should handle very long strings efficiently", () => {
      const longText = "a".repeat(100000)
      const start = performance.now()
      hasCodeBlock(longText)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(200) // Allow headroom for CI/deployment load
    })
  })
})

// ============================================================================
// Integration Tests: hasMarkdown() vs hasCodeBlock()
// ============================================================================

describe("hasMarkdown vs hasCodeBlock integration", () => {
  it("should detect code blocks as markdown", () => {
    const code = "```js\nconst x = 1\n```"
    expect(hasCodeBlock(code)).toBe(true)
    expect(hasMarkdown(code)).toBe(true) // Code block is also markdown
  })

  it("should detect markdown but not code blocks", () => {
    const text = "# Header with **bold** text"
    expect(hasMarkdown(text)).toBe(true)
    expect(hasCodeBlock(text)).toBe(false)
  })

  it("should detect neither for plain text", () => {
    const text = "Just plain text"
    expect(hasMarkdown(text)).toBe(false)
    expect(hasCodeBlock(text)).toBe(false)
  })

  it("should handle inline code correctly", () => {
    const text = "Use `console.log()` for debugging"
    expect(hasMarkdown(text)).toBe(true) // Inline code is markdown
    expect(hasCodeBlock(text)).toBe(false) // But not a code block
  })
})
