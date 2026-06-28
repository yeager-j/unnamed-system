import type { ResolvedComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics/zone-enchantment"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"

import type { EncounterInstanceComponents } from "./instance"
import type { OverlayComponents } from "./overlay"
import type { Participant } from "./session"
import type { SpatialReads } from "./spatial-reads"

/**
 * The **merged read-bag** the loader assembles for a participant (CD14) — the read
 * surface redaction (UNN-519), the turn loop, and the cast preview fold over. It
 * unions the three physical homes: the **resolved** durable read-units, the **raw**
 * overlay components (always present), and the **raw** instance components (Position
 * / Engagement — present only when spatial). The three key sets are provably
 * disjoint ({@link import("./disjointness")}), so the union is a clean,
 * collision-free record — no key shadows another.
 */
export type ReadBagComponents = Partial<ResolvedComponentRegistry> &
  OverlayComponents &
  Partial<EncounterInstanceComponents>

/** A participant's assembled read surface: its id + the three-home merged bag. */
export interface ReadBag {
  id: string
  components: ReadBagComponents
}

/** A resolve function (the mechanic-aware `resolveEntity` from the composition root). */
type ResolveEntity = (
  entity: Entity,
  context?: ResolveContext
) => ResolvedEntity

/**
 * The zone-enchantment effects a participant standing in its zone receives (CD15) —
 * the projection of the narrow {@link SpatialReads} port through the existing
 * {@link zoneEnchantmentEffects} helper. Empty when the participant is unplaced
 * (`zoneOf` → `undefined`), no enchantment is active, or it stands in a different
 * zone — so a mapless encounter folds in nothing.
 */
export function participantZoneEffects(
  spatial: SpatialReads,
  participantId: string
): CombatantEffect[] {
  const zoneId = spatial.zoneOf(participantId)
  if (zoneId === undefined) return []
  return zoneEnchantmentEffects(spatial.activeEnchantment(), zoneId)
}

/**
 * Resolves a participant's entity with its **zone-enchantment effects** piped into
 * `ResolveContext.effects` (CD15) — the one combat → spatial read into resolution.
 * `resolveEntity` partitions the effects: Toccata's Attack-Roll bonus surfaces in
 * the `pendingEffects` read-unit (display-only per the locked parity scope, never
 * auto-applied). This is the **only** engine-modeled combat → spatial read; resolve
 * itself never touches spatial state.
 */
export function resolveParticipant(
  resolveEntity: ResolveEntity,
  spatial: SpatialReads,
  participant: Participant
): ResolvedEntity {
  return resolveEntity(participant.entity, {
    effects: participantZoneEffects(spatial, participant.id),
  })
}

/**
 * Assembles the three-home merged {@link ReadBag} (CD14): the **resolved** durable
 * read-units, then the **raw** overlay components, then the **raw** instance
 * components — each home injected by a structural merge **after** `resolve` has run,
 * never as a fold input (instance state contributes no stat math, and resolve must
 * stay spatial-blind). Disjointness guarantees the later spreads add keys rather
 * than overwrite. `instance` defaults to absent — a mapless participant carries no
 * Position/Engagement, so `engagedWith` is structurally `[]` downstream.
 */
export function assembleReadBag(
  resolved: ResolvedEntity,
  overlay: OverlayComponents,
  instance: Partial<EncounterInstanceComponents> = {}
): ReadBag {
  return {
    id: resolved.id,
    components: { ...resolved.components, ...overlay, ...instance },
  }
}
