import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { ResolvedArchetypes } from "@workspace/game-v2/archetypes/resolved"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  resolveTalents,
  resolveTalentsForBuilder,
  resolveTalentsForSheet,
} from "@workspace/game-v2/talents/resolve"
import { TALENT_KEYS } from "@workspace/game-v2/talents/vocab"

/**
 * Talent resolution (CH10 / UNN-554): the derived roster + the sheet/builder display
 * partitions. Uniform focus of the AC — the **inherited-vs-owned** split. Talent
 * display names come from the real domain catalog; only `getArchetype` is stubbed.
 */

function archetype(talents: string[]): Archetype {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "hp", amount: 0 },
    lineage: "warrior",
    key: "warrior",
    name: "Warrior",
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents,
    skills: [],
  }
}

// Warrior grants Climb, Lift, Athletics (the active/origin Archetype under test).
const deps: Pick<GameData, "getArchetype"> = {
  getArchetype: (key) =>
    key === "warrior" ? archetype(["climb", "lift", "athletics"]) : undefined,
}

function resolvedEntity(
  ownedKeys: string[],
  active: string | null
): ResolvedEntity {
  const archetypes: ResolvedArchetypes = {
    active,
    origin: active,
    savedArchetypeRanks: 0,
    activeLineage: null,
    roster: active
      ? [{ key: active, rank: 1, mastered: false, inheritanceSlots: [] }]
      : [],
  }
  return {
    id: "e1",
    components: {
      talents: ownedKeys.map((key) => ({ key })),
      archetypes,
    },
  }
}

describe("resolveTalents (core union)", () => {
  it("unions owned + active-Archetype Talents, deduped, alpha by display name", () => {
    // owned: Perform, Climb (dupe of Archetype) → union {Athletics, Climb, Lift, Perform}
    expect(resolveTalents(["perform", "climb"], "warrior", deps)).toEqual([
      "athletics",
      "climb",
      "lift",
      "perform",
    ])
  })

  it("returns owned Talents only when no Archetype is active", () => {
    expect(resolveTalents(["sneak", "lie"], null, deps)).toEqual([
      "lie",
      "sneak",
    ])
  })

  it("returns Archetype Talents only when the character owns none", () => {
    expect(resolveTalents([], "warrior", deps)).toEqual([
      "athletics",
      "climb",
      "lift",
    ])
  })
})

describe("resolveTalentsForSheet (inherited-vs-owned partition)", () => {
  it("splits Archetype-granted (inherited) from owned chips, each alpha", () => {
    const { chips } = resolveTalentsForSheet(deps)(
      resolvedEntity(["sneak", "perform"], "warrior")
    )
    expect(chips).toEqual([
      { key: "athletics", label: "Athletics", inherited: true },
      { key: "climb", label: "Climb", inherited: true },
      { key: "lift", label: "Lift", inherited: true },
      { key: "perform", label: "Perform", inherited: false },
      { key: "sneak", label: "Sneak", inherited: false },
    ])
  })

  it("omits every known Talent from `remaining`, keeps the rest alpha", () => {
    const { remaining } = resolveTalentsForSheet(deps)(
      resolvedEntity(["sneak"], "warrior")
    )
    const remainingKeys = remaining.map((entry) => entry.key)
    for (const known of ["climb", "lift", "athletics", "sneak"]) {
      expect(remainingKeys).not.toContain(known)
    }
    expect(remaining).toHaveLength(TALENT_KEYS.length - 4)
    expect(remaining[0]).toEqual({ key: "alchemy", label: "Alchemy" })
  })

  it("labels an owned Talent that is also Archetype-granted in both groups (verbatim v1)", () => {
    const { chips } = resolveTalentsForSheet(deps)(
      resolvedEntity(["climb"], "warrior")
    )
    const climbChips = chips.filter((chip) => chip.key === "climb")
    expect(climbChips).toEqual([
      { key: "climb", label: "Climb", inherited: true },
      { key: "climb", label: "Climb", inherited: false },
    ])
  })

  it("treats an entity with no Archetypes component as all-owned", () => {
    const { chips } = resolveTalentsForSheet(deps)(
      resolvedEntity(["lockpick"], null)
    )
    expect(chips).toEqual([
      { key: "lockpick", label: "Lockpick", inherited: false },
    ])
  })
})

describe("resolveTalentsForBuilder (origin lock + selectable)", () => {
  it("locks the Origin Talents and offers every other canonical Talent in key order", () => {
    const { origin, selectable } = resolveTalentsForBuilder(deps)("warrior")
    expect(origin).toEqual(["climb", "lift", "athletics"])
    expect(selectable).toEqual(
      TALENT_KEYS.filter((key) => !origin.includes(key))
    )
  })

  it("offers the full canonical list when there is no Origin", () => {
    const { origin, selectable } = resolveTalentsForBuilder(deps)(null)
    expect(origin).toEqual([])
    expect(selectable).toEqual([...TALENT_KEYS])
  })
})
