import { NextResponse } from "next/server"
import { getGroqClient } from "@/lib/clients/groq"

/**
 * GET /api/manager/status
 * Check status of external services (Groq API, etc.)
 */
export async function GET() {
  const results: Array<{
    service: string
    status: "operational" | "degraded" | "down"
    message: string
    latency?: number
  }> = []

  // Check Groq API
  const groqStart = Date.now()
  try {
    const groq = await getGroqClient()
    await groq.chat.completions.create({
      messages: [{ role: "user", content: "test" }],
      model: "openai/gpt-oss-20b",
      max_completion_tokens: 1,
    })
    const groqLatency = Date.now() - groqStart
    results.push({
      service: "Groq API",
      status: "operational",
      message: "Safety checks working",
      latency: groqLatency,
    })
  } catch (error: any) {
    const groqLatency = Date.now() - groqStart
    results.push({
      service: "Groq API",
      status: "down",
      message: `Safety checks failing: ${error.message || "Unknown error"}`,
      latency: groqLatency,
    })
  }

  return NextResponse.json({
    ok: true,
    services: results,
    timestamp: new Date().toISOString(),
  })
}
