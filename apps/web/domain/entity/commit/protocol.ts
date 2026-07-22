import { z } from "zod/v4"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import {
  defineMutation,
  defineProtocol,
  type MutationRefusalOf,
} from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import {
  validateFinalize,
  type FinalizeRefusal,
} from "@/domain/entity/finalize"
import {
  getArchetype,
  resolveEntity,
  startingWeaponForLineage,
} from "@/domain/game-engine-v2"

import { applyIdentityWrite, type EntityIdentity } from "./identity"
import { identityWriteSchema } from "./identity.schema"
import { mergeComponentPatch } from "./merge-patch"
import { entityWriteSchema } from "./write.schema"
import { applyEntityWrite, type EntityWriteRefusal } from "./writers"

/**
 * The Headcanon entity protocol binding (P2a–P2e): three user-facing durable
 * write species — `entity.write` for engine components, `entity.identity` for
 * app-owned identity columns, and the preconditioned `entity.finalize` lifecycle
 * command.
 *
 * This is the shared, client-safe half — stable wire names, Standard
 * Schema-compatible argument parsers, and the pure predictors. `entity.write`
 * reuses the exact pipeline `useEntityWrite`'s optimistic reducer already runs
 * (`applyEntityWrite → mergeComponentPatch → resolveEntity`), so the isomorphism
 * law (`__laws__/isomorphism.laws.test.ts`) that governs that pipeline governs
 * this predictor unchanged. The authority-only handlers, deduplication, cache and
 * realtime invalidation live behind the package; the wire carries only intent.
 */

/**
 * What the character predicted root projects: the authored {@link Entity} (the
 * component predictor's fold base), the {@link ResolvedEntity} the engine derives
 * from it, and the {@link EntityIdentity} columns.
 *
 * The value is exactly what the four entity axes govern — deliberately **not** the
 * whole `profile` (UNN-673). `profile`'s other fields are either immutable (ids)
 * or unversioned subtype lifecycle facts (`status`, `builderStep`), so an axis
 * revision says nothing about them and the canon must not claim to carry them.
 * The identity columns *are* identity-axis facts, so P2c folds them in: their
 * mutation predicts a per-field update, and canonization is judged against the
 * same axis that governs them.
 */
export interface EntityCanonValue {
  entity: Entity
  resolved: ResolvedEntity
  identity: EntityIdentity
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

/** Public receipt refusals for this mutation. Authorization, missing targets,
 * contention, and malformed envelopes are deliberately absent: they become
 * package denial, redelivery, or programmer failure rather than domain UX. */
const entityWriteRefusal = z.enum([
  "capability-missing",
  "no-prisma-charges",
  "no-transitions",
  "allocation-cap-exceeded",
  "entry-not-found",
  "not-unlocked",
  "insufficient-skill-dice",
  "insufficient-hit-dice",
  "invalid-input",
  "insufficient-victories",
  "max-level",
  "log-full",
  "log-not-full",
  "virtue-not-eligible",
  "rank-capped",
  "no-saved-ranks",
  "prerequisites-not-met",
  "item-not-found",
  "catalog-item-unknown",
  "invalid-quantity",
  "duplicate-item-id",
  "entity-load-failed",
]) satisfies z.ZodType<EntityWriteRefusal | "entity-load-failed">

const identityWriteRefusal = z.never()

const finalizeRefusal = z.union([
  z.object({
    kind: z.literal("missing-requirement"),
    stepSlug: z.enum(["ortus", "corpus", "persona"]),
    reason: z.string(),
  }),
  z.enum([
    "no-origin-archetype",
    "no-starting-weapon-for-lineage",
    "entity-load-failed",
    "entity-not-draft",
  ]),
]) satisfies z.ZodType<
  FinalizeRefusal | "entity-load-failed" | "entity-not-draft"
>

const entityWrite = defineMutation({
  name: "entity.write",
  args: entityWriteArgs,
  refusal: entityWriteRefusal,
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
    // canon value; this predictor stays the character case. The identity columns
    // carry through untouched — a component write never sets one.
    return ok({ ...state, entity, resolved: resolveEntity(entity) })
  },
})

/**
 * The `entity.identity` invocation arguments (P2c — UNN-675). Same shape rule as
 * `entity.write`: `entityId` locates the authority's target and `write` is the
 * per-field descriptor. No expected revision, version class, or actor rides the
 * wire — the class is `identity` by construction and the authority derives
 * everything else from trusted current state.
 */
export const entityIdentityArgs = z.object({
  entityId: z.string(),
  write: identityWriteSchema,
})

/** The parsed `entity.identity` invocation arguments. */
export type EntityIdentityArgs = z.infer<typeof entityIdentityArgs>

/**
 * The identity-column predictor. It cannot refuse locally: the descriptor's
 * parser has already admitted the only failures a column write has (bounds), and
 * ownership — the one remaining gate — is authority knowledge the client cannot
 * evaluate. Its refusal codec is `never`; a failed admission becomes 403.
 */
const entityIdentity = defineMutation({
  name: "entity.identity",
  args: entityIdentityArgs,
  refusal: identityWriteRefusal,
  predict(state: EntityCanonValue, { write }): Result<EntityCanonValue, never> {
    return ok({ ...state, identity: applyIdentityWrite(state.identity, write) })
  },
})

/** Finalize is a preconditioned mutation with no client projection. Its
 *  authoritative handler seeds components and flips the subtype status in one
 *  receipt transaction; the predictor only rejects an invalid visible draft. */
export const entityFinalizeArgs = z.object({ entityId: z.string().min(1) })
export type EntityFinalizeArgs = z.infer<typeof entityFinalizeArgs>

const entityFinalize = defineMutation({
  name: "entity.finalize",
  args: entityFinalizeArgs,
  refusal: finalizeRefusal,
  predict(state: EntityCanonValue): Result<EntityCanonValue, FinalizeRefusal> {
    const valid = validateFinalize(
      state.identity.name,
      state.entity.components,
      {
        getArchetype,
        startingWeaponForLineage,
      }
    )
    return valid.ok ? ok(state) : err(valid.error)
  },
})

/** The registered entity mutation protocol. The versioned `id` is a deployed
 *  protocol string — a stale tab may call a newer server. */
export const entityProtocol = defineProtocol({
  id: "showtime.entity.v1",
  mutations: [entityWrite, entityIdentity, entityFinalize],
})

/** The exact public refusal union derived from the registered mutation codecs. */
export type EntityMutationError = MutationRefusalOf<
  typeof entityWrite | typeof entityIdentity | typeof entityFinalize
>

export { entityFinalize, entityIdentity, entityWrite }
