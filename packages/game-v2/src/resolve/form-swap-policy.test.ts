import { describe, expect, it } from "vitest"

import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  applyForm,
  type SwapPolicy,
} from "@workspace/game-v2/resolve/form-swap-policy"

/**
 * The exhaustiveness gate, inverted: the real table's mapped-type annotation
 * already makes a missing row a compile error (add a scratch component to the
 * registry and the build fails until it gets a policy); this pins that the
 * annotation actually bites by asserting an incomplete table does NOT compile.
 */
// @ts-expect-error — a policy table missing registry components must not typecheck
const incomplete: Record<keyof ComponentRegistry, SwapPolicy> = {
  identity: "keep",
}
void incomplete

/**
 * The ratified form-swap doctrine (UNN-600): "a form is a body; you bring your
 * mind, your wounds, and your capacity." Each test pins one policy value of the
 * FORM_SWAP_POLICY table; the survival law (__laws__/form-swap.laws.test.ts)
 * quantifies the same claims over arbitrary entities × form bags.
 */

/** A fully-loaded PC — every self row populated so keep-rows are observable. */
function marisol(): Entity {
  return {
    id: "marisol",
    components: {
      identity: { name: "Marisol" },
      presentation: { portraitUrl: "https://cdn.test/marisol.png" },
      attributes: { base: { strength: 2, magic: 4, agility: 1, luck: 0 } },
      affinities: { base: { fire: "resist" } },
      vitals: { base: 60, damage: 50 },
      skillPool: { base: 30, spSpent: 12 },
      skills: [{ kind: "ref", key: "agi" }],
      talents: [{ key: "acrobatics" }],
      level: { value: 5, victories: 2 },
      path: { choice: "health-focused" },
      manualBonuses: { hp: 3 },
      archetypes: {
        active: "warden",
        origin: "warden",
        savedArchetypeRanks: 1,
        roster: [{ key: "warden", rank: 5, inheritanceSlots: [] }],
      },
      resources: { hitDiceUsed: 1, skillDiceUsed: 0, prismaUsed: 2 },
      exhaustion: { level: 2 },
      mechanics: { states: { perfection: { kind: "perfection", rank: 3 } } },
      equipment: {
        items: [
          {
            id: "i1",
            catalogItemKey: "leather-armor",
            equipped: true,
            quantity: 1,
          },
        ],
        currency: 40,
      },
      virtues: {
        ranks: { expression: 2, empathy: 1, wisdom: 3, focus: 1 },
        sparkLog: [],
      },
      narrative: {
        ancestry: "human",
        background: null,
        backstory: null,
        personality: null,
        hopes: null,
        dreams: null,
        fears: null,
        secrets: null,
        knives: [],
        chains: [],
      },
    },
  }
}

/** A doctrine-shaped body: capabilities only, no capacity, no self rows. */
const bear: Entity["components"] = {
  attributes: { base: { strength: 6, magic: -2, agility: 3, luck: 0 } },
  affinities: { base: { fire: "weak" } },
  presentation: { portraitUrl: "https://cdn.test/bear.png" },
  skills: [{ kind: "ref", key: "maul" }],
}

describe("applyForm — keep rows (the self)", () => {
  it("capacity is the self: a form's vitals/skillPool are ignored", () => {
    const entity = marisol()
    const rogueForm: Entity["components"] = {
      ...bear,
      vitals: { base: 120, damage: 0 },
      skillPool: { base: 40, spSpent: 0 },
    }

    const formed = applyForm(entity, rogueForm)

    expect(formed.components.vitals).toEqual({ base: 60, damage: 50 })
    expect(formed.components.skillPool).toEqual({ base: 30, spSpent: 12 })
  })

  it("path survives the swap — your capacity formula stays live in any body", () => {
    const formed = applyForm(marisol(), bear)
    expect(formed.components.path).toEqual({ choice: "health-focused" })
  })

  it("every other self row ignores the form's value", () => {
    const entity = marisol()
    const impostorForm: Entity["components"] = {
      ...bear,
      identity: { name: "Bear" },
      level: { value: 1, victories: 0 },
      talents: [{ key: "foraging" }],
      manualBonuses: { hp: 99 },
      resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
      exhaustion: { level: 0 },
      mechanics: { states: {} },
      equipment: { items: [], currency: 0 },
    }

    const formed = applyForm(entity, impostorForm)

    expect(formed.components.identity).toEqual({ name: "Marisol" })
    expect(formed.components.level).toEqual({ value: 5, victories: 2 })
    expect(formed.components.talents).toEqual([{ key: "acrobatics" }])
    expect(formed.components.manualBonuses).toEqual({ hp: 3 })
    expect(formed.components.resources).toEqual(entity.components.resources)
    expect(formed.components.exhaustion).toEqual({ level: 2 })
    expect(formed.components.mechanics).toEqual(entity.components.mechanics)
    expect(formed.components.equipment).toEqual(entity.components.equipment)
    expect(formed.components.virtues).toEqual(entity.components.virtues)
    expect(formed.components.narrative).toEqual(entity.components.narrative)
  })
})

describe("applyForm — override rows (the body, when authored)", () => {
  it("attributes/affinities/presentation take the form's when present", () => {
    const formed = applyForm(marisol(), bear)

    expect(formed.components.attributes).toEqual({
      base: { strength: 6, magic: -2, agility: 3, luck: 0 },
    })
    expect(formed.components.affinities).toEqual({ base: { fire: "weak" } })
    expect(formed.components.presentation).toEqual({
      portraitUrl: "https://cdn.test/bear.png",
    })
  })

  it("fall back to the entity's when the form omits them", () => {
    const aspectOnly: Entity["components"] = {
      affinities: { base: { fire: "drain" } },
      skills: [],
    }

    const formed = applyForm(marisol(), aspectOnly)

    expect(formed.components.attributes).toEqual({
      base: { strength: 2, magic: 4, agility: 1, luck: 0 },
    })
    expect(formed.components.presentation).toEqual({
      portraitUrl: "https://cdn.test/marisol.png",
    })
    expect(formed.components.affinities).toEqual({ base: { fire: "drain" } })
  })
})

describe("applyForm — the skills row replaces (absent means absent)", () => {
  it("the form's list is the body's whole list", () => {
    const formed = applyForm(marisol(), bear)
    expect(formed.components.skills).toEqual([{ kind: "ref", key: "maul" }])
  })

  it("a form that authors no skills leaves nothing intrinsic — no silent inheritance", () => {
    const mouse: Entity["components"] = {
      attributes: { base: { strength: -2, magic: 0, agility: 5, luck: 2 } },
    }
    const formed = applyForm(marisol(), mouse)
    expect(formed.components.skills).toBeUndefined()
  })
})

describe("applyForm — the archetypes row detaches", () => {
  it("active nulls (kit suppression) while the roster survives (Mastery/inheritance)", () => {
    const formed = applyForm(marisol(), bear)
    expect(formed.components.archetypes).toEqual({
      active: null,
      origin: "warden",
      savedArchetypeRanks: 1,
      roster: [{ key: "warden", rank: 5, inheritanceSlots: [] }],
    })
  })

  it("a form cannot graft an archetypes component onto an entity without one", () => {
    const golem: Entity = {
      id: "golem",
      components: {
        identity: { name: "Golem" },
        vitals: { base: 200, damage: 0 },
      },
    }
    const smuggler: Entity["components"] = {
      ...bear,
      archetypes: {
        active: "warden",
        origin: null,
        savedArchetypeRanks: 0,
        roster: [],
      },
    }
    expect(applyForm(golem, smuggler).components.archetypes).toBeUndefined()
  })
})

describe("applyForm — identity of the entity", () => {
  it("id is stable across any swap", () => {
    expect(applyForm(marisol(), bear).id).toBe("marisol")
  })
})
