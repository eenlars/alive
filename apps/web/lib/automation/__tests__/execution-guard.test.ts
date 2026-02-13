import { describe, expect, it } from "vitest"
import { getAutomationExecutionGate } from "../execution-guard"

describe("automation execution gate", () => {
  it("allows execution only on production alive.best", () => {
    const gate = getAutomationExecutionGate({
      streamEnv: "production",
      mainDomain: "alive.best",
    })

    expect(gate.allowed).toBe(true)
  })

  it("blocks non-production environments", () => {
    const gate = getAutomationExecutionGate({
      streamEnv: "staging",
      mainDomain: "alive.best",
    })

    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain("STREAM_ENV")
  })

  it("blocks non-primary domains even in production", () => {
    const gate = getAutomationExecutionGate({
      streamEnv: "production",
      mainDomain: "sonno.tech",
    })

    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain("disabled")
  })
})
