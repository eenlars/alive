/**
 * UI Component Preview Page
 *
 * A Storybook-like component library for previewing all UI components.
 * Only accessible to superadmins (users in SUPERADMIN_EMAILS env var).
 *
 * Categories: Primitives, General, Tools, Integrations
 */

"use client"

import {
  Boxes,
  ChevronDown,
  CreditCard,
  Layout,
  LayoutList,
  Loader2,
  Mail,
  Menu,
  Sparkles,
  Terminal,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useAdminUser } from "@/hooks/use-superadmin"
import { AutomationConfigPreview } from "./previews/AutomationConfigPreview"
import { ClarificationQuestionsPreview } from "./previews/ClarificationQuestionsPreview"
import { EmptyStatePreview } from "./previews/general/EmptyStatePreview"
import { LoadingSpinnerPreview } from "./previews/general/LoadingSpinnerPreview"
// General UI
import { ModalPreview } from "./previews/general/ModalPreview"
import { SearchInputPreview } from "./previews/general/SearchInputPreview"
import { TabsPreview } from "./previews/general/TabsPreview"
import { TogglePreview } from "./previews/general/TogglePreview"
import { LinearCommentPreview } from "./previews/LinearCommentPreview"
import { LinearIssuePreview } from "./previews/LinearIssuePreview"
import { LinearIssuesPreview } from "./previews/LinearIssuesPreview"
// Integrations
import { MailSendPreview } from "./previews/MailSendPreview"
import { AlertPreview } from "./previews/primitives/AlertPreview"
import { BadgePreview } from "./previews/primitives/BadgePreview"
// Primitives
import { ButtonPreview } from "./previews/primitives/ButtonPreview"
import { CardPreview } from "./previews/primitives/CardPreview"
import { InputPreview } from "./previews/primitives/InputPreview"
import { StripeAccountPreview } from "./previews/StripeAccountPreview"
import { StripeCustomersPreview } from "./previews/StripeCustomersPreview"
import { BashOutputPreview } from "./previews/tools/BashOutputPreview"
import { EditOutputPreview } from "./previews/tools/EditOutputPreview"
import { GlobOutputPreview } from "./previews/tools/GlobOutputPreview"
import { GrepOutputPreview } from "./previews/tools/GrepOutputPreview"
// Tool Outputs
import { ReadOutputPreview } from "./previews/tools/ReadOutputPreview"
import { WebFetchPreview } from "./previews/tools/WebFetchPreview"
import { WriteOutputPreview } from "./previews/tools/WriteOutputPreview"
import { WebsiteConfigPreview } from "./previews/WebsiteConfigPreview"

// Category and component definitions
const CATEGORIES = {
  primitives: {
    id: "primitives",
    name: "Primitives",
    icon: Boxes,
    components: {
      button: { id: "button", name: "Button", component: ButtonPreview },
      input: { id: "input", name: "Input", component: InputPreview },
      card: { id: "card", name: "Card", component: CardPreview },
      badge: { id: "badge", name: "Badge", component: BadgePreview },
      alert: { id: "alert", name: "Alert", component: AlertPreview },
    },
  },
  general: {
    id: "general",
    name: "General",
    icon: Layout,
    components: {
      modal: { id: "modal", name: "Modal", component: ModalPreview },
      toggle: { id: "toggle", name: "Toggle", component: TogglePreview },
      tabs: { id: "tabs", name: "Tabs", component: TabsPreview },
      search: { id: "search", name: "Search Input", component: SearchInputPreview },
      empty: { id: "empty", name: "Empty State", component: EmptyStatePreview },
      loading: { id: "loading", name: "Loading Spinner", component: LoadingSpinnerPreview },
    },
  },
  tools: {
    id: "tools",
    name: "Tools",
    icon: Terminal,
    components: {
      read: { id: "read", name: "Read Output", component: ReadOutputPreview },
      write: { id: "write", name: "Write Output", component: WriteOutputPreview },
      edit: { id: "edit", name: "Edit Output", component: EditOutputPreview },
      glob: { id: "glob", name: "Glob Output", component: GlobOutputPreview },
      grep: { id: "grep", name: "Grep Output", component: GrepOutputPreview },
      bash: { id: "bash", name: "Bash Output", component: BashOutputPreview },
      webfetch: { id: "webfetch", name: "WebFetch", component: WebFetchPreview },
    },
  },
  ai: {
    id: "ai",
    name: "AI",
    icon: Sparkles,
    components: {
      clarification: { id: "clarification", name: "Clarification Questions", component: ClarificationQuestionsPreview },
      websiteConfig: { id: "websiteConfig", name: "Website Config", component: WebsiteConfigPreview },
      automationConfig: { id: "automationConfig", name: "Automation Config", component: AutomationConfigPreview },
    },
  },
  mail: {
    id: "mail",
    name: "Mail",
    icon: Mail,
    components: {
      send: { id: "send", name: "Send Email", component: MailSendPreview },
    },
  },
  linear: {
    id: "linear",
    name: "Linear",
    icon: LayoutList,
    components: {
      issue: { id: "issue", name: "Issue", component: LinearIssuePreview },
      issues: { id: "issues", name: "Issues List", component: LinearIssuesPreview },
      comment: { id: "comment", name: "Comment", component: LinearCommentPreview },
    },
  },
  stripe: {
    id: "stripe",
    name: "Stripe",
    icon: CreditCard,
    components: {
      customers: { id: "customers", name: "Customers", component: StripeCustomersPreview },
      account: { id: "account", name: "Account", component: StripeAccountPreview },
    },
  },
} as const

type CategoryId = keyof typeof CATEGORIES

export default function PreviewUIPage() {
  const router = useRouter()
  const { loading, isSuperadmin } = useAdminUser()
  const [activeCategory, setActiveCategory] = useState<CategoryId>("primitives")
  const [activeComponent, setActiveComponent] = useState<string>("button")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // When category changes, select first component
  const handleCategoryChange = (categoryId: CategoryId) => {
    setActiveCategory(categoryId)
    const components = Object.keys(CATEGORIES[categoryId].components)
    setActiveComponent(components[0])
    setSidebarOpen(false) // Close sidebar on mobile after selection
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!isSuperadmin) {
    // Only redirect once, after loading is complete
    router.push("/")
    return null
  }

  const category = CATEGORIES[activeCategory]
  const components = category.components as Record<string, { id: string; name: string; component: React.ComponentType }>
  const CurrentPreview = components[activeComponent]?.component

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
            aria-label="Toggle menu"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-left">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">UI Library</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              {category.name}
              <ChevronDown className="w-3 h-3" />
            </p>
          </button>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      <button
        type="button"
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={e => e.key === "Escape" && setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
        aria-label="Close menu"
      />

      {/* Left Sidebar - Categories */}
      <aside
        className={`
          fixed md:relative top-0 left-0 bottom-0 z-50
          w-64 md:w-48 h-full md:h-auto
          border-r border-zinc-200 dark:border-zinc-800
          bg-white dark:bg-zinc-900
          flex-shrink-0 flex flex-col
          transition-transform duration-200 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Desktop header */}
        <div className="hidden md:block p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Components</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">UI Library</p>
        </div>

        {/* Mobile close button area */}
        <div className="md:hidden p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Categories</h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 -mr-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-2 space-y-1 overflow-y-auto flex-1">
          {Object.values(CATEGORIES).map(cat => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id as CategoryId)}
                className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg md:rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800"
                }`}
              >
                <Icon className="w-5 h-5 md:w-4 md:h-4 flex-shrink-0" />
                {cat.name}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Component Selection - Horizontal scroll on mobile */}
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 px-4 py-2 min-w-max">
              {Object.values(components).map(comp => {
                const isActive = activeComponent === comp.id
                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => setActiveComponent(comp.id)}
                    className={`px-3 py-2 md:py-1.5 rounded-lg md:rounded-md text-sm whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
                    }`}
                  >
                    {comp.name}
                  </button>
                )
              })}
            </div>
          </div>
        </header>

        {/* Preview Area */}
        <main className="flex-1 overflow-auto p-4 md:p-8">{CurrentPreview && <CurrentPreview />}</main>
      </div>
    </div>
  )
}
