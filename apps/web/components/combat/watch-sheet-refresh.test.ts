import { describe, expect, it } from "vitest"

import { type PlayerVisibleCombatant } from "@workspace/game/engine"
import { type ZoneEnchantment } from "@workspace/game/foundation"

import { ownedSheetZoneEffectsKey } from "./watch-sheet-refresh"

/**
 * The refresh trigger fires exactly when this key changes, so the cases pin
 * the boundary: enchantment lifecycle and owned-combatant zone moves change
 * it; unrelated churn (turns, vitals, other zones) does not.
 */

function combatant(id: string, zoneId: string): PlayerVisibleCombatant {
  return {
    id,
    name: id,
    side: "players",
    zoneId,
    hasActed: false,
    isCurrent: false,
    ailments: [],
    battleConditions: {
      attack: "neutral",
      defense: "neutral",
      hitEvasion: "neutral",
      charged: false,
      concentrating: false,
    },
    conditionDurations: {},
    counters: {},
    engagedWith: [],
    kind: "pc",
    hp: { current: 10, max: 10 },
    sp: { current: 5, max: 5 },
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    portraitUrl: null,
  }
}

function watchState(
  enchantment: ZoneEnchantment | null,
  combatants: PlayerVisibleCombatant[]
) {
  return { enchantment, combatants }
}

const OWNED = [{ combatantId: "c1" }]
const TOCCATA_Z1: ZoneEnchantment = { zoneId: "z1", type: "toccata", forte: 1 }

describe("ownedSheetZoneEffectsKey", () => {
  it("changes when the owned combatant's Zone gains an Enchantment", () => {
    const before = ownedSheetZoneEffectsKey(
      watchState(null, [combatant("c1", "z1")]),
      OWNED
    )
    const after = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    expect(after).not.toBe(before)
  })

  it("changes when the Enchantment's Forte rises", () => {
    const lv1 = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    const lv2 = ownedSheetZoneEffectsKey(
      watchState({ ...TOCCATA_Z1, forte: 2 }, [combatant("c1", "z1")]),
      OWNED
    )
    expect(lv2).not.toBe(lv1)
  })

  it("changes when the owned combatant moves into the Enchanted Zone", () => {
    const outside = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z2")]),
      OWNED
    )
    const inside = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    expect(inside).not.toBe(outside)
  })

  it("is stable across unrelated churn — an Enchantment landing in another Zone", () => {
    const before = ownedSheetZoneEffectsKey(
      watchState(null, [combatant("c1", "z2")]),
      OWNED
    )
    const after = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z2")]),
      OWNED
    )
    expect(after).toBe(before)
  })

  it("is a constant for a spectator with no owned sheets", () => {
    expect(
      ownedSheetZoneEffectsKey(
        watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
        []
      )
    ).toBe(ownedSheetZoneEffectsKey(watchState(null, []), []))
  })
})
