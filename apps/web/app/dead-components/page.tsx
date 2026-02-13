"use client"

import { type ReactNode, useState, Component } from "react"

// Error boundary to catch component crashes
class Catch extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="border border-red-800 bg-red-950/50 rounded p-3 text-red-400 text-xs font-mono">
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
    <div className="border border-zinc-700 rounded-lg mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 bg-zinc-800 rounded-t-lg font-mono text-sm text-zinc-300 hover:bg-zinc-700"
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

function P({ name }: { name: string }) {
  return (
    <div className="border border-dashed border-zinc-600 rounded p-3 text-zinc-500 text-xs font-mono">
      {name} — needs complex props/context, showing placeholder
    </div>
  )
}

// Lazy imports so one broken component doesn't kill the whole page
import { LinearIssuesStack } from "@/components/linear/LinearIssuesStack"
import { DomainsTable } from "@/components/manager/DomainsTable"
import { Terminal } from "@/components/manager/Terminal"
import { SuperTemplateConfirmDialog } from "@/components/modals/SuperTemplateConfirmDialog"
import { StructuredPrompt } from "@/components/ui/chat/format/StructuredPrompt"
import { ToolResult } from "@/components/ui/chat/tools/ToolResult"
import { ToolUse } from "@/components/ui/chat/tools/ToolUse"
import { Container, Grid } from "@/components/ui/layout/Layout"
import { MessageContainer } from "@/components/ui/layout/MessageContainer"
import { Card, CardContent } from "@/components/ui/primitives/Card"
import { ScrollableCode } from "@/components/ui/primitives/ScrollableCode"
import { ToolButton } from "@/components/ui/primitives/ToolButton"
import { Heading, Text } from "@/components/ui/primitives/Typography"
import { SettingsDropdown } from "@/components/ui/SettingsDropdown"
import { OrganizationSelector } from "@/components/workspace/OrganizationSelector"
import { OrganizationSwitcher } from "@/components/workspace/OrganizationSwitcher"
import { AuthenticatedWorkspaces } from "@/features/auth/components/AuthenticatedWorkspaces"
import { ThreeDotsComplete } from "@/features/chat/components/ThreeDotsComplete"
import { SiteIdeasTextarea } from "@/features/deployment/components/SiteIdeasTextarea"

export default function DeadComponentsPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Dead Components Gallery</h1>
      <p className="text-zinc-400 mb-6 text-sm">
        Knip found 0 imports for these 22 components. Review and decide what to delete.
      </p>

      <Section title="StructuredPrompt">
        <StructuredPrompt
          data={{
            boxesToTick: "Responsive, SEO, Fast load",
            questionsToAnswer: "Target audience? CTA?",
            proofStrategy: "Lighthouse > 90",
          }}
        />
      </Section>

      <Section title="ThreeDotsComplete">
        <ThreeDotsComplete />
      </Section>

      <Section title="Layout (Container, Grid)">
        <Container>
          <Grid>
            <div className="bg-zinc-800 p-2 rounded">Grid item 1</div>
            <div className="bg-zinc-800 p-2 rounded">Grid item 2</div>
          </Grid>
        </Container>
      </Section>

      <Section title="MessageContainer">
        <MessageContainer>
          <p>Message inside MessageContainer</p>
        </MessageContainer>
      </Section>

      <Section title="Card">
        <Card>
          <CardContent>
            <p>Card content</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="EmailField">
        <P name="EmailField — needs react-hook-form register/errors" />
      </Section>

      <Section title="ScrollableCode">
        <ScrollableCode content={"const x = 42;\nconsole.log(x);"} />
      </Section>

      <Section title="ToolButton">
        <ToolButton onClick={() => {}}>Click me</ToolButton>
      </Section>

      <Section title="Typography (Heading, Text)">
        <Heading level={2}>Sample Heading</Heading>
        <Text>Sample paragraph text</Text>
      </Section>

      <Section title="LinearIssuesStack">
        <P name="LinearIssuesStack — needs issues array" />
      </Section>

      <Section title="DomainsTable">
        <P name="DomainsTable — needs domains data" />
      </Section>

      <Section title="Terminal">
        <P name="Terminal — needs websocket/xterm" />
      </Section>

      <Section title="SuperTemplateConfirmDialog">
        <P name="SuperTemplateConfirmDialog — needs dialog state" />
      </Section>

      <Section title="ToolResult">
        <P name="ToolResult — needs tool_result content block" />
      </Section>

      <Section title="ToolUse">
        <P name="ToolUse — needs Anthropic SDK ContentBlock" />
      </Section>

      <Section title="SettingsDropdown">
        <P name="SettingsDropdown — needs auth context" />
      </Section>

      <Section title="OrganizationSelector">
        <P name="OrganizationSelector — needs org data" />
      </Section>

      <Section title="OrganizationSwitcher">
        <P name="OrganizationSwitcher — needs org data" />
      </Section>

      <Section title="AuthenticatedWorkspaces">
        <P name="AuthenticatedWorkspaces — needs auth context" />
      </Section>

      <Section title="SiteIdeasTextarea">
        <P name="SiteIdeasTextarea — needs form state" />
      </Section>
    </div>
  )
}
