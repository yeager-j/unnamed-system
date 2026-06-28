import type { PartyComposition } from "@workspace/game-v2/combat/party"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import {
  COMBAT_SIDES,
  type CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"

import type { Participant } from "./session"

/**
 * Derives the {@link PartyComposition} for one {@link CombatSide} from the live
 * roster — the encounter-scoped input the `perPartyLineage` Attack-Roll scaler
 * (Magic Circle / Ailment Boost) needs (CD9c). Counts each PC on `side` by its
 * Lineage, **including the caster itself** (the rule counts allies present in the
 * encounter).
 *
 * **The F1 kill (CD9c):** v1 keyed on `ref.kind === "pc"` and then looked the
 * Lineage up in an injected `lineageByCharacterId` map. v2 detects a PC **by
 * capability**: the resolved Archetypes read-unit's `activeLineage`. A participant
 * with no resolvable active Lineage — an enemy (no Archetypes component) or a PC
 * with no active Archetype — is skipped, with zero `kind` branch and no injected
 * map. The side is the **allegiance overlay**, so a charmed PC tallies on the side
 * it currently fights for. The result is sparse, keyed over `LINEAGES`.
 */
export function derivePartyComposition(
  participants: readonly Participant[],
  side: CombatSide,
  resolve: (entity: Entity) => ResolvedEntity
): PartyComposition {
  const composition: PartyComposition = {}
  for (const participant of participants) {
    if (participant.overlay.allegiance.side !== side) continue
    const lineage = resolve(participant.entity).components.archetypes
      ?.activeLineage
    if (!lineage) continue
    composition[lineage] = (composition[lineage] ?? 0) + 1
  }
  return composition
}

/**
 * The per-side {@link PartyComposition} map — {@link derivePartyComposition} for
 * every {@link CombatSide}, so a caller deriving a participant's sheet can index by
 * the participant's own side rather than re-deriving per PC.
 */
export function derivePartyCompositionBySide(
  participants: readonly Participant[],
  resolve: (entity: Entity) => ResolvedEntity
): Record<CombatSide, PartyComposition> {
  return Object.fromEntries(
    COMBAT_SIDES.map((side) => [
      side,
      derivePartyComposition(participants, side, resolve),
    ])
  ) as Record<CombatSide, PartyComposition>
}
