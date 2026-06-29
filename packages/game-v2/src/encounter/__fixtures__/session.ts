import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"

import { asParticipantId } from "../ids"
import { defaultOverlay, type OverlayComponents } from "../overlay"
import { resolveSession, type ResolvedSession } from "../participant-view"
import type { Participant, Session } from "../session"
import type { SpatialReads } from "../spatial-reads"

/** A mapless board — no zones, no enchantment — so `resolveSession` folds in no
 *  zone effects and the views carry no instance keys (the turn-loop unit scenes). */
const MAPLESS_SPATIAL: SpatialReads = {
  zoneOf: () => undefined,
  activeEnchantment: () => null,
}

/**
 * Test fixtures for the session reducer + slices — compact builders that assemble
 * a {@link Session} / {@link Participant} from minimal specs so each test states
 * only the state it exercises. Deliberately *not* the mint (`createSessionFactory`)
 * so a test can seed arbitrary overlay/entity state (an active duration, a wounded
 * enemy) the mint would never produce.
 */

/** A bare entity carrying the given components (defaults to an empty bag). */
export function entity(
  components: Entity["components"] = {},
  id = "e"
): Entity {
  return { id, components }
}

/**
 * One participant with a defaulted overlay, shallow-overridden by `overlay` (pass
 * a whole sub-component to replace it, e.g. `overlay: { conditionDurations: {...} }`).
 * The entity id is derived from the roster id so the two stay distinct (CD2).
 */
export function participantWith(opts: {
  id: string
  side?: CombatSide
  components?: Entity["components"]
  overlay?: Partial<OverlayComponents>
}): Participant {
  return {
    id: asParticipantId(opts.id),
    entity: entity(opts.components ?? {}, `${opts.id}-entity`),
    overlay: {
      ...defaultOverlay({ side: opts.side ?? "players" }),
      ...opts.overlay,
    },
  }
}

/**
 * A session over the given participants, scalars defaulting to a fresh round 1.
 * `currentActorId` takes a plain `string` (branded here) so tests pass roster-id
 * literals without each importing {@link asParticipantId}.
 */
export function sessionOf(
  participants: Participant[],
  scalars: {
    round?: number
    currentActorId?: string | null
    advantage?: CombatAdvantage | null
    firstSide?: CombatSide | null
    mapInstanceId?: string
  } = {}
): Session {
  return {
    round: scalars.round ?? 1,
    currentActorId:
      scalars.currentActorId != null
        ? asParticipantId(scalars.currentActorId)
        : null,
    advantage: scalars.advantage ?? null,
    firstSide: scalars.firstSide ?? null,
    participants,
    ...(scalars.mapInstanceId !== undefined && {
      mapInstanceId: scalars.mapInstanceId,
    }),
  }
}

/** A deterministic id generator (`minted-1`, `minted-2`, …) for roster tests. */
export function counterIds(prefix = "minted"): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

/** One participant in a {@link makeScene} spec: its roster `id`/`side`/`overlay`,
 *  the **resolved** read-units a stub `resolve` should emit for it, and any
 *  authored entity `components` a read off the *authored* entity needs (e.g. a
 *  `mechanics` component for the Frenzy reminder's capability gate). */
export interface SceneSpec {
  id: string
  side?: CombatSide
  overlay?: Partial<OverlayComponents>
  resolved?: ResolvedEntity["components"]
  components?: Entity["components"]
}

/**
 * Builds the participants, a stub `resolve`, and the resolved `view` the turn-loop
 * reads (UNN-518/525) consume — in one step. The stub maps each participant's
 * `entity.id` to the controlled `resolved` components, so a test asserts the read
 * logic against fixed resolved numbers without running the real fold (the unit
 * discipline the resolve tests follow). The `view` is the real {@link resolveSession}
 * over a mapless board, so a test exercises the actual boundary: each view is the
 * spec's `resolved` read-units ∪ the participant's overlay. A participant with no
 * `resolved` spec resolves to an empty bag — the "no read-units" / degenerate case
 * (e.g. an entity carrying no Vitals capability resolves no `vitals`).
 */
export function makeScene(specs: SceneSpec[]): {
  participants: Participant[]
  resolve: (entity: Entity) => ResolvedEntity
  view: ResolvedSession
} {
  const participants = specs.map((spec) =>
    participantWith({
      id: spec.id,
      side: spec.side,
      overlay: spec.overlay,
      components: spec.components,
    })
  )
  const componentsByEntityId = new Map(
    participants.map((participant, index) => [
      participant.entity.id,
      specs[index]!.resolved ?? {},
    ])
  )
  const resolve = (entity: Entity): ResolvedEntity => ({
    id: entity.id,
    components: componentsByEntityId.get(entity.id) ?? {},
  })
  return {
    participants,
    resolve,
    view: resolveSession(sessionOf(participants), MAPLESS_SPATIAL, resolve),
  }
}
