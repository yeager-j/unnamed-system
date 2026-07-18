import { z } from "zod/v4"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { mergeComponentPatch } from "@/domain/entity/commit/merge-patch"
import { entityWriteSchema } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"

import { createMockMutatorRegistry } from "./zero-mock"

const { defineMutator, defineMutators } = createMockMutatorRegistry<Entity>()

/**
 * The smallest useful Zero-shaped binding over Showtime's real Writer. The
 * descriptor remains the domain command; entity location, mutation identity,
 * optimistic application, ordering, and replay are transport concerns.
 */
export const entityMutators = defineMutators({
  entity: {
    write: defineMutator(
      z.object({ entityId: z.string().min(1), write: entityWriteSchema }),
      async ({ tx, args }) => {
        const entity = tx.read()
        if (entity.id !== args.entityId) throw new Error("entity-not-found")

        const patch = applyEntityWrite(entity.components, args.write)
        if (!patch.ok) throw new Error(patch.error)

        tx.write(mergeComponentPatch(entity, patch.value))
      }
    ),
  },
})
