import {
  type CombatantSetup,
  type MapInstanceState,
} from "@workspace/game/foundation"

import type { CharacterSummary } from "@/lib/db/queries/character-list"

import { type DungeonSetupZoneToken } from "./canvas/dungeon-setup-token-chip"
import { type SetupEnemyRow } from "./dungeon-setup-sidebar"

type Occupancy = MapInstanceState["occupancy"]

/**
 * The combatant roster the Setup phase hands the start dialog's Agility/initiative
 * comparison: the toggled-in PCs (keyed by `characterId` so the comparison reads
 * each one's delve token) followed by the staged enemies, count-expanded. Pure.
 */
export function buildSetupCombatants(
  includedIds: Set<string>,
  enemies: SetupEnemyRow[],
  occupancy: Occupancy
): CombatantSetup[] {
  const pcs: CombatantSetup[] = [...includedIds].map((characterId) => ({
    id: characterId,
    side: "players",
    ref: { kind: "pc", characterId },
    zoneId: occupancy[characterId]?.zoneId ?? "",
  }))
  const foes: CombatantSetup[] = enemies.flatMap((enemy) =>
    Array.from({ length: enemy.count }, () => ({
      side: "enemies" as const,
      ref: { kind: "catalog-enemy" as const, enemyKey: enemy.enemyKey },
      zoneId: enemy.zoneId,
    }))
  )
  return [...pcs, ...foes]
}

/**
 * The Setup board's tokens keyed by Zone id: the delve PC tokens (carrying their
 * live inclusion state) plus the staged enemy ghosts, count-expanded. PCs land in
 * their occupancy Zone; an enemy is skipped until it has a staged Zone. Pure — the
 * shape {@link import("./canvas/dungeon-setup-token-chip").DungeonSetupTokenChip}
 * renders.
 */
export function buildSetupTokensByZone(
  partyCandidates: CharacterSummary[],
  enemies: SetupEnemyRow[],
  includedIds: Set<string>,
  occupancy: Occupancy
): Record<string, DungeonSetupZoneToken[]> {
  const byZone: Record<string, DungeonSetupZoneToken[]> = {}
  for (const character of partyCandidates) {
    const zoneId = occupancy[character.id]?.zoneId ?? ""
    ;(byZone[zoneId] ??= []).push({
      id: character.id,
      name: character.name,
      portraitUrl: character.portraitUrl,
      side: "players",
      isPc: true,
      included: includedIds.has(character.id),
    })
  }
  for (const enemy of enemies) {
    if (enemy.zoneId === "") continue
    for (let index = 0; index < enemy.count; index += 1) {
      ;(byZone[enemy.zoneId] ??= []).push({
        id: `${enemy.tmpId}-${index}`,
        name: enemy.name,
        portraitUrl: null,
        side: "enemies",
        isPc: false,
        included: true,
      })
    }
  }
  return byZone
}
