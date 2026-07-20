import type { EncounterState } from "@workspace/game-v2/encounter"
import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { ReplicaSnapshot } from "@workspace/replica"

import type { ParticipantMeta } from "./participant-meta"
import {
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

/**
 * Replica invalidations normally converge locally. A route refresh is needed
 * only when the accepted Encounter root reveals a command-owned fact whose
 * hydration still belongs to the loader frame: lifecycle or roster/locator
 * shape. Session intent fields are intentionally absent from this comparison.
 */
export function encounterRootDiffersFromLoaderFrame(
  root: EncounterReplicaState,
  loader: {
    readonly status: EncounterReplicaState["status"]
    readonly session: EncounterState["session"]
    readonly participantMeta: Record<string, ParticipantMeta>
  }
): boolean {
  if (root.status !== loader.status) return true
  if (root.session.participants.length !== loader.session.participants.length) {
    return true
  }
  return root.session.participants.some((shell, index) => {
    if (loader.session.participants[index]?.id !== shell.id) return true
    const meta = loader.participantMeta[shell.id]
    if (shell.entity.storage === "inline") return meta?.storage !== "inline"
    return (
      meta?.storage !== "durable" || meta.characterId !== shell.entity.entityId
    )
  })
}

const COMBAT_COMPONENT_KEYS = [
  "vitals",
  "skillPool",
  "resources",
  "mechanics",
] as const

/**
 * The one composition seam joining ready Replica projections onto the
 * event-owned encounter frame (UNN-653; widened by UNN-656). A ready Encounter
 * root owns the session facts migrated to it: round, current actor, every
 * participant overlay, and the full stored entity for inline participants.
 * Command-owned roster shape and durable hydration still come from the RSC
 * frame until UNN-657; ready durable roots replace only their combat subset.
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
  const encounterSession = encounterReplicaSnapshot?.value.session
  let changed = encounterSession !== undefined
  const participants = eventFrame.session.participants.map((participant) => {
    const meta = participantMeta[participant.id]
    const shell = encounterSession?.participants.find(
      (entry) => entry.id === participant.id
    )
    if (shell?.entity.storage === "inline") {
      changed = true
      return {
        ...participant,
        entity: shell.entity.entity,
        overlay: shell.overlay,
      }
    }

    const projected =
      meta?.storage === "durable"
        ? durableReplicaSnapshots.get(meta.characterId)?.value.components
        : undefined
    if (shell === undefined && projected === undefined) return participant
    changed = true
    return {
      ...participant,
      ...(shell === undefined ? {} : { overlay: shell.overlay }),
      ...(projected === undefined
        ? {}
        : {
            entity: {
              ...participant.entity,
              components: replaceCombatComponents(
                participant.entity.components,
                projected
              ),
            },
          }),
    }
  })

  if (!changed) return eventFrame
  return {
    ...eventFrame,
    session: {
      ...eventFrame.session,
      ...(encounterSession === undefined
        ? {}
        : {
            round: encounterSession.round,
            currentActorId: encounterSession.currentActorId,
          }),
      participants,
    },
  }
}

function replaceCombatComponents(
  current: Partial<ComponentRegistry>,
  projected: CombatEntityComponents
): Partial<ComponentRegistry> {
  const retained = { ...current }
  for (const key of COMBAT_COMPONENT_KEYS) delete retained[key]
  return { ...retained, ...projected }
}
