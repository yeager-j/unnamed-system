import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { makeTalent } from "@workspace/game/engine/__fixtures__/talents"
import {
  resolveTalentsForBuilder,
  resolveTalentsForSheet,
} from "@workspace/game/engine/character/talents/display"
import { TALENT_KEYS } from "@workspace/game/foundation/character/talents/schema"

/**
 * Real {@link import("@workspace/game/foundation/character/talents/schema").TalentKey}s
 * used as **opaque ids**: the fixture `name`s are chosen so alpha-by-**name**
 * differs from alpha-by-**key**, so the ordering assertions pin sort-by-display-
 * label rather than coincidentally matching the shipped labels.
 */
const TALENTS = [
  makeTalent("lift", "Anchor"),
  makeTalent("climb", "Beacon"),
  makeTalent("athletics", "Cair"),
  makeTalent("history", "Delta"),
  makeTalent("arcana", "Echo"),
  makeTalent("lockpick", "Foxtrot"),
  makeTalent("sneak", "Golf"),
]

/** Origin Talents are declared in a deliberately non-alphabetical order so the
 *  builder's "preserve Archetype order" guarantee is observable. */
const fxWarrior = makeArchetype({
  key: "warrior",
  talents: ["climb", "lift", "athletics"],
})

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior],
  talents: TALENTS,
})

describe("resolveTalentsForSheet", () => {
  it("returns the active Archetype's Talents as inherited chips, alpha by label", () => {
    const { chips, remaining } = resolveTalentsForSheet(
      [],
      "warrior",
      TEST_DATA
    )

    expect(chips).toEqual([
      { key: "lift", label: "Anchor", inherited: true },
      { key: "climb", label: "Beacon", inherited: true },
      { key: "athletics", label: "Cair", inherited: true },
    ])
    expect(remaining.map((option) => option.key)).not.toContain("climb")
  })

  it("returns gained Talents as removable chips when no Archetype is active", () => {
    const { chips } = resolveTalentsForSheet(
      ["history", "arcana"],
      null,
      TEST_DATA
    )

    expect(chips).toEqual([
      { key: "history", label: "Delta", inherited: false },
      { key: "arcana", label: "Echo", inherited: false },
    ])
  })

  it("orders inherited chips before gained chips, each block alpha by label", () => {
    const { chips } = resolveTalentsForSheet(
      ["sneak", "lockpick"],
      "warrior",
      TEST_DATA
    )

    expect(chips.map((chip) => chip.key)).toEqual([
      "lift",
      "climb",
      "athletics",
      "lockpick",
      "sneak",
    ])
    expect(chips.filter((chip) => chip.inherited).map((c) => c.key)).toEqual([
      "lift",
      "climb",
      "athletics",
    ])
  })

  it("excludes both inherited and gained Talents from remaining", () => {
    const { remaining } = resolveTalentsForSheet(
      ["sneak"],
      "warrior",
      TEST_DATA
    )
    const keys = remaining.map((option) => option.key)

    for (const known of ["climb", "lift", "athletics", "sneak"]) {
      expect(keys).not.toContain(known)
    }
    expect(remaining).toContainEqual({ key: "arcana", label: "Echo" })
  })

  it("orders the remaining options alphabetically by label", () => {
    // TALENT_KEYS is not alphabetical, so a label-sorted `remaining` differs
    // from canonical order — pinning that the Add-popover list is sorted.
    const { remaining } = resolveTalentsForSheet([], null, TEST_DATA)
    const labels = remaining.map((option) => option.label)

    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it("treats an unknown Archetype key as no inherited Talents", () => {
    const { chips } = resolveTalentsForSheet(
      ["climb"],
      "not-a-real-archetype",
      TEST_DATA
    )

    expect(chips).toEqual([{ key: "climb", label: "Beacon", inherited: false }])
  })
})

describe("resolveTalentsForBuilder", () => {
  it("returns the Origin's Talents in Archetype order, not sorted", () => {
    const { origin } = resolveTalentsForBuilder("warrior", TEST_DATA)

    expect(origin).toEqual(["climb", "lift", "athletics"])
  })

  it("excludes Origin Talents from selectable, preserving TALENT_KEYS order", () => {
    const { selectable } = resolveTalentsForBuilder("warrior", TEST_DATA)

    expect(selectable).toEqual(
      TALENT_KEYS.filter((key) => !["climb", "lift", "athletics"].includes(key))
    )
  })

  it("returns an empty Origin and every Talent selectable when no Origin is set", () => {
    expect(resolveTalentsForBuilder(null, TEST_DATA)).toEqual({
      origin: [],
      selectable: [...TALENT_KEYS],
    })
    expect(resolveTalentsForBuilder("not-a-real-archetype", TEST_DATA)).toEqual(
      {
        origin: [],
        selectable: [...TALENT_KEYS],
      }
    )
  })
})
