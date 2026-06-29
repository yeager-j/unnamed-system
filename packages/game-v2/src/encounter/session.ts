import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"

import { defaultOverlay, type OverlayComponents } from "./overlay"

/**
 * The encounter **Session** + **Participant** — the pure container the whole
 * encounter subsystem stands on (ADR §2.1; CD2). The encounter is **not an
 * entity** (D29): it is a container of four v1 scalars (carried verbatim — same
 * names, nullability, vocab) plus an ordered `Participant[]`.
 *
 * The **F1 kill**: the runtime {@link Participant} carries **no storage
 * discriminant**. v1's `CombatantRef` (`pc | enemy | catalog-enemy`) union
 * dissolves into a uniform `entity` — every consumer (`resolve`, the reducer,
 * redaction, initiative, fallen, party-composition) reads `participant.entity`
 * with zero `kind` branch. The durable-vs-inline **storage** home lives only at
 * the app boundary (UNN-516's impure out-of-band locator map), never here.
 */

/**
 * One combatant in the encounter: a stable roster `id`, the dissolved `entity`
 * (a bag of capability components), and the always-present {@link
 * OverlayComponents} bundle.
 *
 * `id` is the **combatant key**, intentionally distinct from `entity.id` (CD2):
 * overlay + turn-order key on the roster id, and a durable entity could in
 * principle appear twice. The wrapper is retained (not collapsed to `Entity[]`)
 * precisely to home the overlay beside — never inside — `entity.components`, so
 * transient ailments/turn-state never leak across encounters via the entity row.
 */
export interface Participant {
  id: ParticipantId
  entity: Entity
  overlay: OverlayComponents
}

/**
 * The full Session: the four scalars (`round` 1-based; `currentActorId`;
 * `advantage`/`firstSide`, both `null` until the `startCombat` event, recorded
 * verbatim with no normalisation per R2.1) and the ordered roster. `mapInstanceId`
 * is the inert Tier-3 seam (D28): the **session reducer touches it never** (R24.5);
 * only the `reduceEncounter` root (UNN-517) reads it to load the paired instance.
 */
export interface Session {
  round: number
  currentActorId: ParticipantId | null
  advantage: CombatAdvantage | null
  firstSide: CombatSide | null
  participants: Participant[]
  mapInstanceId?: string
}

/**
 * Builds one fresh {@link Participant} from a dissolved `entity`, a roster `id`,
 * and its allegiance — the v2 analogue of v1's `makeCombatant`, with the overlay
 * defaulted by {@link defaultOverlay} (R1.1). Shared by the {@link
 * import("./session-factory").createSessionFactory mint} and UNN-517's
 * `addParticipant` reducer slice so the overlay-construction lives in one place.
 */
export function makeParticipant(
  entity: Entity,
  id: ParticipantId,
  overlay: { side: CombatSide; hasActed?: boolean }
): Participant {
  return { id, entity, overlay: defaultOverlay(overlay) }
}
