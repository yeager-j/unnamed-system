import { describe, expect, it } from "vitest"

import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

import { closeupFitsInCard, multiMemberClusterCount } from "./roster-capacity"

const occ = (key: string, engagementGroup?: number): SetPieceOccupant => ({
  key,
  name: key,
  initials: key.slice(0, 2).toUpperCase(),
  portraitUrl: null,
  faction: "party",
  owned: false,
  engagementGroup,
})

/** Two disjoint melee pairs: groups 0/0 and 1/1 — the AC 2 fixture. */
const twoDisjointPairs = [occ("a", 0), occ("b", 0), occ("c", 1), occ("d", 1)]

describe("multiMemberClusterCount", () => {
  it("counts distinct group ids, ignoring Free singletons", () => {
    expect(multiMemberClusterCount(twoDisjointPairs)).toBe(2)
    expect(multiMemberClusterCount([occ("a"), occ("b")])).toBe(0)
    expect(multiMemberClusterCount([occ("a", 0), occ("b", 0), occ("c")])).toBe(
      1
    )
  })
})

describe("closeupFitsInCard", () => {
  it("degrades two disjoint melee pairs in an M room (cap 2 < 4)", () => {
    // The whole point of P1c: the roster is decoupled from the footprint. Two
    // multi-member clusters spend 48 wu of header, so an M room that fits 4 lone
    // tokens can't fit the 4 in two engaged pairs — the crowded path must kick in.
    expect(closeupFitsInCard("M", twoDisjointPairs)).toBe(false)
  })

  it("fits four Free tokens in an M room (cap 4, no cluster overhead)", () => {
    const four = [occ("a"), occ("b"), occ("c"), occ("d")]
    expect(closeupFitsInCard("M", four)).toBe(true)
  })

  it("fits the same two pairs in an L room (cap survives the overhead)", () => {
    expect(closeupFitsInCard("L", twoDisjointPairs)).toBe(true)
  })

  it("degrades an over-cap crowd in a small room", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => occ(`x${i}`))
    expect(closeupFitsInCard("S", crowd)).toBe(false)
  })
})
