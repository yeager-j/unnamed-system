import { z } from "zod/v4"

import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import {
  defineMutation,
  defineMutations,
  type InvocationOf,
  type MutationRegistry,
} from "@workspace/replica"
import { err, ok } from "@workspace/result"

import { mergeComponents } from "../commit/merge-patch"
import { entityWriteSchema } from "../commit/write.schema"
import { applyEntityWrite, type EntityWriteRefusal } from "../commit/writers"

/**
 * The replica root: every fact `applyEntityWrite` needs to project one
 * mutation deterministically — the entity's durable component bag (the same
 * `Partial<ComponentRegistry>` the Writers consume).
 */
export type EntityComponents = Partial<ComponentRegistry>

/** Owner-visible app columns that participate in the entity replica. The
 *  authority still stores these as ordinary entity-row columns; carrying
 *  them beside the component bag lets column intent project and rebase through
 *  the same replica stream as `entity.write`. */
export interface EntityReplicaColumns {
  readonly name: string
  readonly portraitUrl: string | null
  readonly pronouns: string | null
  readonly notes: string | null
}

/** The owner entity replica's complete deterministic projection root. */
export interface EntityReplicaState {
  readonly components: EntityComponents
  readonly columns: EntityReplicaColumns
}

export const entityNameValueSchema = z.string().trim().min(1).max(64)
export const entityPronounsValueSchema = z.string().max(64)
export const entityNotesValueSchema = z.string().max(8000)

/**
 * Replayable app-column intent (UNN-648). These are desired-value sets, so a
 * pending invocation remains meaningful on a newer base and is deliberately
 * re-applied in replica order. Portrait upload is excluded: the Blob stage is
 * a non-replayable lifecycle action; only removal is safe here.
 */
export const entityColumnWriteSchema = z.discriminatedUnion("column", [
  z.object({ column: z.literal("name"), value: entityNameValueSchema }),
  z.object({ column: z.literal("pronouns"), value: entityPronounsValueSchema }),
  z.object({ column: z.literal("notes"), value: entityNotesValueSchema }),
  z.object({ column: z.literal("portraitUrl"), value: z.null() }),
])

export type EntityColumnWrite = z.output<typeof entityColumnWriteSchema>

/** The exact entity-row patch for one validated column intent. */
export function entityColumnPatch(
  write: EntityColumnWrite
): Partial<EntityReplicaColumns> {
  switch (write.column) {
    case "name":
      return { name: write.value }
    case "pronouns":
      return { pronouns: write.value.trim() || null }
    case "notes":
      return { notes: write.value === "" ? null : write.value }
    case "portraitUrl":
      return { portraitUrl: null }
  }
}

/** Applies a column set to both app columns and the lifted runtime components
 *  derived from name/portrait at the row-assembly seam. */
export function applyEntityColumnWrite(
  state: EntityReplicaState,
  write: EntityColumnWrite
): EntityReplicaState {
  const patch = entityColumnPatch(write)
  let components = state.components

  if (write.column === "name") {
    components = {
      ...components,
      identity: { name: write.value },
    }
  } else if (write.column === "portraitUrl") {
    components = {
      ...components,
      presentation: { portraitUrl: undefined },
    }
  }

  return {
    components,
    columns: { ...state.columns, ...patch },
  }
}

/**
 * Showtime's component mutation (UNN-639, design §Showtime binding): its
 * arguments ARE the existing `EntityWrite` descriptor, so the domain
 * vocabulary stays singular instead of gaining one transport method per
 * Writer arm. Prediction runs the same `applyEntityWrite` the server
 * pre-mints with; the merge is the same CH15 patch merge the optimistic
 * frame uses today.
 */
export const writeEntity = defineMutation({
  name: "entity.write",
  args: entityWriteSchema,
  apply(state: EntityReplicaState, write) {
    const patch = applyEntityWrite(state.components, write)
    if (!patch.ok) return err(patch.error)
    return ok({
      ...state,
      components: mergeComponents(state.components, patch.value),
    })
  },
})

export const setEntityColumn = defineMutation({
  name: "entity.setColumn",
  args: entityColumnWriteSchema,
  apply(state: EntityReplicaState, write) {
    return ok(applyEntityColumnWrite(state, write))
  },
})

export type EntityReplicaInvocation =
  | InvocationOf<typeof writeEntity>
  | InvocationOf<typeof setEntityColumn>

export const entityReplicaMutations: MutationRegistry<
  EntityReplicaState,
  EntityReplicaInvocation,
  EntityWriteRefusal
> = defineMutations([writeEntity, setEntityColumn])
