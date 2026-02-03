// @vitest-environment happy-dom
// TODO: Fix react/jsx-dev-runtime resolution issue in vitest 4.x with happy-dom
// Temporarily skipped due to Vite import resolution failure
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

/**
 * Minimal PhotoMenu stub that replicates the click-outside behavior.
 * Tests the core bug: clicking inside mobile sheet should NOT close menu.
 */
function PhotoMenuClickOutsideTest({
  isOpen,
  onClose,
  includeMobileRef,
}: {
  isOpen: boolean
  onClose: () => void
  includeMobileRef: boolean
}) {
  const menuRef = { current: null as HTMLDivElement | null }
  const mobileSheetRef = { current: null as HTMLDivElement | null }

  // Simulate the click-outside handler from PhotoMenu
  const handleClickOutside = (event: React.MouseEvent) => {
    const target = event.target as Node

    const clickedDesktopMenu = menuRef.current?.contains(target)
    const clickedMobileSheet = includeMobileRef ? mobileSheetRef.current?.contains(target) : false

    if (!clickedDesktopMenu && !clickedMobileSheet) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Test component simulating click-outside behavior
    <div data-testid="container" onMouseDown={handleClickOutside}>
      {/* Mobile bottom sheet */}
      <div data-testid="mobile-sheet" ref={includeMobileRef ? mobileSheetRef : undefined}>
        <button type="button" data-testid="upload-button">
          Add photos
        </button>
      </div>

      {/* Desktop dropdown */}
      <div data-testid="desktop-menu" ref={menuRef}>
        <button type="button">Desktop upload</button>
      </div>
    </div>
  )
}

// TODO: Fix react/jsx-dev-runtime resolution issue in vitest 4.x with happy-dom
describe.skip("PhotoMenu click-outside behavior", () => {
  it("should NOT close when clicking upload button inside mobile sheet", () => {
    const onClose = vi.fn()

    render(<PhotoMenuClickOutsideTest isOpen={true} onClose={onClose} includeMobileRef={true} />)

    const uploadButton = screen.getByTestId("upload-button")
    fireEvent.mouseDown(uploadButton)

    expect(onClose).not.toHaveBeenCalled()
  })

  it("BUG REPRO: closes when mobileSheetRef is missing (the original bug)", () => {
    const onClose = vi.fn()

    // This simulates the bug: mobileSheetRef not included in click-outside check
    render(<PhotoMenuClickOutsideTest isOpen={true} onClose={onClose} includeMobileRef={false} />)

    const uploadButton = screen.getByTestId("upload-button")
    fireEvent.mouseDown(uploadButton)

    // With the bug, clicking inside mobile sheet triggers onClose
    expect(onClose).toHaveBeenCalled()
  })

  it("should close when clicking outside both menus", () => {
    const onClose = vi.fn()

    render(<PhotoMenuClickOutsideTest isOpen={true} onClose={onClose} includeMobileRef={true} />)

    const container = screen.getByTestId("container")
    fireEvent.mouseDown(container)

    expect(onClose).toHaveBeenCalled()
  })
})
