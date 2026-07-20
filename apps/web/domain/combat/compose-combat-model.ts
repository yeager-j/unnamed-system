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
 * event-owned encounter frame (UNN-653; widened by UNN-656 and UNN-657). A
 * ready Encounter root owns the session facts migrated to it: round, current
 * actor, every participant overlay, and the full stored entity for inline
 * participants.
 *
 * **Roster membership is version-arbitrated (UNN-657).** The roster changes
 * through two channels with independent latencies: replica intent (inline
 * adds — visible in the root's projection immediately, in the frame only
 * after revalidation) and commands (removes, placed/durable adds — visible in
 * the frame after their transition, in the root only after the invalidation
 * pull). Blindly trusting either side races the other: a frame-led roster
 * resurrects nothing but hides an optimistic add; a root-led roster shows the
 * add but resurrects a command-removed participant until the pull lands. Both
 * sides carry the same row's version, so the newer side decides membership:
 * when the root's version is at or ahead of the frame's, root-only inline
 * shells are appended whole and frame participants absent from the root are
 * dropped; when the frame is ahead, its roster stands untouched until the
 * root catches up. Durable references absent from the frame always wait for
 * the refresh — their hydration is command-owned loader work. Ready durable
 * roots replace only their combat subset.
 */
export function composeCombatModel({
  eventFrame,
  loaderVersion,
  encounterReplicaSnapshot,
  durableReplicaSnapshots,
  participantMeta,
}: {
  eventFrame: EncounterState
  /** The encounter row version the loader frame was hydrated from. */
  loaderVersion: number
  encounterReplicaSnapshot: EncounterReplicaSnapshot | null
  durableReplicaSnapshots: ReadonlyMap<string, CombatDurableReplicaSnapshot>
  participantMeta: Record<string, ParticipantMeta>
}): EncounterState {
  const root = encounterReplicaSnapshot?.value
  const encounterSession = root?.session
  const rootDecidesRoster = root !== undefined && root.version >= loaderVersion
  let changed = encounterSession !== undefined
  const retained = rootDecidesRoster
    ? eventFrame.session.participants.filter((participant) =>
        encounterSession!.participants.some(
          (shell) => shell.id === participant.id
        )
      )
    : eventFrame.session.participants
  if (retained.length !== eventFrame.session.participants.length) changed = true
  const participants = retained.map((participant) => {
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

  const appended =
    !rootDecidesRoster || encounterSession === undefined
      ? []
      : encounterSession.participants.flatMap((shell) =>
          shell.entity.storage === "inline" &&
          !eventFrame.session.participants.some(
            (participant) => participant.id === shell.id
          )
            ? [
                {
                  id: shell.id,
                  entity: shell.entity.entity,
                  overlay: shell.overlay,
                },
              ]
            : []
        )
  if (appended.length > 0) changed = true

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
      participants: [...participants, ...appended],
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
