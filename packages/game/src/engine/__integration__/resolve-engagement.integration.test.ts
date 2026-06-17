import { describe, expect, it } from "vitest"

import { makeEncounter } from "@workspace/game/engine/__fixtures__/encounter"
import { resolveCombatantEngagement } from "@workspace/game/engine/encounter/resolve-engagement"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

function pc(characterId: string, zoneId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId }
}

const PC_DETAIL: Record<string, PcCombatantDetail> = {
  a: { name: "Aria" } as PcCombatantDetail,
  b: { name: "Bram" } as PcCombatantDetail,
  c: { name: "Cole" } as PcCombatantDetail,
}

function find(session: CombatSession, id: string) {
  return session.combatants.find((combatant) => combatant.id === id)!
}

describe("resolveCombatantEngagement", () => {
  it("offers other combatants in the same zone as candidates (by name)", () => {
    const { session, instance } = makeEncounter([
      pc("a", "z1"),
      pc("b", "z1"),
      pc("c", "z2"),
    ])

    const view = resolveCombatantEngagement(
      session,
      instance,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.candidates).toEqual([{ id: "c-1", label: "Bram" }])
    expect(view.value).toEqual({ status: "free" })
    expect(view.targetNames).toEqual([])
  })

  it("resolves engaged target ids to display names", () => {
    const { session, instance } = makeEncounter([
      {
        ...pc("a", "z1"),
        engagement: { status: "engaged", targetCombatantIds: ["c-1"] },
      },
      pc("b", "z1"),
    ])

    const view = resolveCombatantEngagement(
      session,
      instance,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.targetNames).toEqual(["Bram"])
  })

  it("keeps a current target as a candidate even if it's now in another zone", () => {
    // c-0 (z1) engaged with c-1, then c-1 sits in z2 (engagement isn't coupled
    // to position — UNN-315). The stale partner must stay clearable.
    const { session, instance } = makeEncounter([
      {
        ...pc("a", "z1"),
        engagement: { status: "engaged", targetCombatantIds: ["c-1"] },
      },
      pc("b", "z2"),
    ])

    const view = resolveCombatantEngagement(
      session,
      instance,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.candidates).toEqual([{ id: "c-1", label: "Bram" }])
  })

  it("offers everyone in an unzoned encounter (all empty zoneId)", () => {
    const { session, instance } = makeEncounter([
      pc("a", ""),
      pc("b", ""),
      pc("c", ""),
    ])

    const view = resolveCombatantEngagement(
      session,
      instance,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.candidates.map((candidate) => candidate.id)).toEqual([
      "c-1",
      "c-2",
    ])
  })
})
