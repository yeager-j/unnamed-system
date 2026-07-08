import { describe, expect, it } from "vitest"

import { zoneEnchantmentBadge } from "./zone-enchantment-badge"

describe("zoneEnchantmentBadge", () => {
  it("returns undefined when no enchantment is active", () => {
    expect(zoneEnchantmentBadge(null, "z1")).toBeUndefined()
  })

  it("returns undefined when the enchantment sits on another zone", () => {
    expect(
      zoneEnchantmentBadge({ zoneId: "z2", type: "toccata", forte: 1 }, "z1")
    ).toBeUndefined()
  })

  it.each([
    [1, "f"],
    [2, "ff"],
    [3, "fff"],
  ])("marks forte %i as %s", (forte, marking) => {
    const badge = zoneEnchantmentBadge(
      { zoneId: "z1", type: "toccata", forte },
      "z1"
    )
    expect(badge?.marking).toBe(marking)
    expect(badge?.forte).toBe(forte)
  })

  it("resolves the display name and flags lines at or below the forte active", () => {
    const badge = zoneEnchantmentBadge(
      { zoneId: "z1", type: "requiem", forte: 2 },
      "z1"
    )
    expect(badge?.name).toBe("Requiem")
    expect(badge?.lines.map((line) => [line.forte, line.active])).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ])
    expect(badge?.lines.every((line) => line.text.length > 0)).toBe(true)
  })
})
