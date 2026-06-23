import { describe, expect, it } from "vitest"

import {
  makeArchetype,
  makeDerivedEntity,
  makeFlatEntity,
  makeTestGameData,
} from "@workspace/game-v2/progression/__fixtures__/derive"
import { createResolve } from "@workspace/game-v2/progression/resolve"

/**
 * Collaboration tests for the base-layer `resolve` (UNN-500) — it composes the
 * archetype lookup (port) + the mastery walk + the bonus pool + the per-capability
 * math. Fixture-backed: the numbers are authored here, so a mismatch is a logic
 * regression, not a balance change. (The v1↔v2 golden-master lives in apps/web,
 * where it can import both engines.)
 */
describe("createResolve — base layer over a derived PC entity", () => {
  it("derives attributes (archetype base + mastery + manual, clamped), maxHP/SP, affinities, and dice", () => {
    const data = makeTestGameData({
      warden: makeArchetype({
        attributes: { strength: 4, magic: 1, agility: 0, luck: 2 },
        affinities: { fire: "resist", ice: "weak" },
        mastery: { kind: "attribute", amount: 2, attribute: "strength" },
      }),
    })
    const resolve = createResolve(data)

    const entity = makeDerivedEntity({
      level: 5,
      pathChoice: "health-focused",
      active: "warden",
      roster: [{ key: "warden", rank: 5 }], // rank ≥ 5 ⇒ Mastery applies
      manualBonuses: { strength: 1, hp: 3, luck: -10 },
    })

    const resolved = resolve(entity)

    // strength: base 4 + mastery 2 + manual 1 = 7; luck: base 2 + manual −10 = −8 → clamp −7
    expect(resolved.components.attributes).toEqual({
      strength: 7,
      magic: 1,
      agility: 0,
      luck: -7,
    })
    // health-focused L5: 24 + 4×7 + manual hp 3 = 55; SP: 40 + 4×9 = 76
    expect(resolved.components.vitals).toEqual({ maxHP: 55 })
    expect(resolved.components.skillPool).toEqual({ maxSP: 76 })
    // archetype base chart, no candidates
    expect(resolved.components.affinities?.fire).toBe("resist")
    expect(resolved.components.affinities?.ice).toBe("weak")
    expect(resolved.components.affinities?.wind).toBe("neutral")
    // dice from level
    expect(resolved.components.resources).toEqual({
      maxHitDice: 6,
      maxSkillDice: 13,
    })
  })

  it("folds context (zone) effects into the pool and the affinity candidates", () => {
    const data = makeTestGameData({
      warden: makeArchetype({ affinities: { fire: "weak" } }),
    })
    const resolve = createResolve(data)
    const entity = makeDerivedEntity({
      active: "warden",
      pathChoice: "balanced",
    })

    const resolved = resolve(entity, {
      zoneEffects: [
        { type: "attribute", target: "magic", amount: 3 },
        { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
      ],
    })

    expect(resolved.components.attributes?.magic).toBe(3) // base 0 + context 3
    expect(resolved.components.affinities?.fire).toBe("resist") // candidate beats base weak
  })

  it("no active archetype ⇒ zero attributes and an all-neutral chart", () => {
    const resolve = createResolve(makeTestGameData())
    const resolved = resolve(makeDerivedEntity({ active: null }))

    expect(resolved.components.attributes).toEqual({
      strength: 0,
      magic: 0,
      agility: 0,
      luck: 0,
    })
    expect(resolved.components.affinities?.fire).toBe("neutral")
  })

  it("applies effects to an enemy-like authored base too — the D37 uniform fold", () => {
    // No Progression/Archetypes layers; authored base. The fold must still add the
    // zone effects on top (the bug the old `flat` short-circuit caused, D37).
    const resolve = createResolve(makeTestGameData())
    const enemy = makeFlatEntity({
      attributes: { strength: 4, magic: 0, agility: 1, luck: 0 },
      affinities: { fire: "resist" },
      maxHP: 100,
      maxSP: 30,
    })

    const resolved = resolve(enemy, {
      zoneEffects: [
        { type: "attribute", target: "strength", amount: 2 },
        { type: "attribute", target: "hp", amount: 10 },
        { type: "affinity", damageTypes: ["fire"], affinity: "weak" },
      ],
    })

    expect(resolved.components.attributes?.strength).toBe(6) // authored 4 + zone 2
    expect(resolved.components.vitals?.maxHP).toBe(110) // authored 100 + zone 10
    expect(resolved.components.skillPool?.maxSP).toBe(30) // no SP effect
    expect(resolved.components.affinities?.fire).toBe("weak") // candidate beats authored resist
    // No Progression ⇒ no dice maxima.
    expect(resolved.components.resources).toBeUndefined()
  })
})
