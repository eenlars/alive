"use client"

import dynamic from "next/dynamic"
import { Component, type ReactNode, useState } from "react"

// Error boundary — catches client-side render crashes
class Catch extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="border border-red-300 bg-red-50 rounded p-3 text-red-600 text-xs font-mono">
          {this.props.name} crashed: {this.state.error}
        </div>
      )
    }
    return this.props.children
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-zinc-200 rounded-lg mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 bg-zinc-50 rounded-t-lg font-mono text-sm text-zinc-600 hover:bg-zinc-100"
      >
        {open ? "\u25BC" : "\u25B6"} {title}
      </button>
      {open && (
        <div className="p-4 space-y-4">
          <Catch name={title}>{children}</Catch>
        </div>
      )}
    </div>
  )
}

// ---- Safe static imports ----
import { SettingsDropdown } from "@/components/ui/SettingsDropdown"

// ---- Static mocks for components that need network/auth ----
const TerminalLazy = dynamic(
  () =>
    Promise.resolve({
      default: () => (
        <div className="h-full bg-zinc-900 rounded font-mono text-sm text-green-400 p-3 overflow-hidden">
          <div className="text-zinc-500 mb-1">~ demo $</div>
          <div>Welcome to alive terminal</div>
          <div className="text-zinc-600 text-xs mt-2 italic">Static preview (no websocket in local mode)</div>
        </div>
      ),
    }),
  { ssr: false },
)
const OrganizationSwitcherLazy = dynamic(
  () =>
    Promise.resolve({
      default: () => (
        <div className="inline-flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 text-sm">
          <span className="font-medium">Acme Corp</span>
          <span className="text-zinc-400">/</span>
          <span className="text-zinc-500">Switch</span>
          <p className="text-xs text-zinc-400 ml-2 italic">(static preview)</p>
        </div>
      ),
    }),
  { ssr: false },
)
const LinearIssuesStackLazy = dynamic(
  () =>
    Promise.resolve({
      default: () => (
        <div className="space-y-2">
          <div className="px-3 py-2 bg-zinc-50 rounded border border-zinc-200 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span>Fix SSE reconnection logic</span>
          </div>
          <div className="px-3 py-2 bg-zinc-50 rounded border border-zinc-200 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Add workspace templates</span>
          </div>
          <p className="text-xs text-zinc-400 italic">Static preview (needs Linear OAuth)</p>
        </div>
      ),
    }),
  { ssr: false },
)

// ---- Demo wrappers for react-hook-form components ----

function EmailFieldDemo() {
  const [value, setValue] = useState("")
  return (
    <div className="max-w-md border border-zinc-200 rounded p-4 bg-zinc-50">
      <label htmlFor="demo-email" className="block text-base font-bold text-zinc-900 mb-2">
        Email address
      </label>
      <p className="text-sm text-zinc-500 mb-3 font-medium">
        We&apos;ll use this to help you recover your site if needed.
      </p>
      <div className="relative">
        <input
          id="demo-email"
          type="email"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-4 py-3 pl-10 rounded-lg border-2 border-zinc-300 bg-white text-zinc-900 outline-none"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">@</span>
      </div>
      <p className="text-xs text-zinc-500 mt-1 italic">Recreation (original requires react-hook-form)</p>
    </div>
  )
}

function SiteIdeasTextareaDemo() {
  const [value, setValue] = useState("")
  return (
    <div className="max-w-lg border border-zinc-200 rounded p-4 bg-zinc-50">
      <label htmlFor="demo-ideas" className="block text-sm font-semibold text-zinc-900 mb-2">
        What do you want to build?
      </label>
      <p className="text-xs text-zinc-500 mb-3">Describe your website ideas. Claude will use this to get started.</p>
      <textarea
        id="demo-ideas"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="e.g., Build a dark-themed portfolio website with smooth scroll animation..."
        rows={4}
        className="w-full px-4 py-3 rounded-lg border-2 border-zinc-300 bg-white text-zinc-900 outline-none resize-none"
      />
      <div className="flex justify-between text-xs text-zinc-500 mt-1">
        <span>{value.length}/5000</span>
        <span className="italic">Recreation (original requires react-hook-form)</span>
      </div>
    </div>
  )
}

export default function DeadComponentsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Dead Components — Need Review</h1>
      <p className="text-zinc-500 mb-6 text-sm">6 components to decide on. The rest are confirmed dead.</p>

      <Section title="SettingsDropdown — menu dropdown">
        <SettingsDropdown onNewTabGroup={() => {}} onOpenSettings={() => {}} currentWorkspace="demo.alive.best" />
      </Section>

      <Section title="EmailField — email input (react-hook-form)">
        <EmailFieldDemo />
      </Section>

      <Section title="SiteIdeasTextarea — deployment ideas input">
        <SiteIdeasTextareaDemo />
      </Section>

      <Section title="Terminal — xterm.js websocket terminal">
        <div className="h-48">
          <TerminalLazy />
        </div>
      </Section>

      <Section title="OrganizationSwitcher — org switcher">
        <OrganizationSwitcherLazy />
      </Section>

      <Section title="LinearIssuesStack — Linear issues list">
        <LinearIssuesStackLazy />
      </Section>
    </div>
  )
}
