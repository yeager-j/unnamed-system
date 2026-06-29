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
    const { view } = makeScene([
      { id: "alive", resolved: vit(12) },
      { id: "down", resolved: vit(0) },
      { id: "overkilled", resolved: vit(-5) },
    ])
    expect(fallenParticipantIds(view)).toEqual(new Set(["down", "overkilled"]))
  })

  it("treats a participant with no resolved Vitals read-unit as not Fallen", () => {
    const { view } = makeScene([
      { id: "object" }, // no resolved vitals
    ])
    expect(fallenParticipantIds(view)).toEqual(new Set())
  })

  it("treats a degenerate entity that resolves maxHP 0 as Fallen", () => {
    const { view } = makeScene([{ id: "degenerate", resolved: vit(0, 0) }])
    expect(fallenParticipantIds(view)).toEqual(new Set(["degenerate"]))
  })

  it("does not treat over-max (currentHP > maxHP) as Fallen", () => {
    const { view } = makeScene([{ id: "loaned", resolved: vit(25, 20) }])
    expect(fallenParticipantIds(view)).toEqual(new Set())
  })

  it("recomputes fresh — a revive (HP back above 0) drops the id with no event", () => {
    const fallen = makeScene([{ id: "phoenix", resolved: vit(0) }]).view
    const alive = makeScene([{ id: "phoenix", resolved: vit(8) }]).view

    expect(fallenParticipantIds(fallen)).toEqual(new Set(["phoenix"]))
    expect(fallenParticipantIds(alive)).toEqual(new Set())
  })
})
