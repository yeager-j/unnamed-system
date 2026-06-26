import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import {
  buildLineageAtlas,
  getAtlasRecommendations,
} from "@workspace/game-v2/archetypes/atlas"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { MAX_LEVEL } from "@workspace/game-v2/progression/leveling"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

// — fixtures: one initiate per Lineage, each teaching a distinct damage type (or none) —

function damageSkill(key: string, damageType: Skill["damage"]): Skill {
  return {
    key,
    kind: "attack",
    name: key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    damage: damageType,
  }
}
const SKILLS: Record<string, Skill> = {
  cleave: damageSkill("cleave", { damageType: "slash", delivery: "physical" }),
  fireball: damageSkill("fireball", {
    damageType: "fire",
    delivery: "magical",
  }),
  backstab: damageSkill("backstab", {
    damageType: "pierce",
    delivery: "physical",
  }),
  guard: {
    key: "guard",
    kind: "passive",
    name: "guard",
    tagline: "t",
    description: "d",
    isSynthesis: false,
  },
}

function archetype(
  key: string,
  lineage: Archetype["lineage"],
  skills: Archetype["skills"]
): Archetype {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "hp", amount: 0 },
    lineage,
    key,
    name: key,
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents: [],
    skills,
  }
}

const CATALOG: Archetype[] = [
  archetype("warrior", "warrior", [{ rank: 1, skill: "cleave" }]), // health, slash
  archetype("mage", "mage", [{ rank: 1, skill: "fireball" }]), // skill, fire
  archetype("thief", "thief", [{ rank: 1, skill: "backstab" }]), // balanced, pierce
  archetype("knight", "knight", [{ rank: 1, skill: "guard" }]), // health, no damage
]

const data: Pick<GameData, "allArchetypes" | "getSkill"> = {
  allArchetypes: () => CATALOG,
  getSkill: (key) => SKILLS[key],
}

function view(
  roster: Array<{ key: string; rank: number }>,
  origin: string | null,
  savedArchetypeRanks = 1
) {
  const resolved: ResolvedEntity = {
    id: "pc",
    components: {
      archetypes: {
        active: null,
        origin,
        savedArchetypeRanks,
        activeLineage: null,
        roster: roster.map((r) => ({
          key: r.key,
          rank: r.rank,
          mastered: r.rank >= 5,
          inheritanceSlots: [],
        })),
      },
    },
  }
  return buildLineageAtlas(data)(resolved)
}

const recommend = getAtlasRecommendations(data)

describe("getAtlasRecommendations (B1–B8)", () => {
  it("slot 1 is the best actionable node in the Origin Lineage; fill follows priority order", () => {
    // Origin warrior (own it ⇒ rank-up); skill-focused ⇒ mage on-Path, thief off-Path new-type.
    const recs = recommend(
      view([{ key: "warrior", rank: 2 }], "warrior"),
      "skill-focused",
      5
    )
    expect(recs.map((r) => r.archetype.key)).toEqual([
      "warrior",
      "mage",
      "thief",
    ])
    expect(recs.map((r) => r.reason)).toEqual([
      "origin-lineage",
      "fits-path",
      "new-damage-type",
    ])
    // the origin rank-up carries its owned key
    expect(recs[0]!.ownedKey).toBe("warrior")
  })

  it("an in-progress Lineage (priority 0) outranks an on-Path fresh one (priority 1)", () => {
    // No origin; own thief (in-progress, off-Path). thief rank-up should lead.
    const recs = recommend(
      view([{ key: "thief", rank: 2 }], null),
      "skill-focused",
      5
    )
    expect(recs.map((r) => r.archetype.key)).toEqual([
      "thief",
      "mage",
      "warrior",
    ])
    expect(recs.map((r) => r.reason)).toEqual([
      "unlocked-archetype",
      "fits-path",
      "new-damage-type",
    ])
  })

  it("never surfaces an untouched, off-Path Lineage that adds no new damage type (B7)", () => {
    // knight is off-Path (health) with no damage skill ⇒ never recommended.
    const recs = recommend(view([], null), "skill-focused", 5)
    expect(recs.map((r) => r.archetype.key)).not.toContain("knight")
  })

  it("caps at 3 and never repeats an Archetype (B1)", () => {
    const recs = recommend(
      view([{ key: "warrior", rank: 2 }], "warrior"),
      "balanced",
      5
    )
    expect(recs.length).toBeLessThanOrEqual(3)
    expect(new Set(recs.map((r) => r.archetype.key)).size).toBe(recs.length)
  })
})

describe("getAtlasRecommendations — level-ceiling gate (B2)", () => {
  it("returns [] only when savedRanks === 0 AND level >= MAX_LEVEL", () => {
    expect(
      recommend(view([], "warrior", 0), "skill-focused", MAX_LEVEL)
    ).toEqual([])
  })

  it("a character at the ceiling WITH saved ranks still gets recommendations", () => {
    expect(
      recommend(view([], "warrior", 1), "skill-focused", MAX_LEVEL).length
    ).toBeGreaterThan(0)
  })

  it("a character below the ceiling with zero saved ranks still gets them (planning)", () => {
    expect(
      recommend(view([], "warrior", 0), "skill-focused", 1).length
    ).toBeGreaterThan(0)
  })
})
