import { describe, expect, it } from "vitest"

import { bondEligibility } from "@/domain/planner/bond"

const maren = { entityId: "maren", bondTier: 1, lineageKey: "warlock" }

function tuple(pcId: string, day: number, npcId = "maren") {
  return { npcId, pcId, day }
}

describe("bondEligibility (D8 — one per PC per day, flat threshold 3)", () => {
  it("three activities across three distinct PC-days ⇒ eligible", () => {
    const [result] = bondEligibility(
      [maren],
      [tuple("ren", 1), tuple("ren", 2), tuple("yuki", 2)]
    )
    expect(result).toEqual({
      npcId: "maren",
      currentTier: 1,
      nextTier: 2,
      progress: 3,
      eligible: true,
    })
  })

  it("three same-evening activities by three PCs count once each ⇒ eligible", () => {
    const [result] = bondEligibility(
      [maren],
      [tuple("ren", 5), tuple("yuki", 5), tuple("io", 5)]
    )
    expect(result!.progress).toBe(3)
    expect(result!.eligible).toBe(true)
  })

  it("a single PC's two same-day activities count once ⇒ not eligible", () => {
    const [result] = bondEligibility(
      [maren],
      [tuple("ren", 5), tuple("ren", 5), tuple("ren", 6)]
    )
    expect(result!.progress).toBe(2)
    expect(result!.eligible).toBe(false)
  })

  it("a maxed bond (tier 4) is never eligible and nextTier stays clamped", () => {
    const [result] = bondEligibility(
      [{ ...maren, bondTier: 4 }],
      [tuple("ren", 1), tuple("yuki", 2), tuple("io", 3)]
    )
    expect(result!.eligible).toBe(false)
    expect(result!.nextTier).toBe(4)
  })

  it("a Lineage-less NPC is excluded entirely", () => {
    expect(
      bondEligibility(
        [{ ...maren, lineageKey: null }],
        [tuple("ren", 1), tuple("yuki", 2), tuple("io", 3)]
      )
    ).toEqual([])
  })

  it("tuples are attributed per NPC", () => {
    const results = bondEligibility(
      [maren, { entityId: "silas", bondTier: 0, lineageKey: "thief" }],
      [
        tuple("ren", 1),
        tuple("ren", 2),
        tuple("ren", 3),
        tuple("ren", 1, "silas"),
      ]
    )
    expect(results.find((r) => r.npcId === "maren")!.eligible).toBe(true)
    expect(results.find((r) => r.npcId === "silas")).toMatchObject({
      progress: 1,
      eligible: false,
      nextTier: 1,
    })
  })

  it("zero activities ⇒ zero progress, not eligible", () => {
    expect(bondEligibility([maren], [])[0]).toMatchObject({
      progress: 0,
      eligible: false,
    })
  })
})
