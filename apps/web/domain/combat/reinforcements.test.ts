import { describe, expect, it } from "vitest"

import { buildReinforcements } from "./reinforcements"

/** A deterministic id mint so ids are assertable without touching `crypto`. */
function sequentialIds(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe("buildReinforcements", () => {
  it("materializes one setup per copy, minting a fresh id that seeds the entity", () => {
    const setups = buildReinforcements(
      [{ enemyKey: "goblin", count: 2 }],
      undefined,
      sequentialIds()
    )

    expect(setups).toHaveLength(2)
    expect(setups.map((setup) => setup.id)).toEqual(["id-0", "id-1"])
    for (const setup of setups) {
      expect(setup.side).toBe("enemies")
      expect(setup.entity.id).toBe(setup.id)
      expect("zoneId" in setup).toBe(false)
    }
  })

  it("flattens several groups, summing their counts in order", () => {
    const setups = buildReinforcements(
      [
        { enemyKey: "goblin", count: 1 },
        { enemyKey: "goblin-warrior", count: 2 },
      ],
      undefined,
      sequentialIds()
    )

    expect(setups).toHaveLength(3)
  })

  it("stamps the arrival zone on every copy when given one", () => {
    const setups = buildReinforcements(
      [{ enemyKey: "goblin", count: 2 }],
      "zone-north",
      sequentialIds()
    )

    expect(setups.every((setup) => setup.zoneId === "zone-north")).toBe(true)
  })

  it("skips an unknown key rather than emitting an entity-less setup", () => {
    const setups = buildReinforcements(
      [
        { enemyKey: "not-a-monster", count: 3 },
        { enemyKey: "goblin", count: 1 },
      ],
      undefined,
      sequentialIds()
    )

    expect(setups).toHaveLength(1)
    expect(setups[0]?.entity.components).toBeDefined()
  })
})
