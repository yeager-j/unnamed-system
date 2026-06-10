import { describe, expect, it } from "vitest"

import { reduceCombat } from "@workspace/game/engine/__fixtures__/encounter"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import {
  type Combatant,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

const SETUP: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "a" }, zoneId: "z" },
  { side: "enemies", ref: { kind: "pc", characterId: "b" }, zoneId: "z" },
  { side: "enemies", ref: { kind: "pc", characterId: "c" }, zoneId: "z" },
]

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

function session() {
  return createCombatSession(sequentialIds())(SETUP)
}

function engagementOf(s: CombatSession, id: string): Combatant["engagement"] {
  return s.combatants.find((c) => c.id === id)!.engagement
}

describe("reduceCombatSession — setEngagement", () => {
  it("engages the combatant and mirrors onto the target (free → engaged)", () => {
    const next = reduceCombat(session(), {
      kind: "setEngagement",
      combatantId: "combatant-0",
      targetCombatantIds: ["combatant-1"],
    })

    expect(engagementOf(next, "combatant-0")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-1"],
    })
    expect(engagementOf(next, "combatant-1")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-0"],
    })
  })

  it("replaces the prior engagement, freeing the dropped partner and engaging the new", () => {
    // A engaged with B, then re-set A to C.
    let next = reduceCombat(session(), {
      kind: "setEngagement",
      combatantId: "combatant-0",
      targetCombatantIds: ["combatant-1"],
    })
    next = reduceCombat(next, {
      kind: "setEngagement",
      combatantId: "combatant-0",
      targetCombatantIds: ["combatant-2"],
    })

    expect(engagementOf(next, "combatant-0")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-2"],
    })
    expect(engagementOf(next, "combatant-1")).toEqual({ status: "free" })
    expect(engagementOf(next, "combatant-2")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-0"],
    })
  })

  it("leaves a partner's other links intact when one is dropped", () => {
    // B engaged with A and C; re-setting A to [] (via clear) keeps B↔C.
    let next = reduceCombat(session(), {
      kind: "setEngagement",
      combatantId: "combatant-1",
      targetCombatantIds: ["combatant-0", "combatant-2"],
    })
    next = reduceCombat(next, {
      kind: "clearEngagement",
      combatantId: "combatant-0",
    })

    expect(engagementOf(next, "combatant-1")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-2"],
    })
    expect(engagementOf(next, "combatant-2")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-1"],
    })
  })

  it("keeps a dropped partner's other links when set-engaging to fewer targets", () => {
    // B engaged with A and C; re-setting A to [] drops A↔B but must keep B↔C.
    let next = reduceCombat(session(), {
      kind: "setEngagement",
      combatantId: "combatant-1",
      targetCombatantIds: ["combatant-0", "combatant-2"],
    })
    next = reduceCombat(next, {
      kind: "setEngagement",
      combatantId: "combatant-0",
      targetCombatantIds: [],
    })

    expect(engagementOf(next, "combatant-0")).toEqual({ status: "free" })
    expect(engagementOf(next, "combatant-1")).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-2"],
    })
  })

  it("is a no-op when the combatant id is unknown", () => {
    const s = session()
    const next = reduceCombat(s, {
      kind: "setEngagement",
      combatantId: "ghost",
      targetCombatantIds: ["combatant-1"],
    })
    expect(next).toBe(s)
  })
})

describe("reduceCombatSession — clearEngagement", () => {
  it("frees the combatant and its partner (engaged → free)", () => {
    const engaged = reduceCombat(session(), {
      kind: "setEngagement",
      combatantId: "combatant-0",
      targetCombatantIds: ["combatant-1"],
    })

    const next = reduceCombat(engaged, {
      kind: "clearEngagement",
      combatantId: "combatant-0",
    })

    expect(engagementOf(next, "combatant-0")).toEqual({ status: "free" })
    expect(engagementOf(next, "combatant-1")).toEqual({ status: "free" })
  })

  it("is a no-op (unchanged session) when the combatant is already Free", () => {
    const s = session()
    const next = reduceCombat(s, {
      kind: "clearEngagement",
      combatantId: "combatant-0",
    })
    expect(next).toBe(s)
  })

  it("is a no-op when the combatant id is unknown", () => {
    const s = session()
    const next = reduceCombat(s, {
      kind: "clearEngagement",
      combatantId: "ghost",
    })
    expect(next).toBe(s)
  })
})
