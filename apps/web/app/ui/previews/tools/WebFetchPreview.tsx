"use client"

import { WebFetchInput } from "@/components/ui/chat/tools/webfetch/WebFetchInput"
import { WebFetchOutput } from "@/components/ui/chat/tools/webfetch/WebFetchOutput"

export function WebFetchPreview() {
  return (
    <div className="space-y-8">
      <p className="text-sm text-black/50 dark:text-white/50">Minimized by default. Click to expand details.</p>

      {/* Input States */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Input - Collapsed (Default)</h3>
        <div className="max-w-lg">
          <WebFetchInput url="https://docs.anthropic.com/claude/docs/intro" prompt="Summarize the main capabilities" />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Input - GitHub URL</h3>
        <div className="max-w-lg">
          <WebFetchInput
            url="https://github.com/anthropics/claude-code/blob/main/README.md"
            prompt="Get the installation instructions and key features from this README"
          />
        </div>
      </section>

      {/* Output States */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Output - Success (Collapsed)</h3>
        <div className="max-w-lg">
          <WebFetchOutput
            url="https://example.com/api/docs"
            content={`# API Documentation

## Authentication
All API requests require an API key passed in the Authorization header.

## Endpoints

### GET /users
Returns a list of users.

### POST /users
Creates a new user.`}
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Output - Long Content</h3>
        <div className="max-w-lg">
          <WebFetchOutput
            url="https://en.wikipedia.org/wiki/Artificial_intelligence"
            content={`Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to natural intelligence displayed by animals including humans.

AI applications include:
- Advanced web search engines (Google Search)
- Recommendation systems (YouTube, Amazon, Netflix)
- Understanding human speech (Siri, Alexa)
- Self-driving cars (Waymo)
- Generative tools (ChatGPT, AI art)

${"The field of AI research was founded at a workshop at Dartmouth College in 1956. ".repeat(20)}`}
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Output - Error</h3>
        <div className="max-w-lg">
          <WebFetchOutput url="https://invalid-domain-12345.com" error="ENOTFOUND invalid-domain-12345.com" />
        </div>
      </section>
    </div>
  )
}
