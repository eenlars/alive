import { getComplexityColor, getComplexityLabel } from "../../lib/template-utils"

interface FrontmatterCardProps {
  data: Record<string, unknown>
}

export function FrontmatterCard({ data }: FrontmatterCardProps) {
  const renderValue = (key: string, value: unknown) => {
    if (Array.isArray(value)) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded text-xs ${
                key === "requires"
                  ? "bg-yellow-500/20 text-yellow-300"
                  : key === "dependencies"
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-shell-border text-shell-text"
              }`}
            >
              {String(item)}
            </span>
          ))}
        </div>
      )
    }
    if (key === "complexity") {
      return (
        <span className={`font-medium ${getComplexityColor(value as string | number)}`}>
          {getComplexityLabel(value as string | number)}
        </span>
      )
    }
    if (key === "available") {
      return (
        <span className={String(value) === "true" ? "text-green-400" : "text-red-400"}>
          {String(value) === "true" ? "Yes" : "No"}
        </span>
      )
    }
    return <span className="text-shell-text">{String(value)}</span>
  }

  // Priority order for display
  const priorityKeys = [
    "name",
    "description",
    "category",
    "complexity",
    "estimatedTime",
    "dependencies",
    "requires",
    "tags",
  ]
  const sortedEntries = Object.entries(data).sort(([a], [b]) => {
    const aIdx = priorityKeys.indexOf(a)
    const bIdx = priorityKeys.indexOf(b)
    if (aIdx === -1 && bIdx === -1) return 0
    if (aIdx === -1) return 1
    if (bIdx === -1) return -1
    return aIdx - bIdx
  })

  return (
    <div className="bg-shell-surface border border-shell-border rounded-lg p-4 mb-6">
      <div className="grid gap-3">
        {sortedEntries.map(([key, value]) => {
          // Skip empty values
          if (value === "" || (Array.isArray(value) && value.length === 0)) return null

          // Name gets special treatment as header
          if (key === "name") {
            return (
              <div key={key} className="border-b border-shell-border pb-3 mb-1">
                <h2 className="text-xl font-semibold text-white m-0">{String(value)}</h2>
              </div>
            )
          }

          // Description as subtitle
          if (key === "description") {
            return (
              <p key={key} className="text-shell-text-muted text-sm m-0 -mt-2 mb-2">
                {String(value)}
              </p>
            )
          }

          return (
            <div key={key} className="flex items-start gap-3">
              <span className="text-shell-text-muted text-xs uppercase tracking-wide min-w-24 pt-0.5">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
              {renderValue(key, value)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
