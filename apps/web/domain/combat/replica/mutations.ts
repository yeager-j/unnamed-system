import { z } from "zod/v4"

import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  defineMutation,
  defineMutations,
  type InvocationOf,
  type MutationRegistry,
} from "@workspace/replica"
import { err, ok } from "@workspace/result"

import { mergeComponents } from "../../entity/commit/merge-patch"
import { combatEntityWriteSchema } from "../../entity/commit/write.schema"
import {
  applyEntityWrite,
  type EntityWriteRefusal,
} from "../../entity/commit/writers"

/**
 * The combat replica roots (UNN-646). Combat has two persistence homes, so it
 * has two roots — replica granularity follows the authority's commit scope
 * (the row-lock + auth boundary), never the UI's dispatch scope:
 *
 * - **Durable**: one replica per durable participant's `entity` row. Its root
 *   is that entity's combat-writable components — deliberately NOT the owner
 *   root (`EntityReplicaState`): no columns, no narrative, nothing the DM may
 *   not hold. The narrowing is structural redaction, pinned by the snapshot
 *   door's security test.
 * - **Inline**: ONE collection-valued replica per encounter, over every
 *   inline participant's components. They share one row (the session blob),
 *   one scalar version, one auth gate, and one lifetime.
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

/** Inline home: every inline participant of one encounter, keyed by roster id. */
export interface CombatInlineState {
  readonly participants: Readonly<Record<string, CombatEntityComponents>>
}

/**
 * A Writer refusal on either root, plus the inline root's roster refusal:
 * a pending write whose participant an external roster change removed
 * refuses on replay and surfaces as a rebase conflict — preconditioned
 * intent, not silently dropped.
 */
export type CombatWriteRefusal = EntityWriteRefusal | "participant-not-found"

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

/** The inline home's mutation: one component write addressed to one inline
 *  roster participant. */
export const writeCombatInline = defineMutation({
  name: "combat.session.write",
  args: z.object({
    participantId: participantIdSchema,
    write: combatEntityWriteSchema,
  }),
  apply(state: CombatInlineState, { participantId, write }) {
    const components = state.participants[participantId]
    if (components === undefined)
      return err<CombatWriteRefusal>("participant-not-found")
    const patch = applyEntityWrite(components, write)
    if (!patch.ok) return err<CombatWriteRefusal>(patch.error)
    return ok({
      participants: {
        ...state.participants,
        [participantId]: pickCombatComponents(
          mergeComponents(components, patch.value)
        ),
      },
    })
  },
})

export type CombatDurableInvocation = InvocationOf<typeof writeCombatEntity>
export type CombatInlineInvocation = InvocationOf<typeof writeCombatInline>

export const combatDurableMutations: MutationRegistry<
  CombatDurableState,
  CombatDurableInvocation,
  CombatWriteRefusal
> = defineMutations([writeCombatEntity])

export const combatInlineMutations: MutationRegistry<
  CombatInlineState,
  CombatInlineInvocation,
  CombatWriteRefusal
> = defineMutations([writeCombatInline])
