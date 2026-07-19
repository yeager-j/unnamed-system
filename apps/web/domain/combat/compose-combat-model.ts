import type { EncounterState } from "@workspace/game-v2/encounter"
import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { ReplicaSnapshot } from "@workspace/replica"

import type { ParticipantMeta } from "./participant-meta"
import type {
  CombatDurableState,
  CombatEntityComponents,
  CombatInlineState,
} from "./replica/mutations"
import type { CombatReplicaRejection } from "./replica/rejection"

export type CombatDurableReplicaSnapshot = ReplicaSnapshot<
  CombatDurableState,
  CombatReplicaRejection
>

export type CombatInlineReplicaSnapshot = ReplicaSnapshot<
  CombatInlineState,
  CombatReplicaRejection
>

export interface CombatReplicaSnapshots {
  readonly inlineReplicaSnapshot: CombatInlineReplicaSnapshot | null
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

export function composeCombatModel({
  eventFrame,
  inlineReplicaSnapshot,
  durableReplicaSnapshots,
  participantMeta,
}: {
  eventFrame: EncounterState
  inlineReplicaSnapshot: CombatInlineReplicaSnapshot | null
  durableReplicaSnapshots: ReadonlyMap<string, CombatDurableReplicaSnapshot>
  participantMeta: Record<string, ParticipantMeta>
}): EncounterState {
  let changed = false
  const participants = eventFrame.session.participants.map((participant) => {
    const meta = participantMeta[participant.id]
    const projected = projectedComponents(
      participant.id,
      meta,
      inlineReplicaSnapshot,
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
  inlineReplicaSnapshot: CombatInlineReplicaSnapshot | null,
  durableReplicaSnapshots: ReadonlyMap<string, CombatDurableReplicaSnapshot>
): CombatEntityComponents | undefined {
  if (meta?.storage === "durable") {
    return durableReplicaSnapshots.get(meta.characterId)?.value.components
  }
  if (meta?.storage === "inline") {
    return inlineReplicaSnapshot?.value.participants[participantId]
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
