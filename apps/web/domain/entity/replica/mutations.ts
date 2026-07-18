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

/**
 * The one Showtime entity mutation (UNN-639, design §Showtime binding): its
 * arguments ARE the existing `EntityWrite` descriptor, so the domain
 * vocabulary stays singular instead of gaining one transport method per
 * Writer arm. Prediction runs the same `applyEntityWrite` the server
 * pre-mints with; the merge is the same CH15 patch merge the optimistic
 * frame uses today.
 */
export const writeEntity = defineMutation({
  name: "entity.write",
  args: entityWriteSchema,
  apply(components: EntityComponents, write) {
    const patch = applyEntityWrite(components, write)
    if (!patch.ok) return err(patch.error)
    return ok(mergeComponents(components, patch.value))
  },
})

export type EntityReplicaInvocation = InvocationOf<typeof writeEntity>

export const entityReplicaMutations: MutationRegistry<
  EntityComponents,
  EntityReplicaInvocation,
  EntityWriteRefusal
> = defineMutations([writeEntity])
