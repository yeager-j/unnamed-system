// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type {
  SetPieceOccupant,
  ZoneSetPieceView,
} from "@/domain/map/view/set-piece-view"

import { ZoneSetPiece } from "./zone-set-piece"

afterEach(cleanup)

const occ = (key: string): SetPieceOccupant => ({
  key,
  name: key,
  initials: key.slice(0, 2).toUpperCase(),
  portraitUrl: null,
  faction: "party",
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
