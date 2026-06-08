import { describe, expect, it } from "vitest"

import { resolveCombatantEngagement } from "@workspace/game/engine/encounter/resolve-engagement"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `c-${n++}`
}

function pc(characterId: string, zoneId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId }
}

const PC_DETAIL: Record<string, PcCombatantDetail> = {
  a: { name: "Aria" } as PcCombatantDetail,
  b: { name: "Bram" } as PcCombatantDetail,
  c: { name: "Cole" } as PcCombatantDetail,
}

function find(session: ReturnType<typeof createCombatSession>, id: string) {
  return session.combatants.find((combatant) => combatant.id === id)!
}

describe("resolveCombatantEngagement", () => {
  it("offers other combatants in the same zone as candidates (by name)", () => {
    const session = createCombatSession(
      [pc("a", "z1"), pc("b", "z1"), pc("c", "z2")],
      sequentialIds()
    )

    const view = resolveCombatantEngagement(
      session,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.candidates).toEqual([{ id: "c-1", label: "Bram" }])
    expect(view.value).toEqual({ status: "free" })
    expect(view.targetNames).toEqual([])
  })

  it("resolves engaged target ids to display names", () => {
    const base = createCombatSession(
      [pc("a", "z1"), pc("b", "z1")],
      sequentialIds()
    )
    const session = {
      ...base,
      combatants: base.combatants.map((combatant) =>
        combatant.id === "c-0"
          ? {
              ...combatant,
              engagement: {
                status: "engaged" as const,
                targetCombatantIds: ["c-1"],
              },
            }
          : combatant
      ),
    }

    const view = resolveCombatantEngagement(
      session,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.targetNames).toEqual(["Bram"])
  })

  it("keeps a current target as a candidate even if it's now in another zone", () => {
    // c-0 (z1) engaged with c-1, then c-1 moved to z2 (engagement isn't coupled
    // to position — UNN-315). The stale partner must stay clearable.
    const base = createCombatSession(
      [pc("a", "z1"), pc("b", "z2")],
      sequentialIds()
    )
    const session = {
      ...base,
      combatants: base.combatants.map((combatant) =>
        combatant.id === "c-0"
          ? {
              ...combatant,
              engagement: {
                status: "engaged" as const,
                targetCombatantIds: ["c-1"],
              },
            }
          : combatant
      ),
    }

    const view = resolveCombatantEngagement(
      session,
      find(session, "c-0"),
      PC_DETAIL,
      {}
    )

    expect(view.candidates).toEqual([{ id: "c-1", label: "Bram" }])
  })

  it("offers everyone in an unzoned encounter (all empty zoneId)", () => {
    const session = createCombatSession(
      [pc("a", ""), pc("b", ""), pc("c", "")],
      sequentialIds()
    )

    const view = resolveCombatantEngagement(
      session,
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
