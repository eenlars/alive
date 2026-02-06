/**
 * Syntax highlighting tokenizer
 * Extracted from CodeView - single responsibility
 */

export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "operator"
  | "function"
  | "property"
  | "tag"
  | "default"

export interface Token {
  type: TokenType
  value: string
}

export const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: "text-purple-400",
  string: "text-emerald-400",
  comment: "text-neutral-600",
  number: "text-amber-400",
  operator: "text-sky-300",
  function: "text-sky-400",
  property: "text-neutral-300",
  tag: "text-rose-400",
  default: "text-neutral-400",
}

// Token matchers in priority order
interface TokenMatcher {
  type: TokenType
  pattern: RegExp
  languages?: string[] // If specified, only match for these languages
}

const TOKEN_MATCHERS: TokenMatcher[] = [
  // Comments - highest priority
  { type: "comment", pattern: /^(\/\/.*|\/\*[\s\S]*?\*\/|{\/\*[\s\S]*?\*\/}|<!--[\s\S]*?-->)/ },
  // Strings
  { type: "string", pattern: /^("[^"]*"|'[^']*'|`[^`]*`)/ },
  // HTML tags - only for markup languages
  { type: "tag", pattern: /^(<\/?[\w-]+|>|\/>)/, languages: ["html", "vue", "svelte"] },
  // Keywords
  {
    type: "keyword",
    pattern:
      /^(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|this|async|await|try|catch|throw|typeof|instanceof|default|switch|case|break|continue|interface|type|enum|implements|public|private|protected|static|readonly|as|is)\b/,
  },
  // Numbers
  { type: "number", pattern: /^(\d+\.?\d*)/ },
  // Operators
  { type: "operator", pattern: /^([=+\-*/<>!&|?:]+|=>)/ },
  // Function calls
  { type: "function", pattern: /^([\w$]+)(?=\s*\()/ },
  // Properties/identifiers
  { type: "property", pattern: /^([\w$]+)/ },
]

export function tokenizeLine(line: string, language: string): Token[] {
  if (!line.trim()) {
    return [{ type: "default", value: line || " " }]
  }

  const tokens: Token[] = []
  let remaining = line

  while (remaining.length > 0) {
    let matched = false

    for (const matcher of TOKEN_MATCHERS) {
      // Skip if language-specific and doesn't match
      if (matcher.languages && !matcher.languages.includes(language)) {
        continue
      }

      const match = remaining.match(matcher.pattern)
      if (match) {
        tokens.push({ type: matcher.type, value: match[0] })
        remaining = remaining.slice(match[0].length)
        matched = true
        break
      }
    }

    // No match - consume single character
    if (!matched) {
      tokens.push({ type: "default", value: remaining[0] })
      remaining = remaining.slice(1)
    }
  }

  return tokens
}
