import type { EncounterState } from "@workspace/game-v2/encounter"
import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { ReplicaSnapshot } from "@workspace/replica"

import type { ParticipantMeta } from "./participant-meta"
import {
  pickCombatComponents,
  type CombatDurableState,
  type CombatEntityComponents,
  type EncounterReplicaState,
} from "./replica/mutations"
import type { CombatReplicaRejection } from "./replica/rejection"

export type CombatDurableReplicaSnapshot = ReplicaSnapshot<
  CombatDurableState,
  CombatReplicaRejection
>

export type EncounterReplicaSnapshot = ReplicaSnapshot<
  EncounterReplicaState,
  CombatReplicaRejection
>

export interface CombatReplicaSnapshots {
  readonly encounterReplicaSnapshot: EncounterReplicaSnapshot | null
  readonly durableReplicaSnapshots: ReadonlyMap<
    string,
    CombatDurableReplicaSnapshot
  >
}

const COMBAT_COMPONENT_KEYS = [
  "vitals",
  "skillPool",
  "resources",
  "mechanics",
] as const

/**
 * The one composition seam joining ready Replica projections onto the
 * event-owned encounter frame (UNN-653; encounter root UNN-655). This ticket
 * takes exactly the facts whose writes ride the replicas today — the four
 * combat-writable components, inline ones read from the encounter root's
 * shell (narrowed to the same four keys at this seam; the root itself is
 * unredacted storage), durable ones from their entity roots. The remaining
 * encounter-owned facts (scalars, roster order, overlays) stay with the
 * event frame until their intents ride the encounter replica (UNN-656),
 * which widens this seam in place.
 */
export function composeCombatModel({
  eventFrame,
  encounterReplicaSnapshot,
  durableReplicaSnapshots,
  participantMeta,
}: {
  eventFrame: EncounterState
  encounterReplicaSnapshot: EncounterReplicaSnapshot | null
  durableReplicaSnapshots: ReadonlyMap<string, CombatDurableReplicaSnapshot>
  participantMeta: Record<string, ParticipantMeta>
}): EncounterState {
  let changed = false
  const participants = eventFrame.session.participants.map((participant) => {
    const meta = participantMeta[participant.id]
    const projected = projectedComponents(
      participant.id,
      meta,
      encounterReplicaSnapshot,
      durableReplicaSnapshots
    )
    if (projected === undefined) return participant

    changed = true
    return {
      ...participant,
      entity: {
        ...participant.entity,
        components: replaceCombatComponents(
          participant.entity.components,
          projected
        ),
      },
    }
  })

  if (!changed) return eventFrame
  return {
    ...eventFrame,
    session: { ...eventFrame.session, participants },
  }
}

function projectedComponents(
  participantId: string,
  meta: ParticipantMeta | undefined,
  encounterReplicaSnapshot: EncounterReplicaSnapshot | null,
  durableReplicaSnapshots: ReadonlyMap<string, CombatDurableReplicaSnapshot>
): CombatEntityComponents | undefined {
  if (meta?.storage === "durable") {
    return durableReplicaSnapshots.get(meta.characterId)?.value.components
  }
  if (meta?.storage === "inline") {
    const shell = encounterReplicaSnapshot?.value.session.participants.find(
      (participant) => participant.id === participantId
    )
    if (shell?.entity.storage !== "inline") return undefined
    return pickCombatComponents(shell.entity.entity.components)
  }
  return undefined
}

function replaceCombatComponents(
  current: Partial<ComponentRegistry>,
  projected: CombatEntityComponents
): Partial<ComponentRegistry> {
  const retained = { ...current }
  for (const key of COMBAT_COMPONENT_KEYS) delete retained[key]
  return { ...retained, ...projected }
}
