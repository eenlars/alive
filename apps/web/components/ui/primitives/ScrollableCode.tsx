interface ScrollableCodeProps {
  content: string
  className?: string
}

export function ScrollableCode({ content, className = "" }: ScrollableCodeProps) {
  return (
    <div className={`mt-1 max-w-full overflow-hidden ${className}`}>
      <pre className="text-xs text-gray-500 dark:text-gray-400 font-diatype-mono leading-tight overflow-auto max-h-80 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        {content}
      </pre>
    </div>
  )
}
