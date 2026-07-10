import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  SnapshotEnchantment,
  VisibleCombatant,
} from "@workspace/game-v2/visibility"

import { ownedSheetRefreshKey } from "@/lib/combat/view/owned-sheet-refresh-key"

/**
 * The refresh trigger fires exactly when this key changes, so the cases pin the
 * boundary: anything the server baked into an owned sheet — enchantment
 * lifecycle, the combatant's zone, its own pools — changes it; churn that leaves
 * the sheet identical (turn order, enemy vitals, Enchantments in other Zones)
 * does not. Zone and pools read off the combatant's redacted components.
 */

function combatant(
  id: string,
  zoneId: string,
  currentHP = 10,
  side: "players" | "enemies" = "players"
): VisibleCombatant {
  return {
    id: asParticipantId(id),
    components: {
      allegiance: { side },
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

describe("ownedSheetRefreshKey", () => {
  it("changes when the owned combatant's Zone gains an Enchantment", () => {
    const before = ownedSheetRefreshKey(
      watchState(null, [combatant("c1", "z1")]),
      OWNED
    )
    const after = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    expect(after).not.toBe(before)
  })

  it("changes when the Enchantment's Forte rises", () => {
    const lv1 = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    const lv2 = ownedSheetRefreshKey(
      watchState({ ...TOCCATA_Z1, forte: 2 }, [combatant("c1", "z1")]),
      OWNED
    )
    expect(lv2).not.toBe(lv1)
  })

  it("changes when the owned combatant moves into the Enchanted Zone", () => {
    const outside = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z2")]),
      OWNED
    )
    const inside = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    expect(inside).not.toBe(outside)
  })

  // The degraded (no-realtime) path's whole reason for existing: without this,
  // the battlefield token shows the new HP while the sheet beside it shows the
  // old one until a manual reload (Codex, PR #309).
  it("changes when the DM damages the owned combatant", () => {
    const full = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1")]),
      OWNED
    )
    const hurt = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z1", 3)]),
      OWNED
    )
    expect(hurt).not.toBe(full)
  })

  it("is stable across unrelated churn — an Enchantment landing in another Zone", () => {
    const before = ownedSheetRefreshKey(
      watchState(null, [combatant("c1", "z2")]),
      OWNED
    )
    const after = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [combatant("c1", "z2")]),
      OWNED
    )
    expect(after).toBe(before)
  })

  it("is stable when an enemy takes damage — the sheet is unchanged", () => {
    const before = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [
        combatant("c1", "z1"),
        combatant("e1", "z1", 10, "enemies"),
      ]),
      OWNED
    )
    const after = ownedSheetRefreshKey(
      watchState(TOCCATA_Z1, [
        combatant("c1", "z1"),
        combatant("e1", "z1", 2, "enemies"),
      ]),
      OWNED
    )
    expect(after).toBe(before)
  })

  it("is a constant for a spectator with no owned sheets", () => {
    expect(
      ownedSheetRefreshKey(watchState(TOCCATA_Z1, [combatant("c1", "z1")]), [])
    ).toBe(ownedSheetRefreshKey(watchState(null, []), []))
  })
})
