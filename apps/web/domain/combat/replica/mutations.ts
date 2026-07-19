import { z } from "zod/v4"

import type { SessionShell } from "@workspace/game-v2/encounter"
import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  defineMutation,
  defineMutations,
  type InvocationOf,
  type MutationRegistry,
} from "@workspace/replica"
import { err, ok } from "@workspace/result"

import type { EncounterStatus } from "@/lib/db/schema/encounter"

import { mergeComponents } from "../../entity/commit/merge-patch"
import { combatEntityWriteSchema } from "../../entity/commit/write.schema"
import {
  applyEntityWrite,
  type EntityWriteRefusal,
} from "../../entity/commit/writers"

/**
 * The combat replica roots (UNN-646, storage-native encounter root UNN-655).
 * Combat has two persistence homes, so it has two root families — replica
 * granularity follows the authority's commit scope (the row-lock + auth
 * boundary), never the UI's dispatch scope:
 *
 * - **Durable**: one replica per durable participant's `entity` row. Its root
 *   is that entity's combat-writable components — deliberately NOT the owner
 *   root (`EntityReplicaState`): no columns, no narrative, nothing the DM may
 *   not hold. The narrowing is structural redaction, pinned by the snapshot
 *   door's security test.
 * - **Encounter**: ONE replica per encounter row, whose value is the row's
 *   own atomically stored facts — `status` plus the storage-native
 *   {@link SessionShell} (scalars, roster order, overlays, inline entities,
 *   durable *references*). Durable entity values and Map Instance state are
 *   structurally absent: they live under other rows' locks, gates, cursors,
 *   and lifetimes, and are joined into views by the application composition
 *   seam, never copied into this root.
 *
 * A single replica spanning both homes was considered and rejected: it would
 * need an atomic accepted observation across N entity rows plus the blob, and
 * it would couple both persistence homes into one transaction scope — exactly
 * the cross-replica coordination the design defers. The durable/inline branch
 * stays at the app's ownership decision point, which returns the appropriate
 * replica; `@workspace/replica` learns nothing about combatants.
 */
export type CombatEntityComponents = Partial<
  Pick<ComponentRegistry, "vitals" | "skillPool" | "resources" | "mechanics">
>

/** The structural redaction: exactly what the combat Writers read and write
 *  (verified against `ENTITY_WRITERS` — each combat arm touches only its own
 *  component; mechanics resolves its registry statically). Dropped components
 *  are structurally absent, never `undefined`-valued. */
export function pickCombatComponents(
  components: Partial<ComponentRegistry>
): CombatEntityComponents {
  const { vitals, skillPool, resources, mechanics } = components
  return {
    ...(vitals !== undefined ? { vitals } : {}),
    ...(skillPool !== undefined ? { skillPool } : {}),
    ...(resources !== undefined ? { resources } : {}),
    ...(mechanics !== undefined ? { mechanics } : {}),
  }
}

/** Durable home: one durable participant's entity row. */
export interface CombatDurableState {
  readonly components: CombatEntityComponents
}

/**
 * The encounter root (UNN-655): the encounter row's own facts, whole. The
 * shell's inline entities carry their FULL component bags — the root is the
 * storage, and the gate (campaign DM, the row's sole sanctioned writer) is
 * its whole license; the four-component narrowing remains the durable roots'
 * posture. `EncounterStatus` rides along so the liveness precondition is one
 * decided-once code path across optimistic apply, rebase, and the authority's
 * locked apply.
 */
export interface EncounterReplicaState {
  readonly status: EncounterStatus
  readonly session: SessionShell
}

/**
 * A Writer refusal on either root, plus the encounter root's roster refusal:
 * a pending write whose participant an external roster change removed
 * refuses on replay and surfaces as a rebase conflict — preconditioned
 * intent, not silently dropped.
 */
export type CombatWriteRefusal = EntityWriteRefusal | "participant-not-found"

/**
 * The encounter mutation's full refusal set. `participant-not-inline` and
 * `encounter-not-live` were door-only codes before UNN-655; with the root
 * carrying the locator arms and the status, both preconditions are decided
 * in the one registered apply — an optimistic dispatch, a rebase replay, and
 * the authority's locked delivery all refuse identically.
 */
export type EncounterWriteRefusal =
  | CombatWriteRefusal
  | "participant-not-inline"
  | "encounter-not-live"

/**
 * The durable home's mutation: args ARE the encounter door's existing
 * `CombatEntityWrite` subset (pools/resources/mechanics — the same
 * schema-level vocabulary restriction the classic door pinned with a
 * rejection test), applied by the same `applyEntityWrite` the authority
 * commits with. Named apart from the owner door's `entity.write` so the
 * combat authority's decode admits exactly this subset.
 */
export const writeCombatEntity = defineMutation({
  name: "combat.entity.write",
  args: combatEntityWriteSchema,
  apply(state: CombatDurableState, write) {
    const patch = applyEntityWrite(state.components, write)
    if (!patch.ok) return err<CombatWriteRefusal>(patch.error)
    return ok({
      components: pickCombatComponents(
        mergeComponents(state.components, patch.value)
      ),
    })
  },
})

/**
 * The encounter root's mutation: one component write addressed to one INLINE
 * roster participant, applied to the inline entity data inside the
 * storage-native root. A durable-addressed write fails closed
 * (`participant-not-inline` — the home is the stored locator's fact, so a
 * wrong client belief cannot mis-route), and a non-live encounter refuses
 * before any state is touched. Both sides of the wire run THIS apply: the
 * client predicts with it and the authority commits with it against the shell
 * built from the locked row.
 */
export const writeEncounterInline = defineMutation({
  name: "encounter.writeInline",
  args: z.object({
    participantId: participantIdSchema,
    write: combatEntityWriteSchema,
  }),
  apply(state: EncounterReplicaState, { participantId, write }) {
    if (state.status !== "live")
      return err<EncounterWriteRefusal>("encounter-not-live")
    const index = state.session.participants.findIndex(
      (participant) => participant.id === participantId
    )
    const shell = state.session.participants[index]
    if (shell === undefined)
      return err<EncounterWriteRefusal>("participant-not-found")
    if (shell.entity.storage !== "inline")
      return err<EncounterWriteRefusal>("participant-not-inline")

    const entity = shell.entity.entity
    const patch = applyEntityWrite(entity.components, write)
    if (!patch.ok) return err<EncounterWriteRefusal>(patch.error)

    const participants = state.session.participants.map((participant, at) =>
      at === index
        ? {
            ...shell,
            entity: {
              storage: "inline" as const,
              entity: {
                ...entity,
                components: mergeComponents(entity.components, patch.value),
              },
            },
          }
        : participant
    )
    return ok({
      ...state,
      session: { ...state.session, participants },
    })
  },
})

export type CombatDurableInvocation = InvocationOf<typeof writeCombatEntity>
export type EncounterInvocation = InvocationOf<typeof writeEncounterInline>

export const combatDurableMutations: MutationRegistry<
  CombatDurableState,
  CombatDurableInvocation,
  CombatWriteRefusal
> = defineMutations([writeCombatEntity])

export const encounterMutations: MutationRegistry<
  EncounterReplicaState,
  EncounterInvocation,
  EncounterWriteRefusal
> = defineMutations([writeEncounterInline])
