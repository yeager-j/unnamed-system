import { describe, expect, it } from "vitest"

import { warrior } from "@workspace/game/data/archetypes/warrior/warrior"
import { gameData } from "@workspace/game/data/game-data"
import {
  makeArchetypeRow,
  makeHydratedCharacter,
} from "@workspace/game/engine/__fixtures__/character"
import {
  archetypeSwitcherGroups,
  buildArchetypeEntries,
  previewArchetypeSkills,
} from "@workspace/game/engine/archetypes/utils"

/**
 * Contract smoke (UNN-363): asserts the archetype display/preview shapers wire
 * against the *real* shipped catalog (resolving %HP costs, Attack Rolls, entries,
 * switcher groups). Sort/preview/grouping behavior is proven against fixtures in
 * `archetypes/utils.test.ts`; this only guards the seam.
 */
describe("archetype utils — real catalog (smoke)", () => {
  it("resolves a shipped Archetype's %HP costs and Attack Rolls in the builder preview", () => {
    const { ranks, synthesis } = previewArchetypeSkills(gameData)(
      warrior,
      "balanced"
    )
    expect(ranks).toHaveLength(warrior.skills.length)
    expect(synthesis?.key).toBe(warrior.synthesisSkill!.skill)

    const cleave = ranks.find((ranked) => ranked.key === "cleave")
    expect(cleave?.resolvedCost).toMatchObject({ kind: "hp" })

    const attackSkill = ranks.find(
      (ranked) => ranked.kind === "attack" && ranked.attackRoll
    )
    expect(attackSkill?.resolvedAttackRoll).not.toBeNull()
  })

  it("builds entries and switcher groups over the shipped catalog", () => {
    const c = makeHydratedCharacter({
      row: { activeArchetypeId: "a" },
      archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
    })
    expect(buildArchetypeEntries(gameData)(c)[0]?.archetype.key).toBe("warrior")
    expect(archetypeSwitcherGroups(gameData)(c)[0]?.lineage).toBe("warrior")
  })
})
