"use client"

import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownDisplayProps {
  content: string
  className?: string
}

const components: Components = {
  // Code blocks - wrap in styled container
  pre: ({ children, node }) => {
    const codeElement = node?.children?.[0]
    let language: string | null = null

    if (codeElement?.type === "element" && codeElement.tagName === "code") {
      const className = (codeElement.properties?.className as string[])?.join(" ") || ""
      const match = /language-(\w+)/.exec(className)
      language = match?.[1] || null
    }

    return (
      <div className="my-3 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 overflow-hidden max-w-full">
        {language && (
          <div className="px-3 py-1 text-[10px] text-black/40 dark:text-white/40 border-b border-black/10 dark:border-white/10 font-mono">
            {language}
          </div>
        )}
        <pre className="p-3 overflow-x-auto max-w-full">{children}</pre>
      </div>
    )
  },

  // Code - inline vs block determined by 'inline' prop from react-markdown
  code: props => {
    const { children, inline } = props as { children: React.ReactNode; inline?: boolean }

    if (inline) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[13px] font-mono text-black/80 dark:text-white/80">
          {children}
        </code>
      )
    }

    return <code className="text-[13px] font-mono text-black/80 dark:text-white/80 leading-relaxed">{children}</code>
  },

  // Headings
  h1: ({ children }) => <h1 className="text-2xl font-semibold mb-2 mt-4">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold mb-2 mt-4">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-4">{children}</h3>,
  h4: ({ children }) => <h4 className="text-base font-semibold mb-2 mt-3">{children}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-semibold mb-2 mt-3">{children}</h5>,
  h6: ({ children }) => <h6 className="text-xs font-semibold mb-2 mt-3">{children}</h6>,

  // Lists
  ul: ({ children }) => <ul className="list-disc ml-6 my-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-6 my-2">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-black/20 dark:border-white/20 pl-4 my-2 italic text-black/70 dark:text-white/70">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
    >
      {children}
    </a>
  ),

  // Paragraphs - avoid wrapping block elements in <p>
  p: ({ children, node }) => {
    const hasBlockChild = node?.children?.some(
      (child: any) =>
        child.type === "element" && ["pre", "div", "blockquote", "ul", "ol", "table"].includes(child.tagName),
    )

    if (hasBlockChild) {
      return <>{children}</>
    }

    return <p className="mb-3">{children}</p>
  },

  // Emphasis
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // Horizontal rule
  hr: () => <hr className="my-4 border-black/10 dark:border-white/10" />,

  // Tables (from remark-gfm)
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full border-collapse border border-black/10 dark:border-white/10">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-black/5 dark:bg-white/5">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-black/10 dark:border-white/10">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold border border-black/10 dark:border-white/10">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 text-sm border border-black/10 dark:border-white/10">{children}</td>,
}

/**
 * MarkdownDisplay component - renders markdown text using react-markdown
 */
export function MarkdownDisplay({ content, className = "" }: MarkdownDisplayProps) {
  return (
    <div
      className={`text-black dark:text-white font-normal leading-relaxed min-w-0 max-w-full overflow-hidden ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
