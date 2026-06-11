import { describe, expect, it } from "vitest"

import { reduceCombat } from "@workspace/game/engine/__fixtures__/encounter"
import {
  getEnchantment,
  zoneEnchantmentEffects,
} from "@workspace/game/engine/encounter/enchantment"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { forteMarking } from "@workspace/game/foundation/combat/enchantment"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

const SETUP: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-1" },
    zoneId: "zone-a",
  },
]

function sequentialIds() {
  let n = 0
  return () => `zone-${n++}`
}

/** A session with two zones (`zone-0`, `zone-1`), built through the reducer so
 *  the graph is shaped exactly as it would be at runtime. */
function sessionWithZones(): {
  session: CombatSession
  zoneA: string
  zoneB: string
} {
  const ids = sequentialIds()
  let session = createCombatSession(ids)(SETUP)
  session = reduceCombat(session, { kind: "addZone", name: "Courtyard" }, ids)
  session = reduceCombat(session, { kind: "addZone", name: "Hall" }, ids)
  const [zoneA, zoneB] = Object.keys(session.zones)
  return { session, zoneA: zoneA!, zoneB: zoneB! }
}

describe("enchantment definitions", () => {
  it("emits a Toccata Attack-Roll bonus equal to the Zone's Forte", () => {
    expect(getEnchantment("toccata").effects(2)).toEqual([
      { type: "attackRoll", amount: 2, source: "Toccata" },
    ])
  })

  it("emits no structured effects for Requiem and Tarantella (prose-only rules)", () => {
    expect(getEnchantment("requiem").effects(3)).toEqual([])
    expect(getEnchantment("tarantella").effects(3)).toEqual([])
  })
})

describe("forteMarking", () => {
  it("maps Forte 1/2/3 to the dynamic markings f/ff/fff, clamped at the ends", () => {
    expect(forteMarking(1)).toBe("f")
    expect(forteMarking(2)).toBe("ff")
    expect(forteMarking(3)).toBe("fff")
    expect(forteMarking(0)).toBe("f")
    expect(forteMarking(9)).toBe("fff")
  })
})

describe("zoneEnchantmentEffects", () => {
  it("returns the Enchantment's effects for a combatant in the Enchanted Zone", () => {
    const effects = zoneEnchantmentEffects(
      { zoneId: "zone-0", type: "toccata", forte: 3 },
      "zone-0"
    )
    expect(effects).toEqual([
      { type: "attackRoll", amount: 3, source: "Toccata" },
    ])
  })

  it("returns nothing when no Enchantment is active", () => {
    expect(zoneEnchantmentEffects(null, "zone-0")).toEqual([])
  })

  it("returns nothing for a combatant in a different Zone", () => {
    expect(
      zoneEnchantmentEffects(
        { zoneId: "zone-0", type: "toccata", forte: 3 },
        "zone-1"
      )
    ).toEqual([])
  })
})

describe("reduceCombatSession — applyEnchantment", () => {
  it("enchants a Zone at Forte 1", () => {
    const { session, zoneA } = sessionWithZones()

    const next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "toccata",
    })

    expect(next.enchantment).toEqual({
      zoneId: zoneA,
      type: "toccata",
      forte: 1,
    })
  })

  it("raises the Forte when re-applying the same type to the same Zone, capped at 3", () => {
    const { session, zoneA } = sessionWithZones()
    const apply = {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "toccata",
    } as const

    let next = reduceCombat(session, apply)
    next = reduceCombat(next, apply)
    expect(next.enchantment?.forte).toBe(2)

    next = reduceCombat(next, apply)
    expect(next.enchantment?.forte).toBe(3)

    next = reduceCombat(next, apply)
    expect(next.enchantment?.forte).toBe(3)
  })

  it("replaces the Enchantment at Forte 1 when a different type hits the same Zone", () => {
    const { session, zoneA } = sessionWithZones()

    let next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "toccata",
    })
    next = reduceCombat(next, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "requiem",
    })

    expect(next.enchantment).toEqual({
      zoneId: zoneA,
      type: "requiem",
      forte: 1,
    })
  })

  it("moves the singleton when a second Zone is Enchanted — the first loses it", () => {
    const { session, zoneA, zoneB } = sessionWithZones()

    let next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "toccata",
    })
    next = reduceCombat(next, {
      kind: "applyEnchantment",
      zoneId: zoneB,
      enchantment: "toccata",
    })

    expect(next.enchantment).toEqual({
      zoneId: zoneB,
      type: "toccata",
      forte: 1,
    })
  })

  it("is a no-op for an unknown zone id", () => {
    const { session } = sessionWithZones()

    const next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: "no-such-zone",
      enchantment: "toccata",
    })

    expect(next).toBe(session)
  })
})

describe("reduceCombatSession — clearEnchantment", () => {
  it("clears the active Enchantment", () => {
    const { session, zoneA } = sessionWithZones()

    let next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "tarantella",
    })
    next = reduceCombat(next, { kind: "clearEnchantment" })

    expect(next.enchantment).toBeNull()
  })

  it("is a no-op when none is active", () => {
    const { session } = sessionWithZones()

    const next = reduceCombat(session, { kind: "clearEnchantment" })

    expect(next).toBe(session)
  })
})

describe("reduceCombatSession — removeZone clears a stranded Enchantment", () => {
  it("clears the Enchantment when its Zone is removed", () => {
    const { session, zoneA } = sessionWithZones()

    let next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "toccata",
    })
    next = reduceCombat(next, { kind: "removeZone", zoneId: zoneA })

    expect(next.enchantment).toBeNull()
  })

  it("keeps the Enchantment when another Zone is removed", () => {
    const { session, zoneA, zoneB } = sessionWithZones()

    let next = reduceCombat(session, {
      kind: "applyEnchantment",
      zoneId: zoneA,
      enchantment: "toccata",
    })
    next = reduceCombat(next, { kind: "removeZone", zoneId: zoneB })

    expect(next.enchantment).toEqual({
      zoneId: zoneA,
      type: "toccata",
      forte: 1,
    })
  })
})
