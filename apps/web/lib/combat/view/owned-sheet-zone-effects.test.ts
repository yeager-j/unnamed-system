import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  SnapshotEnchantment,
  VisibleCombatant,
} from "@workspace/game-v2/visibility"

import { ownedSheetZoneEffectsKey } from "@/lib/combat/view/owned-sheet-zone-effects"

/**
 * The refresh trigger fires exactly when this key changes, so the cases pin
 * the boundary: enchantment lifecycle and owned-combatant zone moves change
 * it; unrelated churn (turns, vitals, other zones) does not. On v2 the
 * combatant's zone reads off its redacted `position` component.
 */

function combatant(
  id: string,
  zoneId: string,
  currentHP = 10
): VisibleCombatant {
  return {
    id: asParticipantId(id),
    components: {
      allegiance: { side: "players" },
      position: { zoneId },
      vitals: { maxHP: 10, currentHP },
    },
  }
}

function watchState(
  enchantment: SnapshotEnchantment | null,
  combatants: VisibleCombatant[]
) {
  return { ...(enchantment ? { enchantment } : {}), combatants }
}

const OWNED = [asParticipantId("c1")]
const TOCCATA_Z1: SnapshotEnchantment = {
  zoneId: "z1",
  type: "toccata",
  forte: 1,
}

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

  it("is stable across vitals churn — the DM damaging the owned combatant", () => {
    const full = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    const hurt = ownedSheetZoneEffectsKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1", 3)]),
      OWNED
    )
    expect(hurt).toBe(full)
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
