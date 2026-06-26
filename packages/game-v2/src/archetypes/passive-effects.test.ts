import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import {
  archetypeKitEffects,
  inheritanceEffects,
} from "@workspace/game-v2/archetypes/passive-effects"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { passiveSkillEffects } from "@workspace/game-v2/resolve/passive-skill-effects"
import { applyForm } from "@workspace/game-v2/resolve/resolve"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const strBuff: CombatantEffect = {
  type: "attribute",
  target: "strength",
  amount: 2,
}
const magBuff: CombatantEffect = {
  type: "attribute",
  target: "magic",
  amount: 3,
}

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "passive",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}
const SKILLS: Record<string, Skill> = {
  "passive-str": skill({
    key: "passive-str",
    kind: "passive",
    effects: [strBuff],
  }),
  "passive-mag": skill({
    key: "passive-mag",
    kind: "passive",
    effects: [magBuff],
  }),
  "active-str": skill({
    key: "active-str",
    kind: "attack",
    cost: { kind: "sp", amount: 1 },
    effects: [strBuff],
  }),
}

const warrior: Archetype = {
  attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
  affinities: {},
  mastery: { kind: "hp", amount: 0 },
  lineage: "warrior",
  key: "warrior",
  name: "Warrior",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 0,
  talents: [],
  skills: [
    { rank: 1, skill: "passive-str" }, // passive ⇒ contributes
    { rank: 1, skill: "active-str" }, // active ⇒ skipped
    { rank: 5, skill: "passive-mag" }, // above rank 3 ⇒ skipped
  ],
}

const deps: Pick<GameData, "getArchetype" | "getEquippableItem" | "getSkill"> =
  {
    getArchetype: (key) => (key === "warrior" ? warrior : undefined),
    getEquippableItem: () => undefined,
    getSkill: (key) => SKILLS[key],
  }

function pc(
  active: string | null,
  slots: Array<{ skillKey: string | null }> = []
): Entity {
  return {
    id: "pc",
    components: {
      archetypes: {
        active,
        origin: active,
        savedArchetypeRanks: 0,
        roster: [
          {
            key: "warrior",
            rank: 3,
            inheritanceSlots: slots.map((s, i) => ({
              slotIndex: i,
              sourceArchetypeKey: "mage",
              skillKey: s.skillKey,
            })),
          },
        ],
      },
    },
  }
}

describe("archetypeKitEffects (active archetype's passive skills, by rank)", () => {
  it("folds the active archetype's unlocked PASSIVE skill effects only", () => {
    // rank 3: passive-str (passive, rank 1) in; active-str (active) skipped;
    // passive-mag (rank 5) above rank ⇒ skipped.
    expect(archetypeKitEffects(deps, pc("warrior"))).toEqual([strBuff])
  })

  it("is empty when no Archetype is active (suppressed under a form)", () => {
    expect(archetypeKitEffects(deps, pc(null))).toEqual([])
  })
})

describe("inheritanceEffects (the ACTIVE archetype's slots only)", () => {
  it("folds the active archetype's filled slot passives; skips empty slots + active skills", () => {
    const entity = pc("warrior", [
      { skillKey: "passive-mag" }, // passive ⇒ contributes
      { skillKey: null }, // empty ⇒ skipped
      { skillKey: "active-str" }, // active skill ⇒ skipped
    ])
    expect(inheritanceEffects(deps, entity)).toEqual([magBuff])
  })

  it("ignores an INACTIVE archetype's inheritance slots (applies only while active)", () => {
    // warrior owns the slot but is NOT active ⇒ its inherited passive must not apply.
    const entity: Entity = {
      id: "pc",
      components: {
        archetypes: {
          active: null,
          origin: "warrior",
          savedArchetypeRanks: 0,
          roster: [
            {
              key: "warrior",
              rank: 3,
              inheritanceSlots: [
                {
                  slotIndex: 0,
                  sourceArchetypeKey: "mage",
                  skillKey: "passive-mag",
                },
              ],
            },
          ],
        },
      },
    }
    expect(inheritanceEffects(deps, entity)).toEqual([])
  })
})

describe("passiveSkillEffects union + form semantics (D19, C6 order kit → inheritance → equipment)", () => {
  it("unions kit + inheritance (kit first)", () => {
    const entity = pc("warrior", [{ skillKey: "passive-mag" }])
    expect(passiveSkillEffects(deps, entity, entity)).toEqual([
      strBuff,
      magBuff,
    ])
  })

  it("under a form, kit is suppressed (formed's active nulled) while inheritance passes through (read off the original)", () => {
    const entity = pc("warrior", [{ skillKey: "passive-mag" }])
    const formed = applyForm(entity, {
      attributes: { base: { strength: 9, magic: 0, agility: 0, luck: 0 } },
    })
    // kit reads `formed` (active null ⇒ no strBuff); inheritance reads `entity`
    // (active warrior intact ⇒ magBuff survives the form).
    expect(passiveSkillEffects(deps, formed, entity)).toEqual([magBuff])
  })
})
