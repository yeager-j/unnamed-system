import { describe, expect, it } from "vitest"

import {
  makeAccessory,
  makeArmor,
  makeItemLookups,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  makeArchetype,
  makeDerivedEntity,
  makeFlatEntity,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import { applyForm } from "@workspace/game-v2/resolve/form-swap-policy"
import { createResolve } from "@workspace/game-v2/resolve/resolve"
import { createResolveEntity } from "@workspace/game-v2/resolve/resolve-entity"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"
import { isFallen } from "@workspace/game-v2/vitals/operations"

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "attack",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}

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
      maxPrisma: 2,
      currentPrisma: 2,
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
      effects: [
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
      effects: [
        { type: "attribute", target: "strength", amount: 2 },
        { type: "attribute", target: "hp", amount: 10 },
        { type: "affinity", damageTypes: ["fire"], affinity: "null" },
      ],
    })

    expect(resolved.components.attributes?.strength).toBe(6) // authored 4 + zone 2
    expect(resolved.components.vitals?.maxHP).toBe(110) // authored 100 + zone 10
    expect(resolved.components.skillPool?.maxSP).toBe(30) // no SP effect
    expect(resolved.components.affinities?.fire).toBe("null") // stronger candidate applies over authored resist
    // No Progression ⇒ no dice maxima.
    expect(resolved.components.resources).toBeUndefined()
  })

  it("passes identity through as a resolved read-unit", () => {
    const resolve = createResolve(makeTestGameData())
    const resolved = resolve(makeFlatEntity({ name: "Goblin" }))

    expect(resolved.components.identity).toEqual({ name: "Goblin" })
  })

  it("ignores overlay-like non-registry keys on the component bag", () => {
    const resolve = createResolve(makeTestGameData())
    const enemy = makeFlatEntity({ name: "Overlay Proof" })
    const withOverlay = {
      ...enemy,
      components: {
        ...enemy.components,
        battleConditions: { charged: true },
        allegiance: { side: "foes" },
      } as unknown as Entity["components"],
    }

    expect(resolve(withOverlay)).toEqual(resolve(enemy))
  })
})

describe("resolveEntity — collected skills (hydrated) + direct talents", () => {
  const psi = skill({
    key: "psi",
    cost: { kind: "sp", amount: 4 },
    attackRoll: { attribute: "ma", tiers: [] },
    damage: { damageType: "mind", delivery: "magical" },
  })
  const bite = skill({
    key: "bite",
    cost: { kind: "hp-percent", amount: 10 },
    attackRoll: { attribute: "st", tiers: [] },
    damage: { damageType: "pierce", delivery: "physical" },
  })
  const devourIntellect = skill({
    kind: "passive",
    key: "intellect-devourer-devour-intellect",
    name: "Devour Intellect",
    tagline: "A 20+ Mind-damage hit Downs the target.",
    description:
      "If a target takes Mind damage dealt by this creature's Skills, they are Downed if the Attack Roll was 20+.",
  })
  const bodyThief = skill({
    kind: "passive",
    key: "intellect-devourer-body-thief",
    name: "Body Thief",
    tagline: "Seizes a Downed creature's body, Brainwashing it.",
    description:
      "The Intellect Devourer psychically seizes control of their body.",
  })
  const detectSentience = skill({
    kind: "passive",
    key: "intellect-devourer-detect-sentience",
    name: "Detect Sentience",
    tagline: "Senses any creature with Virtue ranks within 10 Zones.",
    description:
      "The Intellect Devourer can sense the presence and location of any creature within 10 Zones of it if the creature has any Virtue ranks.",
  })
  const psiDeps = {
    ...makeTestGameData(),
    getSkill: (key: string) => (key === "psi" ? psi : undefined),
  }
  const resolve = createResolve(makeTestGameData())
  const resolveEntity = createResolveEntity(psiDeps)

  it("drops unknown direct skill refs; fielding none ⇒ no skills read-unit", () => {
    const enemy = makeFlatEntity({ maxHP: 50 })

    const resolved = resolveEntity({
      ...enemy,
      components: {
        ...enemy.components,
        skills: [{ kind: "ref", key: "missing-skill" }],
      },
    })

    expect(resolved.components.skills).toBeUndefined()
  })

  it("hydrates inline direct skills against the finished entity", () => {
    const enemy = makeFlatEntity({
      attributes: { strength: 4, magic: 0, agility: 0, luck: 0 },
      maxHP: 50,
    })

    const resolved = resolveEntity({
      ...enemy,
      components: {
        ...enemy.components,
        skills: [{ kind: "inline", skill: bite }],
      },
    })

    expect(resolved.components.skills?.[0]?.skill.key).toBe("bite")
    expect(resolved.components.skills?.[0]?.resolvedCost).toEqual({
      kind: "hp",
      amount: 5,
    })
    expect(resolved.components.skills?.[0]?.resolvedAttackRoll?.total).toBe(4)
  })

  it("preserves party composition through resolveEntity for direct skill scalers", () => {
    const enemy = makeFlatEntity({
      attributes: { strength: 0, magic: 2, agility: 0, luck: 0 },
    })

    const resolved = resolveEntity(
      {
        ...enemy,
        components: {
          ...enemy.components,
          skills: [{ kind: "ref", key: "psi" }],
        },
      },
      {
        effects: [
          {
            type: "attackRoll",
            when: { damageTypes: ["mind"] },
            scaler: {
              kind: "perPartyLineage",
              lineage: "mage",
              amount: 2,
              includesSelf: true,
            },
            source: "Magic Circle",
          },
        ],
        partyComposition: { mage: 3 },
      }
    )

    expect(resolved.components.skills?.[0]?.resolvedAttackRoll?.total).toBe(8)
  })

  it("passes direct talents through when present", () => {
    const enemy = makeFlatEntity({})

    const resolved = resolve({
      ...enemy,
      components: {
        ...enemy.components,
        talents: [{ key: "sneak" }],
      },
    })

    expect(resolved.components.talents).toEqual([{ key: "sneak" }])
  })

  it("emits neither read-unit when the entity fields no skills and no talents", () => {
    const resolved = resolveEntity(makeFlatEntity({}))

    expect(resolved.components.skills).toBeUndefined()
    expect(resolved.components.talents).toBeUndefined()
  })

  it("expresses the intellect devourer's v1 skillKeys, inlineSkills, and talents as components", () => {
    const intellectDevourer: Entity = {
      id: "intellect-devourer",
      components: {
        identity: { name: "Intellect Devourer" },
        level: { value: 4, victories: 0 },
        attributes: {
          base: { strength: -2, magic: 2, agility: 1, luck: 0 },
        },
        affinities: { base: { soul: "weak", mind: "drain", light: "weak" } },
        vitals: { base: 28, damage: 0 },
        skills: [
          { kind: "ref", key: "psi" },
          { kind: "inline", skill: devourIntellect },
          { kind: "inline", skill: bodyThief },
          { kind: "inline", skill: detectSentience },
        ],
        talents: [{ key: "sneak" }],
      },
    }

    const resolved = resolveEntity(intellectDevourer)

    expect(resolved.components.skillPool).toBeUndefined()
    expect(resolved.components.skills?.map((entry) => entry.skill.key)).toEqual(
      [
        "psi",
        "intellect-devourer-devour-intellect",
        "intellect-devourer-body-thief",
        "intellect-devourer-detect-sentience",
      ]
    )
    expect(resolved.components.skills?.[0]?.resolvedAttackRoll?.total).toBe(2)
    expect(resolved.components.talents).toEqual([{ key: "sneak" }])
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
      maxPrisma: 2,
      currentPrisma: 2,
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
        level: { value: 5, victories: 0 },
        vitals: { base: 100, damage: 0 },
      },
    }
    expect(resolve(leveledNoResources).components.resources).toBeUndefined()
    // …and its maxHP is the authored base — no Path means no path layer.
    expect(resolve(leveledNoResources).components.vitals?.maxHP).toBe(100)
  })
})

describe("the form layer — applyForm is a pure fold of the swap-policy table (D8/UNN-600)", () => {
  const data = makeTestGameData({
    warden: makeArchetype({
      attributes: { strength: 4, magic: 1, agility: 0, luck: 2 },
      affinities: { fire: "resist" },
      mastery: { kind: "attribute", amount: 2, attribute: "strength" },
    }),
  })
  const resolve = createResolve(data)

  // A form is just another entity's components — capabilities, not capacity.
  const bear: Entity["components"] = {
    attributes: { base: { strength: 3, magic: 3, agility: 3, luck: 3 } },
    affinities: { base: { fire: "weak" } },
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

  it("a candidate overrides a form's affinity only when stronger (strongest-wins, UNN-502)", () => {
    const entity = makeDerivedEntity({ active: "warden" })
    // a stronger candidate upgrades the form's affinity
    const upgraded = resolve(
      applyForm(entity, { ...bear, affinities: { base: { fire: "resist" } } }),
      {
        effects: [
          { type: "affinity", damageTypes: ["fire"], affinity: "drain" },
        ],
      }
    )
    expect(upgraded.components.affinities?.fire).toBe("drain")
    // a weaker candidate does NOT downgrade the form's affinity
    const kept = resolve(
      applyForm(entity, { ...bear, affinities: { base: { fire: "drain" } } }),
      {
        effects: [
          { type: "affinity", damageTypes: ["fire"], affinity: "weak" },
        ],
      }
    )
    expect(kept.components.affinities?.fire).toBe("drain")
  })

  it("capacity is the self: a form changes the statline, never the bar (UNN-600)", () => {
    // balanced L1: natural maxHP 20 / maxSP 50. damage 10 ⇒ 10/20; spSpent 12 ⇒ 38/50.
    const entity = makeDerivedEntity({ damage: 10, spSpent: 12 })
    const before = resolve(entity)

    const after = resolve(applyForm(entity, bear))
    expect(after.components.vitals).toEqual(before.components.vitals)
    expect(after.components.skillPool).toEqual(before.components.skillPool)
  })

  it("keeps Level AND Path — the capacity formula stays live in any body (UNN-600)", () => {
    const entity = makeDerivedEntity({ level: 5, pathChoice: "health-focused" })
    const formed = applyForm(entity, bear)

    expect(formed.components.level).toEqual({ value: 5, victories: 0 })
    expect(formed.components.path).toEqual({ choice: "health-focused" })

    const resolved = resolve(formed)
    // maxHP is the entity's own path-derived value — the form doesn't touch it.
    expect(resolved.components.vitals?.maxHP).toBe(
      resolve(entity).components.vitals?.maxHP
    )
    // Dice still resolve from the surviving Level + Resources.
    expect(resolved.components.resources?.maxHitDice).toBe(6)
  })

  it("a wounded entity survives shifting into a small form — no death cliff (UNN-600)", () => {
    // 15 damage on the natural 20-max bar ⇒ 5/20. Under the retired graft model, a
    // 5-max form would have floored currentHP to 0 the moment you shifted.
    const entity = makeDerivedEntity({ damage: 15 })
    const tiny = resolve(
      applyForm(entity, { ...bear, vitals: { base: 5, damage: 0 } })
    )
    expect(tiny.components.vitals).toEqual({ maxHP: 20, currentHP: 5 })
    expect(isFallen(tiny.components.vitals!)).toBe(false)
  })

  it("an SP-less entity resolves no SkillPool in any form (the boss case)", () => {
    // keep-of-absent is absent: the form can neither shrink, grow, nor grant pools.
    const golemEntity: Entity = {
      id: "golem",
      components: {
        identity: { name: "Golem" },
        attributes: { base: { strength: 5, magic: 0, agility: 0, luck: 0 } },
        vitals: { base: 200, damage: 0 },
      },
    }
    const golemForm: Entity["components"] = {
      attributes: { base: { strength: 7, magic: 0, agility: 0, luck: 0 } },
      skillPool: { base: 40, spSpent: 0 },
    }
    const resolved = resolve(applyForm(golemEntity, golemForm))
    expect(resolved.components.vitals).toEqual({ maxHP: 200, currentHP: 200 })
    expect(resolved.components.skillPool).toBeUndefined()
    expect(resolved.components.attributes?.strength).toBe(7)
  })
})

describe("createResolve — the resolved Archetypes read-unit (PR6 — the sheet reads it off ResolvedEntity)", () => {
  const data = makeTestGameData({
    warden: makeArchetype({ key: "warden", lineage: "knight" }),
    seer: makeArchetype({ key: "seer", lineage: "mage" }),
  })
  const resolve = createResolve(data)

  it("emits the roster with derived activeLineage + per-entry mastered when an Archetypes component is present", () => {
    const entity = makeDerivedEntity({
      active: "warden",
      roster: [
        { key: "warden", rank: 5 },
        { key: "seer", rank: 2 },
      ],
    })

    const resolved = resolve(entity)

    expect(resolved.components.archetypes).toEqual({
      active: "warden",
      origin: "warden",
      savedArchetypeRanks: 0,
      activeLineage: "knight",
      roster: [
        { key: "warden", rank: 5, mastered: true, inheritanceSlots: [] },
        { key: "seer", rank: 2, mastered: false, inheritanceSlots: [] },
      ],
    })
  })

  it("an entity with no Archetypes component (an enemy) emits no resolved archetypes read-unit", () => {
    expect(resolve(makeFlatEntity()).components.archetypes).toBeUndefined()
  })

  it("under a form, applyForm nulls active ⇒ active/activeLineage are null while the roster survives (kit suppression, D38)", () => {
    const entity = makeDerivedEntity({
      active: "warden",
      roster: [{ key: "warden", rank: 5 }],
    })
    const form: Entity["components"] = {
      attributes: { base: { strength: 9, magic: 0, agility: 0, luck: 0 } },
      vitals: { base: 120, damage: 0 },
    }

    const resolved = resolve(applyForm(entity, form))

    expect(resolved.components.archetypes?.active).toBeNull()
    expect(resolved.components.archetypes?.activeLineage).toBeNull()
    // roster survives (Mastery + inheritance persist through a form)
    expect(resolved.components.archetypes?.roster).toEqual([
      { key: "warden", rank: 5, mastered: true, inheritanceSlots: [] },
    ])
  })
})

describe("resolveEntity — every effect source compounds on one entity", () => {
  function passive(key: string, effects: Skill["effects"]): Skill {
    return {
      kind: "passive",
      key,
      name: key,
      tagline: "t",
      description: "d",
      isSynthesis: false,
      effects,
    }
  }

  const equipped = (catalogItemKey: string): InventoryItemState => ({
    id: catalogItemKey,
    catalogItemKey,
    equipped: true,
    quantity: 1,
  })

  it("folds attributes, affinities, attack-roll effects, and the skill list from all sources at once", () => {
    // One PC carrying every contributor simultaneously:
    //   archetype base + Mastery + manual + active mechanic + zone context, plus the
    //   four skill-collection sources (intrinsic, archetype kit, inheritance, equipment
    //   grant) and a direct equipment bonus.
    const intrinsicAura = passive("intrinsic-aura", [
      { type: "attribute", target: "strength", amount: 1 },
      { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
      { type: "attackRoll", amount: 2, source: "Aura" },
    ])
    const kitSkill = passive("kit-skill", [
      { type: "attribute", target: "magic", amount: 1 },
    ])
    const inheritedFocus = passive("inherited-focus", [
      { type: "attribute", target: "magic", amount: 1 },
    ])
    const grantedEdge = passive("granted-edge", [
      { type: "attribute", target: "magic", amount: 1 },
    ])

    const deps = {
      ...makeTestGameData({
        warlord: makeArchetype({
          key: "warlord",
          attributes: { strength: 1, magic: 0, agility: 0, luck: 0 },
          affinities: { fire: "weak" },
          mastery: { kind: "attribute", amount: 2, attribute: "strength" },
          mechanic: "perfection",
          skills: [{ rank: 1, skill: "kit-skill" }],
        }),
      }),
      ...makeItemLookups({
        items: [
          makeArmor({
            key: "gauntlet",
            effects: [{ type: "attribute", target: "strength", amount: 1 }],
          }),
          makeAccessory({
            key: "amulet",
            effects: [
              { type: "affinity", damageTypes: ["ice"], affinity: "resist" },
            ],
          }),
          makeWeapon({
            key: "blade",
            effects: [{ type: "skill", skillKey: "granted-edge" }],
          }),
        ],
        skills: [intrinsicAura, kitSkill, inheritedFocus, grantedEdge],
      }),
    }
    const resolveEntity = createResolveEntity(deps)

    const base = makeDerivedEntity({
      active: "warlord",
      roster: [{ key: "warlord", rank: 5 }], // rank ≥ 5 ⇒ Mastery applies
      manualBonuses: { strength: 1 },
      mechanics: { perfection: { kind: "perfection", rank: 3 } },
      equipment: [equipped("gauntlet"), equipped("amulet"), equipped("blade")],
    })
    const entity: Entity = {
      ...base,
      components: {
        ...base.components,
        skills: [{ kind: "inline", skill: intrinsicAura }],
        archetypes: {
          ...base.components.archetypes!,
          roster: [
            {
              key: "warlord",
              rank: 5,
              inheritanceSlots: [
                {
                  slotIndex: 0,
                  sourceArchetypeKey: "mage",
                  skillKey: "inherited-focus",
                },
              ],
            },
          ],
        },
      },
    }

    const zone: CombatantEffect[] = [
      { type: "attribute", target: "agility", amount: 2 },
      { type: "affinity", damageTypes: ["fire"], affinity: "null" },
      { type: "attackRoll", amount: 1, source: "Zone Edge" },
    ]
    const resolved = resolveEntity(entity, { effects: zone })

    // strength = archetype 1 + Mastery 2 + manual 1 + intrinsic-skill 1 + gauntlet 1 = 6
    //   (kept below the +7 clamp so a double-count would surface, not hide)
    // magic = kit 1 + inheritance 1 + equipment-grant 1 = 3 (three skill sources stack)
    // agility = zone 2; luck untouched
    expect(resolved.components.attributes).toEqual({
      strength: 6,
      magic: 3,
      agility: 2,
      luck: 0,
    })

    // fire = strongest(archetype weak, intrinsic-skill resist, zone null) = null;
    // ice = the amulet's direct resist, independent of fire.
    expect(resolved.components.affinities?.fire).toBe("null")
    expect(resolved.components.affinities?.ice).toBe("resist")

    // Attack-roll effects fold in C6 order: mechanic → skill effects → equipment
    // (no attack-roll arm) → context.
    expect(
      resolved.components.pendingEffects?.attackRoll.map((e) => e.source)
    ).toEqual(["Perfection (A)", "Aura", "Zone Edge"])

    // All four collection sources hydrate into one skill array, in source order.
    expect(resolved.components.skills?.map((s) => s.skill.key)).toEqual([
      "intrinsic-aura",
      "kit-skill",
      "inherited-focus",
      "granted-edge",
    ])
  })

  it("folds a Skill reached from two sources once — no double-count in the compounded stat", () => {
    // `shared-boost` is on the archetype kit AND granted by an equipped item.
    const sharedBoost = passive("shared-boost", [
      { type: "attribute", target: "magic", amount: 3 },
    ])
    const deps = {
      ...makeTestGameData({
        adept: makeArchetype({
          key: "adept",
          skills: [{ rank: 1, skill: "shared-boost" }],
        }),
      }),
      ...makeItemLookups({
        items: [
          makeWeapon({
            key: "twin-edge",
            effects: [{ type: "skill", skillKey: "shared-boost" }],
          }),
        ],
        skills: [sharedBoost],
      }),
    }
    const resolveEntity = createResolveEntity(deps)

    const entity = makeDerivedEntity({
      active: "adept",
      roster: [{ key: "adept", rank: 1 }],
      equipment: [equipped("twin-edge")],
    })
    const resolved = resolveEntity(entity)

    // magic is +3, not +6: the deduped collection folds the shared Skill's effect once.
    expect(resolved.components.attributes?.magic).toBe(3)
    // …and it appears once in the hydrated list, too.
    expect(resolved.components.skills?.map((s) => s.skill.key)).toEqual([
      "shared-boost",
    ])
  })
})
