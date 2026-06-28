import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import { defaultOverlay, type OverlayComponents } from "../overlay"
import type { Participant, Session } from "../session"

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
    id: opts.id,
    entity: entity(opts.components ?? {}, `${opts.id}-entity`),
    overlay: {
      ...defaultOverlay({ side: opts.side ?? "players" }),
      ...opts.overlay,
    },
  }
}

/** A session over the given participants, scalars defaulting to a fresh round 1. */
export function sessionOf(
  participants: Participant[],
  scalars: Partial<
    Pick<
      Session,
      "round" | "currentActorId" | "advantage" | "firstSide" | "mapInstanceId"
    >
  > = {}
): Session {
  return {
    round: scalars.round ?? 1,
    currentActorId: scalars.currentActorId ?? null,
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
