// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { WatchExitStubs, type WatchZoneExit } from "./zone-node"

afterEach(cleanup)

/**
 * AC 3 (rendering half): a watch stub carries **no partner information** in the DOM
 * beyond its two scalars. The `WatchZoneExit` shape is `{ id, locked, side, offset }`
 * — no far-zone id, name, or geometry — so there is nothing to leak; this pins that
 * the rendered stub announces only "Unexplored exit" / "Locked exit" and exposes no
 * partner text.
 */
describe("WatchExitStubs — no partner information in the DOM (AC 3)", () => {
  const exit: WatchZoneExit = {
    id: "c1",
    locked: false,
    side: "e",
    offset: 0.4,
  }
  const lockedExit: WatchZoneExit = {
    id: "c2",
    locked: true,
    side: "s",
    offset: 0.6,
  }

  it("renders a lone notch labelled only as an unexplored/locked exit", () => {
    render(<WatchExitStubs exits={[exit, lockedExit]} size="M" />)
    expect(screen.getByLabelText("Unexplored exit")).toBeDefined()
    expect(screen.getByLabelText("Locked exit")).toBeDefined()
  })

  it("exposes no partner zone name or id text", () => {
    const { container } = render(
      <WatchExitStubs
        exits={[
          { id: "conn-to-the-nave", locked: false, side: "e", offset: 0.4 },
        ]}
        size="L"
      />
    )
    // The far zone's id/name is structurally absent from the payload, so it can't
    // appear in the DOM. No "⇢ Name" partner tag renders for a stub either.
    expect(container.textContent ?? "").not.toContain("conn-to-the-nave")
    expect(container.querySelector("[aria-label*='Threshold to']")).toBeNull()
    expect(container.textContent ?? "").not.toContain("⇢")
  })
})
