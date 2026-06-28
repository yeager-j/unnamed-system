import { describe, expect, it } from "vitest"

import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { makeScene } from "./__fixtures__/session"
import { fallenParticipantIds } from "./fallen"

/** Resolved Vitals read-unit. */
function vit(currentHP: number, maxHP = 20): ResolvedEntity["components"] {
  return { vitals: { maxHP, currentHP } }
}

describe("fallenParticipantIds (R13 / FAL-1 / CD9b — derived fresh from resolved HP)", () => {
  it("collects ids whose resolved currentHP is <= 0", () => {
    const { participants, resolve } = makeScene([
      { id: "alive", resolved: vit(12) },
      { id: "down", resolved: vit(0) },
      { id: "overkilled", resolved: vit(-5) },
    ])
    expect(fallenParticipantIds(participants, resolve)).toEqual(
      new Set(["down", "overkilled"])
    )
  })

  it("treats a participant with no resolved Vitals read-unit as not Fallen", () => {
    const { participants, resolve } = makeScene([
      { id: "object" }, // no resolved vitals
    ])
    expect(fallenParticipantIds(participants, resolve)).toEqual(new Set())
  })

  it("treats a degenerate entity that resolves maxHP 0 as Fallen", () => {
    const { participants, resolve } = makeScene([
      { id: "degenerate", resolved: vit(0, 0) },
    ])
    expect(fallenParticipantIds(participants, resolve)).toEqual(
      new Set(["degenerate"])
    )
  })

  it("does not treat over-max (currentHP > maxHP) as Fallen", () => {
    const { participants, resolve } = makeScene([
      { id: "loaned", resolved: vit(25, 20) },
    ])
    expect(fallenParticipantIds(participants, resolve)).toEqual(new Set())
  })

  it("recomputes fresh — a revive (HP back above 0) drops the id with no event", () => {
    const { participants } = makeScene([{ id: "phoenix" }])
    const fallenResolve = () => ({ id: "x", components: vit(0) })
    const aliveResolve = () => ({ id: "x", components: vit(8) })

    expect(fallenParticipantIds(participants, fallenResolve)).toEqual(
      new Set(["phoenix"])
    )
    expect(fallenParticipantIds(participants, aliveResolve)).toEqual(new Set())
  })
})
