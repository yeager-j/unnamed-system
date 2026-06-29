import type { ResolvedComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics/zone-enchantment"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"

import type { EncounterInstanceComponents } from "./instance"
import type { OverlayComponents } from "./overlay"
import type { Participant, Session } from "./session"
import type { SpatialReads } from "./spatial-reads"

/**
 * The **merged participant-view** the loader assembles for a participant (CD14) — the read
 * surface redaction (UNN-519), the turn loop, and the cast preview fold over. It
 * unions the three physical homes: the **resolved** durable read-units, the **raw**
 * overlay components (always present), and the **raw** instance components (Position
 * / Engagement — present only when spatial). The three key sets are provably
 * disjoint ({@link import("./disjointness")}), so the union is a clean,
 * collision-free record — no key shadows another.
 */
export type ParticipantViewComponents = Partial<ResolvedComponentRegistry> &
  OverlayComponents &
  Partial<EncounterInstanceComponents>

/** A participant's assembled read surface: its id + the three-home merged components. */
export interface ParticipantView {
  id: string
  components: ParticipantViewComponents
}

/**
 * The **resolved-encounter view** {@link resolveSession} produces (UNN-525): every
 * participant's assembled {@link ParticipantView}, keyed by **roster (participant) id**, in
 * `session.participants` order. The single resolved view the whole read model folds
 * over — the turn-loop reads (initiative / fallen / party-composition / display
 * names / end-of-turn) and {@link
 * import("@workspace/game-v2/visibility/snapshot").projectEncounterSnapshot} all
 * consume *this*, never an injected `resolve`. A read that holds no resolve fn can't
 * re-resolve, so the per-participant resolve happens exactly once.
 */
export type ResolvedSession = ReadonlyMap<ParticipantId, ParticipantView>

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
  participantId: ParticipantId
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
 * Assembles the three-home merged {@link ParticipantView} (CD14): the **resolved** durable
 * read-units, then the **raw** overlay components, then the **raw** instance
 * components — each home injected by a structural merge **after** `resolve` has run,
 * never as a fold input (instance state contributes no stat math, and resolve must
 * stay spatial-blind). Disjointness guarantees the later spreads add keys rather
 * than overwrite. `instance` defaults to absent — a mapless participant carries no
 * Position/Engagement, so `engagedWith` is structurally `[]` downstream.
 */
export function assembleParticipantView(
  resolved: ResolvedEntity,
  overlay: OverlayComponents,
  instance: Partial<EncounterInstanceComponents> = {}
): ParticipantView {
  return {
    id: resolved.id,
    components: { ...resolved.components, ...overlay, ...instance },
  }
}

/**
 * The **resolved-encounter-view boundary** (UNN-525): resolve every participant
 * **exactly once, with its zone-enchantment context** ({@link resolveParticipant}),
 * and assemble its three-home {@link ParticipantView} ({@link assembleParticipantView}) — the single
 * {@link ResolvedSession} the turn-loop reads and the snapshot all fold over. This
 * collapses the prior ≈5N+1 per-render `resolveEntity` calls (each read re-resolving
 * every participant) to **N**, and resolves *with* zone context uniformly — so a
 * zone effect that folds into a stat shows identically in initiative and the snapshot
 * (it can't drift, as it once could when the reads resolved context-blind).
 *
 * Built in `session.participants` order; the returned Map preserves it (the
 * `participantDisplayNames` ordinal numbering depends on it). **Mapless** for now:
 * the {@link SpatialReads} port carries only the zone-enchantment reads, not the
 * Position/Engagement instance components, so the views carry no instance keys
 * (`engagedWith` is structurally `[]`). The spatial occupancy projection that fills
 * `assembleParticipantView`'s third argument lands with the spatial combat console.
 */
export function resolveSession(
  session: Session,
  spatial: SpatialReads,
  resolveEntity: ResolveEntity
): ResolvedSession {
  const view = new Map<ParticipantId, ParticipantView>()
  for (const participant of session.participants) {
    const resolved = resolveParticipant(resolveEntity, spatial, participant)
    view.set(
      participant.id,
      assembleParticipantView(resolved, participant.overlay)
    )
  }
  return view
}
