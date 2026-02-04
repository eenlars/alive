"use client"

import type React from "react"
import { createContext, useContext, useState } from "react"

interface TabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

export function Tabs({
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  className = "",
  children,
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const value = controlledValue ?? uncontrolledValue
  const handleValueChange = onValueChange ?? setUncontrolledValue

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={`w-full ${className}`}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 border-b border-black/10 dark:border-white/10 ${className}`}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className = "",
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  if (!context) throw new Error("TabsTrigger must be used within Tabs")

  const isActive = context.value === value

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`tab-panel-${value}`}
      id={`tab-${value}`}
      className={`relative px-6 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 ${
        isActive
          ? "text-black dark:text-white border-b-2 border-black dark:border-white"
          : "text-black/60 dark:text-white/60 border-b-2 border-transparent hover:text-black/80 dark:hover:text-white/80"
      } ${className}`}
      onClick={() => context.onValueChange(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  children,
  className = "",
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  if (!context) throw new Error("TabsContent must be used within Tabs")

  if (context.value !== value) return null

  return (
    <div role="tabpanel" id={`tab-panel-${value}`} aria-labelledby={`tab-${value}`} className={`mt-2 ${className}`}>
      {children}
    </div>
  )
}
