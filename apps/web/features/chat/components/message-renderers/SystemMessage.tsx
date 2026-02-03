import type { SDKSystemMessage } from "@anthropic-ai/claude-agent-sdk"
import { cn } from "@/lib/utils"
import { semiVisibleText } from "./styles"

interface SystemMessageProps {
  content: SDKSystemMessage
}

export function SystemMessage({ content }: SystemMessageProps) {
  // Note: Only rendered in debug mode (filtered by shouldRenderMessage)
  return (
    <article className={cn("py-2 mb-4 text-sm", semiVisibleText)}>
      <h3 className="mb-1.5 font-medium normal-case tracking-normal">System Initialized</h3>
      <dl className="space-y-1 text-xs font-normal normal-case tracking-normal">
        <div>
          <dt className="inline font-medium">Model:</dt>
          <dd className="inline ml-1">{content.model}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Directory:</dt>
          <dd className="inline ml-1">{content.cwd}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Tools:</dt>
          <dd className="inline ml-1">{content.tools?.length || 0} available</dd>
        </div>
        {content.claude_code_version && (
          <div>
            <dt className="inline font-medium">Version:</dt>
            <dd className="inline ml-1">{content.claude_code_version}</dd>
          </div>
        )}
      </dl>
    </article>
  )
}
