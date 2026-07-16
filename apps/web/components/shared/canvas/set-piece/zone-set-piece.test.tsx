// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type {
  SetPieceOccupant,
  ZoneSetPieceView,
} from "@/domain/map/view/set-piece-view"

import { ZoneSetPiece } from "./zone-set-piece"

afterEach(cleanup)

const occ = (
  key: string,
  faction: SetPieceOccupant["faction"] = "party"
): SetPieceOccupant => ({
  key,
  name: key,
  initials: key.slice(0, 2).toUpperCase(),
  portraitUrl: null,
  faction,
  owned: false,
})

const view = (occupants: SetPieceOccupant[]): ZoneSetPieceView => ({
  name: "The Ossuary",
  description: "Shelved skulls watch from every wall.",
  size: "M",
  reveal: "revealed",
  party: false,
  hop: null,
  occupants,
  summary: `${occupants.length} here`,
})

/** A sentinel roster node so the test can tell the full-token branch from the
 *  degraded (condensed stack) branch by DOM presence alone. */
const FULL_ROSTER = <div data-testid="full-roster" />

/**
 * AC 2 — the five reachable DM states must read as distinct **border × fill ×
 * glyph/text**, never color alone. jsdom returns CSS-module classes as their own
 * name, so the card root's className carries the channel classes verbatim; the
 * visible state line rides `aria-describedby`. (Party-unmapped is unreachable — the
 * party is only ever in a revealed zone — so it's the sixth cell we omit.)
 */
describe("ZoneSetPiece DM state matrix (§D6, AC 2)", () => {
  type Signature = {
    border: "solid" | "dashed"
    fill: "lit" | "flat"
    stake: "party" | "none"
    stateLine: string
  }

  const signatureOf = (v: ZoneSetPieceView): Signature => {
    const { container } = render(<ZoneSetPiece view={v} />)
    const root = container.querySelector<HTMLElement>('[aria-label^="Zone:"]')!
    const cls = root.className
    return {
      border: cls.includes("unmapped") ? "dashed" : "solid",
      fill: cls.includes("occupied") ? "lit" : "flat",
      stake: cls.includes("party") ? "party" : "none",
      stateLine: container.querySelector(".sr-only")?.textContent ?? "",
    }
  }

  const base = (over: Partial<ZoneSetPieceView>): ZoneSetPieceView => ({
    ...view([]),
    ...over,
  })

  const cells = {
    emptyRevealed: base({ reveal: "revealed", occupants: [], summary: "" }),
    emptyUnmapped: base({ reveal: "unmapped", occupants: [], summary: "" }),
    hostileRevealed: base({
      reveal: "revealed",
      occupants: [occ("g1", "hostile"), occ("g2", "hostile")],
      summary: "2 hostiles",
    }),
    hostileUnmapped: base({
      reveal: "unmapped",
      occupants: [occ("g1", "hostile"), occ("g2", "hostile")],
      summary: "2 hostiles",
    }),
    partyRevealed: base({
      reveal: "revealed",
      party: true,
      occupants: [occ("p1"), occ("p2")],
      summary: "2 here",
    }),
  }

  it("renders all five states with a distinct border×fill×glyph/text signature", () => {
    const signatures = Object.values(cells).map((v) =>
      JSON.stringify(signatureOf(v))
    )
    expect(new Set(signatures).size).toBe(5)
  })

  it("encodes reveal on the border + a spoken 'Hidden' line, never color alone", () => {
    expect(signatureOf(cells.emptyUnmapped)).toMatchObject({ border: "dashed" })
    expect(signatureOf(cells.emptyUnmapped).stateLine).toContain(
      "Hidden from players"
    )
    expect(signatureOf(cells.emptyRevealed)).toMatchObject({ border: "solid" })
  })

  it("encodes occupancy on the fill and the party stake on the keyline", () => {
    expect(signatureOf(cells.hostileRevealed)).toMatchObject({
      fill: "lit",
      stake: "none",
    })
    expect(signatureOf(cells.partyRevealed)).toMatchObject({
      fill: "lit",
      stake: "party",
    })
    expect(signatureOf(cells.emptyRevealed)).toMatchObject({ fill: "flat" })
  })
})

describe("ZoneSetPiece crowded-zone degradation (§D7)", () => {
  it("degrades to the condensed stack + Open roster when over capacity", () => {
    // 5 occupants in an M room (cap 4) with an inspector to send the DM to.
    render(
      <ZoneSetPiece
        view={view([occ("a"), occ("b"), occ("c"), occ("d"), occ("e")])}
        closeupRoster={FULL_ROSTER}
        onOpenRoster={() => {}}
      />
    )
    expect(screen.getByRole("button", { name: "Open roster" })).toBeTruthy()
    expect(screen.queryByTestId("full-roster")).toBeNull()
  })

  it("renders full tokens when the roster fits capacity", () => {
    render(
      <ZoneSetPiece
        view={view([occ("a"), occ("b")])}
        closeupRoster={FULL_ROSTER}
        onOpenRoster={() => {}}
      />
    )
    expect(screen.queryByRole("button", { name: "Open roster" })).toBeNull()
    expect(screen.getByTestId("full-roster")).toBeTruthy()
  })

  it("never degrades without an inspector (the template editor keeps full tokens)", () => {
    render(
      <ZoneSetPiece
        view={view([occ("a"), occ("b"), occ("c"), occ("d"), occ("e")])}
        closeupRoster={FULL_ROSTER}
      />
    )
    expect(screen.queryByRole("button", { name: "Open roster" })).toBeNull()
    expect(screen.getByTestId("full-roster")).toBeTruthy()
  })
})
