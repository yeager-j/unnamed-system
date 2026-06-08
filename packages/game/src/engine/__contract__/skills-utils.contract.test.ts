import { describe, expect, it } from "vitest"

import { dia } from "@workspace/game/data/skills/heal/dia"
import { cleave } from "@workspace/game/data/skills/slash/cleave"
import { resolveSkillCost } from "@workspace/game/engine/skills/utils"

/**
 * Contract smoke (UNN-361): asserts `resolveSkillCost` resolves *shipped* Skill
 * costs against the real catalog — an HP-percentage Skill (`cleave`) and a flat
 * SP Skill (`dia`). Cost/affordability behavior is proven against fixtures in
 * `skills/utils.test.ts`; this only guards that the shipped cost shapes still
 * resolve.
 */
describe("resolveSkillCost — real catalog (smoke)", () => {
  it("resolves a shipped HP-percentage Skill against max HP", () => {
    const cost = resolveSkillCost(cleave, 100)
    expect(cost?.kind).toBe("hp")
    expect(cost?.amount).toBeGreaterThan(0)
  })

  it("passes a shipped flat SP Skill's cost through", () => {
    const cost = resolveSkillCost(dia, 20)
    expect(cost?.kind).toBe("sp")
    expect(cost?.amount).toBeGreaterThan(0)
  })
})
