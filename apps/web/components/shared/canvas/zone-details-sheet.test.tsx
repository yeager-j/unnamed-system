// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MapAuthoringOptions } from "./map-canvas-context"
import { ZoneDetailsSheet } from "./zone-details-sheet"

// jsdom has no matchMedia; the sheet's ResponsiveDialog reads it via use-mobile.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

afterEach(cleanup)

// Typed structurally — this tier is engine-gated (no @workspace/game* imports).
const zone = {
  id: "z1",
  name: "Gatehouse",
  description: "",
  dmNotes: "",
  position: { x: 0, y: 0 },
  pageId: "default",
}

const authoring: MapAuthoringOptions = {
  templateKeys: [
    { key: "castle-entrance", label: "Castle Entrance", setName: "Castle Set" },
  ],
  maps: [{ id: "map-2", name: "The Undercroft" }],
}

const baseProps = {
  zone,
  onClose: vi.fn(),
  onRename: vi.fn(),
  onSetText: vi.fn(),
  onSetIdentity: vi.fn(),
}

/** The UNN-590 Generation section: authoring-gated, dispatching binding patches. */
describe("ZoneDetailsSheet — Generation section (UNN-590)", () => {
  it("hides the section entirely without authoring options (the console's Edit board)", () => {
    render(<ZoneDetailsSheet {...baseProps} />)
    expect(screen.queryByText("Template")).toBeNull()
    expect(screen.queryByText("Entry zone")).toBeNull()
  })

  it("mounts both pickers when authoring options are present", () => {
    render(
      <ZoneDetailsSheet
        {...baseProps}
        authoring={authoring}
        onSetBinding={vi.fn()}
        onSetEntryZone={vi.fn()}
      />
    )
    expect(
      screen.getByRole("combobox", { name: "Template binding" })
    ).toBeDefined()
    expect(
      screen.getByRole("combobox", { name: "Portal target Map" })
    ).toBeDefined()
  })

  it("toggling roll-contents dispatches true, and off clears with null", () => {
    const onSetBinding = vi.fn()
    render(
      <ZoneDetailsSheet
        {...baseProps}
        authoring={authoring}
        onSetBinding={onSetBinding}
        onSetEntryZone={vi.fn()}
      />
    )
    const toggle = screen.getByRole("switch", {
      name: /Roll contents at start/,
    })
    fireEvent.click(toggle)
    expect(onSetBinding).toHaveBeenLastCalledWith("z1", {
      rollContentsAtStart: true,
    })
    fireEvent.click(toggle)
    expect(onSetBinding).toHaveBeenLastCalledWith("z1", {
      rollContentsAtStart: null,
    })
  })

  it("the entry-zone switch reflects the geometry designation and toggles it off", () => {
    const onSetEntryZone = vi.fn()
    render(
      <ZoneDetailsSheet
        {...baseProps}
        authoring={authoring}
        entryZoneId="z1"
        onSetBinding={vi.fn()}
        onSetEntryZone={onSetEntryZone}
      />
    )
    const toggle = screen.getByRole("switch", { name: /Entry zone/ })
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(toggle)
    expect(onSetEntryZone).toHaveBeenCalledWith(null)
  })

  it("the entry-zone switch turns on for a non-entry zone", () => {
    const onSetEntryZone = vi.fn()
    render(
      <ZoneDetailsSheet
        {...baseProps}
        authoring={authoring}
        entryZoneId="other-zone"
        onSetBinding={vi.fn()}
        onSetEntryZone={onSetEntryZone}
      />
    )
    const toggle = screen.getByRole("switch", { name: /Entry zone/ })
    expect(toggle.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(toggle)
    expect(onSetEntryZone).toHaveBeenCalledWith("z1")
  })
})
