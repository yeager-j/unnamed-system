import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  makeArchetype,
  makeDerivedEntity,
  makeFlatEntity,
  makeTestGameData,
} from "@workspace/game-v2/progression/__fixtures__/derive"
import {
  applyForm,
  createResolve,
} from "@workspace/game-v2/progression/resolve"
import { isFallen } from "@workspace/game-v2/vitals/operations"

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
    // health-focused L5: 24 + 4×7 + manual hp 3 = 55; SP: 40 + 4×9 = 76. Full
    // pools (damage/spSpent default 0) ⇒ current === max.
    expect(resolved.components.vitals).toEqual({ maxHP: 55, currentHP: 55 })
    expect(resolved.components.skillPool).toEqual({ maxSP: 76, currentSP: 76 })
    // archetype base chart, no candidates
    expect(resolved.components.affinities?.fire).toBe("resist")
    expect(resolved.components.affinities?.ice).toBe("weak")
    expect(resolved.components.affinities?.wind).toBe("neutral")
    // dice from level; full (no Resources component ⇒ used 0) ⇒ current === max
    expect(resolved.components.resources).toEqual({
      maxHitDice: 6,
      currentHitDice: 6,
      maxSkillDice: 13,
      currentSkillDice: 13,
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

describe("createResolve — depletion-finalize (D9/D10)", () => {
  const resolve = createResolve(makeTestGameData())

  it("derives currentHP/currentSP from authored damage/spSpent against the resolved max", () => {
    // balanced L1: maxHP 20, maxSP 50. damage 5 ⇒ 15/20; spSpent 12 ⇒ 38/50.
    const resolved = resolve(makeDerivedEntity({ damage: 5, spSpent: 12 }))
    expect(resolved.components.vitals).toEqual({ maxHP: 20, currentHP: 15 })
    expect(resolved.components.skillPool).toEqual({ maxSP: 50, currentSP: 38 })
    expect(isFallen(resolved.components.vitals!)).toBe(false)
  })

  it("over-max: negative damage floats currentHP above the honest maxHP (Usury)", () => {
    // enemy maxHP 100, damage −15 ⇒ 115/100; maxHP stays honest at 100.
    const resolved = resolve(makeFlatEntity({ maxHP: 100, damage: -15 }))
    expect(resolved.components.vitals).toEqual({ maxHP: 100, currentHP: 115 })
    expect(isFallen(resolved.components.vitals!)).toBe(false)
  })

  it("overkill floors currentHP at 0 and Fallen at damage ≥ maxHP", () => {
    const resolved = resolve(makeFlatEntity({ maxHP: 100, damage: 130 }))
    expect(resolved.components.vitals).toEqual({ maxHP: 100, currentHP: 0 })
    expect(isFallen(resolved.components.vitals!)).toBe(true)
  })

  it("derives current dice from level maxima minus authored used counts", () => {
    // L5: maxHitDice 6, maxSkillDice 13. used 2/4 ⇒ current 4/9.
    const resolved = resolve(
      makeDerivedEntity({
        level: 5,
        resources: { hitDiceUsed: 2, skillDiceUsed: 4 },
      })
    )
    expect(resolved.components.resources).toEqual({
      maxHitDice: 6,
      currentHitDice: 4,
      maxSkillDice: 13,
      currentSkillDice: 9,
    })
  })

  it("resolves a durable Exhaustion level to its table entry", () => {
    const resolved = resolve(makeDerivedEntity({ exhaustion: 2 }))
    expect(resolved.components.exhaustion?.level).toBe(2)
    expect(resolved.components.exhaustion?.description).toContain("Placeholder")
  })

  it("resolves no dice without the Resources component, even with a Level", () => {
    // Dice gate on the entity's own Resources component (like vitals/skillPool on
    // theirs), not on Level alone — a Level without it (e.g. an enemy) resolves no
    // dice.
    const leveledNoResources: Entity = {
      id: "no-resources",
      components: {
        identity: { name: "Spectre" },
        level: { value: 5 },
        vitals: { base: 100, damage: 0 },
      },
    }
    expect(resolve(leveledNoResources).components.resources).toBeUndefined()
    // …and its maxHP is the authored base — no Path means no path layer.
    expect(resolve(leveledNoResources).components.vitals?.maxHP).toBe(100)
  })
})

describe("the form layer — applyForm is a pure Entity → Entity merge (D8/D18)", () => {
  const data = makeTestGameData({
    warden: makeArchetype({
      attributes: { strength: 4, magic: 1, agility: 0, luck: 2 },
      affinities: { fire: "resist" },
      mastery: { kind: "attribute", amount: 2, attribute: "strength" },
    }),
  })
  const resolve = createResolve(data)

  // A form is just another entity's components — a full-health creature.
  const bear: Entity["components"] = {
    attributes: { base: { strength: 3, magic: 3, agility: 3, luck: 3 } },
    affinities: { base: { fire: "weak" } },
    vitals: { base: 120, damage: 0 },
    skillPool: { base: 40, spSpent: 0 },
  }

  it("replaces the active Archetype's statline but keeps Mastery (roster survives)", () => {
    // warden rank 5 ⇒ its +2 strength Mastery applies; its base strength 4 does not
    // (the form detaches the active Archetype).
    const entity = makeDerivedEntity({
      active: "warden",
      roster: [{ key: "warden", rank: 5 }],
    })
    const resolved = resolve(applyForm(entity, bear))

    // bear base 3 + surviving Mastery +2 = 5 (warden base 4 is gone, no clamp).
    expect(resolved.components.attributes?.strength).toBe(5)
    // bear's fire weak replaces warden's fire resist.
    expect(resolved.components.affinities?.fire).toBe("weak")
  })

  it("a candidate (zone/equipment) overrides a form's affinity — even to a weaker one (D18 later wins)", () => {
    const entity = makeDerivedEntity({ active: "warden" })
    const resolved = resolve(
      applyForm(entity, { ...bear, affinities: { base: { fire: "drain" } } }),
      {
        zoneEffects: [
          { type: "affinity", damageTypes: ["fire"], affinity: "weak" },
        ],
      }
    )
    expect(resolved.components.affinities?.fire).toBe("weak")
  })

  it("form-swap continuity: damage/spSpent carry over; current reconciles against the new max (D9)", () => {
    // balanced L1: natural maxHP 20 / maxSP 50. damage 10 ⇒ 10/20; spSpent 12 ⇒ 38/50.
    const entity = makeDerivedEntity({ damage: 10, spSpent: 12 })
    expect(resolve(entity).components.vitals).toEqual({
      maxHP: 20,
      currentHP: 10,
    })
    expect(resolve(entity).components.skillPool).toEqual({
      maxSP: 50,
      currentSP: 38,
    })

    // In bear form the maxima move under the same authored damage/spSpent.
    const resolved = resolve(applyForm(entity, bear))
    expect(resolved.components.vitals).toEqual({ maxHP: 120, currentHP: 110 }) // 120 − 10
    expect(resolved.components.skillPool).toEqual({ maxSP: 40, currentSP: 28 }) // 40 − 12
  })

  it("keeps Level (Insta-Kill + dice) but drops Path so the form's HP is absolute", () => {
    const entity = makeDerivedEntity({ level: 5, pathChoice: "health-focused" })
    const formed = applyForm(entity, bear)

    // Level rides through (you're still your true level in form); Path detaches.
    expect(formed.components.level).toEqual({ value: 5 })
    expect(formed.components.path).toBeUndefined()

    const resolved = resolve(formed)
    // maxHP is the bear's absolute 120 — no path layer added on top.
    expect(resolved.components.vitals?.maxHP).toBe(120)
    // Dice still resolve from the surviving Level + Resources.
    expect(resolved.components.resources?.maxHitDice).toBe(6)
  })

  it("a form whose maxHP drops below the constant damage Falls the entity (no special case)", () => {
    const entity = makeDerivedEntity({ damage: 25 })
    // 20 − 25 floors to 0
    const tiny = resolve(
      applyForm(entity, { ...bear, vitals: { base: 20, damage: 0 } })
    )
    expect(tiny.components.vitals).toEqual({ maxHP: 20, currentHP: 0 })
    expect(isFallen(tiny.components.vitals!)).toBe(true)
  })

  it("a form may omit SP — a no-SP creature resolves no SkillPool (the boss case)", () => {
    // An SP-less entity in an SP-less form: skillPool is simply absent, no flattened
    // `{ hp, sp }` forcing it to exist.
    const golemEntity: Entity = {
      id: "golem",
      components: {
        identity: { name: "Golem" },
        attributes: { base: { strength: 5, magic: 0, agility: 0, luck: 0 } },
        vitals: { base: 200, damage: 0 },
      },
    }
    const golemForm: Entity["components"] = {
      attributes: { base: { strength: 8, magic: 0, agility: 0, luck: 0 } },
      vitals: { base: 250, damage: 0 },
    }
    const resolved = resolve(applyForm(golemEntity, golemForm))
    expect(resolved.components.vitals).toEqual({ maxHP: 250, currentHP: 250 })
    expect(resolved.components.skillPool).toBeUndefined()
  })
})
