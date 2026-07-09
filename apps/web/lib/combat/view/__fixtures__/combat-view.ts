import type { Participant, Session } from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type {
  MapConnection,
  MapInstanceState,
  MapZone,
} from "@workspace/game-v2/spatial"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"

/**
 * Literal constructors for the view-builder tests — the smallest valid spatial
 * / session shapes, so each test states only the facts it asserts on.
 */

export function zone(id: string, name: string = id): MapZone {
  return { id, name, description: "", dmNotes: "", position: { x: 0, y: 0 } }
}

export function connection(
  fromZoneId: string,
  toZoneId: string
): MapConnection {
  return {
    id: `${fromZoneId}-${toZoneId}`,
    fromZoneId,
    toZoneId,
    hidden: false,
    locked: false,
  }
}

export function token(
  zoneId: string,
  engagement: Engagement = { status: "free" }
): MapInstanceState["occupancy"][string] {
  return { zoneId, engagement }
}

export function instanceWith(parts: {
  zones?: MapZone[]
  connections?: MapConnection[]
  occupancy?: MapInstanceState["occupancy"]
  enchantment?: MapInstanceState["enchantment"]
}): MapInstanceState {
  return {
    geometry: {
      zones: Object.fromEntries((parts.zones ?? []).map((z) => [z.id, z])),
      connections: Object.fromEntries(
        (parts.connections ?? []).map((c) => [c.id, c])
      ),
    },
    occupancy: parts.occupancy ?? {},
    enchantment: parts.enchantment ?? null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
  }
}

export function sessionWith(
  participants: Participant[],
  currentActorId: ParticipantId | null = null
): Session {
  return {
    round: 1,
    currentActorId,
    advantage: null,
    firstSide: null,
    participants,
  }
}

export function withName(entity: Entity, name: string): Entity {
  return { ...entity, components: { ...entity.components, identity: { name } } }
}

/** Sets authored HP depletion — `damage >= maxHP` makes the entity Fallen. */
export function withDamage(entity: Entity, damage: number): Entity {
  const vitals = entity.components.vitals
  if (vitals === undefined) throw new Error("entity has no vitals to deplete")
  return {
    ...entity,
    components: { ...entity.components, vitals: { ...vitals, damage } },
  }
}

export const inlineMeta: ParticipantMeta = { storage: "inline" }

export function durableMeta(characterId: string): ParticipantMeta {
  return {
    storage: "durable",
    characterId,
    characterShortId: characterId,
    vitalsVersion: 1,
  }
}
