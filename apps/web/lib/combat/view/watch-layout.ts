import {
  appendOrdinals,
  type OverlayComponents,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import type {
  SpatialEncounterSnapshot,
  VisibleCombatant,
} from "@workspace/game-v2/visibility"

import {
  zoneEnchantmentBadge,
  type ZoneEnchantmentBadge,
} from "@/lib/combat/view/zone-enchantment-badge"

/**
 * The watch view's display shaping (UNN-535) — the pure per-render fold that
 * turns the redacted v2 {@link SpatialEncounterSnapshot} into what the watch
 * components render, so the components keep zero `.filter().map()` logic.
 * Everything here is **structural over the redacted components**: a combatant
 * whose `vitals` survived redaction gets an HP pool, one whose key was dropped
 * gets `null` (no affordance, no `0/0` lie) — the RED-4 posture rendered
 * faithfully. Names are disambiguated once ({@link appendOrdinals}, NAME-3) so
 * turn order, rail, and zone tokens number duplicates identically.
 */

/** A current/max display pool. */
export interface Pool {
  current: number
  max: number
}

/** One combatant as every watch surface renders it. */
export interface WatchCombatant {
  id: ParticipantId
  name: string
  side: CombatSide
  isCurrent: boolean
  hasActed: boolean
  /** The occupied zone id, `null` when unplaced (or fog-clamped to `""`). */
  zoneId: string | null
  portraitUrl: string | null
  /** Present iff the `vitals` component survived redaction. */
  hp: Pool | null
  /** Present iff the `skillPool` component survived redaction. */
  sp: Pool | null
  ailments: OverlayComponents["ailments"]
}

/** One zone card of the battlefield grid. */
export interface WatchZoneEntry {
  id: string
  name: string
  adjacentZoneNames: string[]
  combatants: WatchCombatant[]
  enchantment?: ZoneEnchantmentBadge
  /** Both sides share the zone — the dotted "engaged" outline. */
  engaged: boolean
}

/** The battlefield grid: zone cards + the unplaced overflow. */
export interface WatchLayoutView {
  zones: WatchZoneEntry[]
  unplaced: WatchCombatant[]
  hasZones: boolean
}

/** Everything the watch's live/ended surfaces render, derived in one pass. */
export interface WatchView {
  combatants: WatchCombatant[]
  enemies: WatchCombatant[]
  layout: WatchLayoutView
  zoneNameById: Map<string, string>
}

/**
 * Projects one redacted combatant; `name` is the caller's disambiguated label.
 * The wire type marks every component optional (redaction may drop any key);
 * `allegiance`/`turnState`/`ailments` are public-to-all overlay components, so
 * their fallbacks are defensive defaults for a malformed payload, not policy.
 */
function watchCombatant(
  combatant: VisibleCombatant,
  name: string,
  currentActorId: ParticipantId | null
): WatchCombatant {
  const { components } = combatant
  const zoneId = components.position?.zoneId
  return {
    id: combatant.id,
    name,
    side: components.allegiance?.side ?? "enemies",
    isCurrent: combatant.id === currentActorId,
    hasActed: (components.turnState?.turnsTakenThisRound ?? 0) > 0,
    zoneId: zoneId ? zoneId : null,
    portraitUrl: components.presentation?.portraitUrl ?? null,
    hp: components.vitals
      ? { current: components.vitals.currentHP, max: components.vitals.maxHP }
      : null,
    sp: components.skillPool
      ? {
          current: components.skillPool.currentSP,
          max: components.skillPool.maxSP,
        }
      : null,
    ailments: components.ailments ?? [],
  }
}

/** Undirected adjacency names per zone, from the snapshot's full connections. */
function adjacencyNames(
  snapshot: SpatialEncounterSnapshot
): Map<string, string[]> {
  const nameById = new Map(snapshot.zones.map((zone) => [zone.id, zone.name]))
  const byZone = new Map<string, string[]>()
  for (const connection of snapshot.connections) {
    const fromName = nameById.get(connection.fromZoneId)
    const toName = nameById.get(connection.toZoneId)
    if (toName !== undefined) {
      byZone.set(connection.fromZoneId, [
        ...(byZone.get(connection.fromZoneId) ?? []),
        toName,
      ])
    }
    if (fromName !== undefined) {
      byZone.set(connection.toZoneId, [
        ...(byZone.get(connection.toZoneId) ?? []),
        fromName,
      ])
    }
  }
  return byZone
}

/**
 * Shapes the whole watch view from one redacted snapshot: NAME-3 labels in
 * session order, the enemies rail list, and the zone-card battlefield grid
 * (combatants grouped under their zone; stale/clamped zone ids bucket into
 * `unplaced`; the Enchantment badge rides its zone card).
 */
export function buildWatchView(snapshot: SpatialEncounterSnapshot): WatchView {
  const labels = appendOrdinals(
    snapshot.combatants.map(
      (combatant) => combatant.components.identity?.name ?? combatant.id
    )
  )
  const currentActorId = snapshot.currentActor?.id ?? null
  const combatants = snapshot.combatants.map((combatant, index) =>
    watchCombatant(combatant, labels[index]!, currentActorId)
  )

  const zoneIds = new Set(snapshot.zones.map((zone) => zone.id))
  const adjacency = adjacencyNames(snapshot)
  const enchantment = snapshot.enchantment ?? null

  const zones = snapshot.zones.map((zone) => {
    const inZone = combatants.filter(
      (combatant) => combatant.zoneId === zone.id
    )
    return {
      id: zone.id,
      name: zone.name,
      adjacentZoneNames: adjacency.get(zone.id) ?? [],
      combatants: inZone,
      enchantment: zoneEnchantmentBadge(enchantment, zone.id),
      engaged:
        inZone.some((combatant) => combatant.side === "players") &&
        inZone.some((combatant) => combatant.side === "enemies"),
    }
  })

  const unplaced = combatants.filter(
    (combatant) => combatant.zoneId === null || !zoneIds.has(combatant.zoneId)
  )

  return {
    combatants,
    enemies: combatants.filter((combatant) => combatant.side === "enemies"),
    layout: { zones, unplaced, hasZones: snapshot.zones.length > 0 },
    zoneNameById: new Map(snapshot.zones.map((zone) => [zone.id, zone.name])),
  }
}
