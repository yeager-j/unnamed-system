import { describe, expect, it } from "vitest"

import { resolveTalents } from "./utils"

describe("resolveTalents", () => {
  it("returns the active Archetype's Talents when gainedTalents is empty", () => {
    expect(resolveTalents([], "warrior")).toEqual([
      "athletics",
      "climb",
      "lift",
    ])
  })

  it("returns gainedTalents when no Archetype is active", () => {
    expect(resolveTalents(["history", "arcana"], null)).toEqual([
      "arcana",
      "history",
    ])
  })

  it("deduplicates overlap between gained and Archetype Talents", () => {
    const result = resolveTalents(["climb", "arcana"], "warrior")
    expect(result).toEqual(["arcana", "athletics", "climb", "lift"])
    expect(new Set(result).size).toBe(result.length)
  })

  it("returns an empty array when both sources are empty", () => {
    expect(resolveTalents([], null)).toEqual([])
  })

  it("ignores an unknown Archetype key", () => {
    expect(resolveTalents(["climb"], "not-a-real-archetype")).toEqual(["climb"])
  })
})
