import { z } from "zod/v4"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { defineMutation, defineProtocol } from "@workspace/headcanon"
import { ok, type Result } from "@workspace/result"

import { resolveEntity } from "@/domain/game-engine-v2"

import { mergeComponentPatch } from "./merge-patch"
import { entityWriteSchema } from "./write.schema"
import { applyEntityWrite, type EntityWriteRefusal } from "./writers"

/**
 * The Headcanon `entity.write` protocol binding (P2a — UNN-673): the one durable
 * component write, named and registered for optimistic prediction.
 *
 * This is the shared, client-safe half — a stable wire name, a Standard
 * Schema-compatible argument parser, and the pure predictor. It reuses the exact
 * pipeline `useEntityWrite`'s optimistic reducer already runs
 * (`applyEntityWrite → mergeComponentPatch → resolveEntity`), so the isomorphism
 * law (`__laws__/isomorphism.laws.test.ts`) that governs that pipeline governs
 * this predictor unchanged. The authority-only handler, deduplication, cache and
 * realtime invalidation live behind the package; the wire carries only intent.
 */

/**
 * What the character predicted root projects: the authored {@link Entity} (the
 * predictor's fold base) and the {@link ResolvedEntity} the engine derives from
 * it. Deliberately **not** the character's `profile` — the app-owned columns stay
 * their own read home (the three-homes rule); the predicted value is
 * entity-centric so combat and future consoles can observe the same shape.
 */
export interface EntityCanonValue {
  entity: Entity
  resolved: ResolvedEntity
}

/**
 * The `entity.write` invocation arguments. `entityId` locates the authority's
 * target (the predictor operates on its own mounted entity and ignores it);
 * `write` is the serializable component-write descriptor. No expected revision,
 * version class, storage home, or actor rides the wire — the authority derives
 * all of them from trusted current state (UNN-673 AC #5).
 */
export const entityWriteArgs = z.object({
  entityId: z.string(),
  write: entityWriteSchema,
})

/** The parsed `entity.write` invocation arguments. */
export type EntityWriteArgs = z.infer<typeof entityWriteArgs>

/** The typed local refusal a predictor may return — the same domain vocabulary
 *  the authoritative Writer speaks. */
export type EntityWritePredictionError = EntityWriteRefusal

const entityWrite = defineMutation({
  name: "entity.write",
  args: entityWriteArgs,
  predict(
    state: EntityCanonValue,
    { write }
  ): Result<EntityCanonValue, EntityWritePredictionError> {
    const patch = applyEntityWrite(state.entity.components, write)
    if (!patch.ok) return patch

    const entity = mergeComponentPatch(state.entity, patch.value)
    // Context-free (partyless) resolve — matches the character loader's
    // `resolveEntity(loaded.value)` (domain/character/load.ts). A future combat
    // binding that resolves in a party/zone context carries that context in its
    // canon value; this predictor stays the character case.
    return ok({ entity, resolved: resolveEntity(entity) })
  },
})

/** The registered entity mutation protocol. The versioned `id` is a deployed
 *  protocol string — a stale tab may call a newer server. */
export const entityProtocol = defineProtocol({
  id: "showtime.entity.v1",
  mutations: [entityWrite],
})

export { entityWrite }
