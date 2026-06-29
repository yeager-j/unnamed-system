import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ZoneEnchantment } from "@workspace/game-v2/mechanics/zone-enchantment.schema"

/**
 * The **combat → spatial read interface** (CD15) — a narrow, one-way port the
 * encounter loader receives **injected**, never a spatial-state module combat
 * imports. Combat declares what it needs; the spatial layer implements it (the
 * Map-Instance runs in exploration with no combat session, so the dependency must
 * not point back). This is the **only** engine-modeled combat → spatial read: it
 * feeds the zone-enchantment effect into `resolve` (un-deferring Toccata into
 * `pendingEffects`, display-only, R19.5).
 *
 * Fenced to **exactly two reads** — ranges stay DM-adjudicated vocabulary and
 * opportunity-attacks stay prose (no `validTargets`, no auto reactions), and the
 * action budget stays the constant 1/1/1 (Tarantella's grant is prose). The
 * parameterless singleton {@link SpatialReads.activeEnchantment} bakes in the
 * one-active-enchantment rule (one Bard, one nullable enchantment — v1/v2 ground
 * truth); the single point a future multi-zone model would widen. The instance
 * participant-view components (Position / Engagement) are **not** sourced here —
 * they are a
 * separate raw occupancy-token projection supplied to {@link
 * import("./participant-view").assembleParticipantView} (the spatial layer owns it).
 */
export interface SpatialReads {
  /** The zone a participant occupies, or `undefined` when unplaced / mapless. */
  zoneOf(participantId: ParticipantId): string | undefined
  /** The session's single active Zone Enchantment, or `null` when none / mapless. */
  activeEnchantment(): ZoneEnchantment | null
}
