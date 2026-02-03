"use client"

import { Badge } from "@/components/ui/badge"

export function BadgePreview() {
  return (
    <div className="space-y-8">
      {/* Variants */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Variants</h3>
        <div className="flex flex-wrap gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>

      {/* Use Cases */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Common Use Cases</h3>
        <div className="flex flex-wrap gap-3">
          <Badge>New</Badge>
          <Badge variant="secondary">Beta</Badge>
          <Badge variant="outline">v2.0.0</Badge>
          <Badge variant="destructive">Deprecated</Badge>
        </div>
      </section>

      {/* Status Badges */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Status Indicators</h3>
        <div className="flex flex-wrap gap-3">
          <Badge className="bg-green-600 dark:bg-green-600 border-transparent">Active</Badge>
          <Badge className="bg-yellow-500 dark:bg-yellow-500 border-transparent text-black">Pending</Badge>
          <Badge className="bg-red-600 dark:bg-red-600 border-transparent">Inactive</Badge>
          <Badge className="bg-blue-600 dark:bg-blue-600 border-transparent">Processing</Badge>
        </div>
      </section>

      {/* In Context */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">In Context</h3>
        <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-black/10 dark:border-white/10 max-w-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-black dark:text-white">Pro Plan</h4>
            <Badge>Popular</Badge>
          </div>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">The most popular plan for growing teams.</p>
        </div>
      </section>
    </div>
  )
}
