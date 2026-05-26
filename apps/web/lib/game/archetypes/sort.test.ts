import { describe, expect, it } from "vitest"

import { ARCHETYPES } from "./index"
import { sortArchetypesByPath } from "./sort"

describe("sortArchetypesByPath", () => {
  const initiates = ARCHETYPES.filter((a) => a.tier === "initiate")

  it("surfaces health-bucket Lineages first under health-focused", () => {
    const ordered = sortArchetypesByPath(initiates, "health-focused").map(
      (a) => a.lineage
    )
    // Warrior + Knight are 'health'; Healer is 'balanced'; Mage is 'skill'.
    expect(ordered).toEqual(["warrior", "knight", "healer", "mage"])
  })

  it("surfaces balanced-bucket Lineages first under balanced", () => {
    const ordered = sortArchetypesByPath(initiates, "balanced").map(
      (a) => a.lineage
    )
    // Healer is 'balanced'; Warrior + Knight 'health'; Mage 'skill'.
    expect(ordered).toEqual(["healer", "warrior", "knight", "mage"])
  })

  it("surfaces skill-bucket Lineages first under skill-focused", () => {
    const ordered = sortArchetypesByPath(initiates, "skill-focused").map(
      (a) => a.lineage
    )
    // Mage is 'skill'; Healer 'balanced'; Warrior + Knight 'health'.
    expect(ordered).toEqual(["mage", "healer", "warrior", "knight"])
  })

  it("does not mutate its input", () => {
    const before = initiates.map((a) => a.key)
    sortArchetypesByPath(initiates, "skill-focused")
    expect(initiates.map((a) => a.key)).toEqual(before)
  })

  it("breaks ties within a bucket by LINEAGES order", () => {
    // Warrior + Knight both 'health'; under health-focused they share a bucket.
    // Warrior comes before Knight in LINEAGES, so it must come first here too.
    const ordered = sortArchetypesByPath(initiates, "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered.indexOf("warrior")).toBeLessThan(ordered.indexOf("knight"))
  })
})
