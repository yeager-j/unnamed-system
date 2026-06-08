import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { makeTalent } from "@workspace/game/engine/__fixtures__/talents"
import { resolveTalents } from "@workspace/game/engine/character/talents/utils"

/**
 * Real {@link import("@workspace/game/foundation/character/talents/schema").TalentKey}s
 * used as **opaque ids**: each fixture `name` below is chosen so alpha-by-**name**
 * is the reverse of alpha-by-**key**, so every ordering assertion pins that
 * `resolveTalents` sorts by display *name* — never the shipped label.
 */
const ORIGIN_TALENTS = [
  makeTalent("lift", "Anchor"),
  makeTalent("climb", "Beacon"),
  makeTalent("athletics", "Cair"),
]
const GAINED_TALENTS = [
  makeTalent("arcana", "Delta"),
  makeTalent("history", "Echo"),
]

const fxWarrior = makeArchetype({
  key: "warrior",
  talents: ["lift", "climb", "athletics"],
})

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior],
  talents: [...ORIGIN_TALENTS, ...GAINED_TALENTS],
})

describe("resolveTalents", () => {
  it("returns the active Archetype's Talents, sorted by display name", () => {
    // name order Anchor < Beacon < Cair → keys lift, climb, athletics — the
    // reverse of key order, so this fails if it sorts by key instead of name.
    expect(resolveTalents([], "warrior", TEST_DATA)).toEqual([
      "lift",
      "climb",
      "athletics",
    ])
  })

  it("returns gainedTalents when no Archetype is active", () => {
    expect(resolveTalents(["history", "arcana"], null, TEST_DATA)).toEqual([
      "arcana",
      "history",
    ])
  })

  it("deduplicates overlap between gained and Archetype Talents", () => {
    const result = resolveTalents(["climb", "arcana"], "warrior", TEST_DATA)
    // Union {lift, climb, athletics, arcana} sorted by name
    // (Anchor, Beacon, Cair, Delta) → keys in that order.
    expect(result).toEqual(["lift", "climb", "athletics", "arcana"])
    expect(new Set(result).size).toBe(result.length)
  })

  it("returns an empty array when both sources are empty", () => {
    expect(resolveTalents([], null, TEST_DATA)).toEqual([])
  })

  it("ignores an unknown Archetype key", () => {
    expect(
      resolveTalents(["climb"], "not-a-real-archetype", TEST_DATA)
    ).toEqual(["climb"])
  })

  it("falls back to the key for a Talent with no catalog entry", () => {
    // `nature` is seeded on neither the archetype nor the talents catalog, so
    // its sort label is the key itself ("nature"); "Cair" (athletics) sorts
    // ahead of it, proving the `?? key` fallback feeds the comparator.
    const result = resolveTalents(["nature"], "warrior", TEST_DATA)
    expect(result).toEqual(["lift", "climb", "athletics", "nature"])
  })

  it("sorts by the key when no Talent has a catalog entry", () => {
    // No talents are seeded, so every comparison falls back to the key and the
    // result must be key-alphabetical. This also pins the `?.` guard as
    // load-bearing: without it, the missing-entry lookup throws on `.name`.
    const data = makeTestGameData({
      archetypes: [
        makeArchetype({
          key: "warrior",
          talents: ["lift", "athletics", "climb"],
        }),
      ],
    })
    expect(resolveTalents([], "warrior", data)).toEqual([
      "athletics",
      "climb",
      "lift",
    ])
  })
})
