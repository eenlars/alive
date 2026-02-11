// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ChatEmptyState } from "../ChatEmptyState"

describe("ChatEmptyState", () => {
  it("shows no-project state with GitHub CTA when workspace is missing", () => {
    const onImportGithub = vi.fn()
    const onSelectSite = vi.fn()

    render(
      <ChatEmptyState
        workspace={null}
        totalDomainCount={2}
        isLoading={false}
        onTemplatesClick={() => {}}
        onImportGithub={onImportGithub}
        onSelectSite={onSelectSite}
      />,
    )

    expect(screen.getByText("No project selected.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Open from GitHub" }))
    expect(onImportGithub).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Select a site" }))
    expect(onSelectSite).toHaveBeenCalledTimes(1)
  })

  it("shows template and github options when user has no sites", () => {
    render(
      <ChatEmptyState
        workspace={null}
        totalDomainCount={0}
        isLoading={false}
        onTemplatesClick={() => {}}
        onImportGithub={() => {}}
      />,
    )

    expect(screen.getByText("No project selected yet.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open from GitHub" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Launch a template" })).toBeTruthy()
  })

  it("shows regular workspace empty state when workspace is selected", () => {
    render(
      <ChatEmptyState
        workspace="example.com"
        totalDomainCount={3}
        isLoading={false}
        onTemplatesClick={() => {}}
        onImportGithub={() => {}}
      />,
    )

    expect(screen.getByText("What's next?")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Open from GitHub" })).toBeNull()
  })
})
