import { z } from "zod/v4"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import {
  defineMutation,
  defineProtocol,
  type MutationRefusalOf,
} from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import type { CharacterProfile } from "@/domain/character/types"
import { mergeComponentPatch } from "@/domain/entity/commit/merge-patch"
import { entityWriteRefusalSchema } from "@/domain/entity/commit/refusal.schema"
import { entityWriteSchema } from "@/domain/entity/commit/write.schema"
import {
  applyEntityWrite,
  type EntityWriteRefusal,
} from "@/domain/entity/commit/writers"
import {
  getArchetype,
  resolveEntity,
  startingWeaponForLineage,
} from "@/domain/game-engine-v2"

import { validateFinalize, type FinalizeRefusal } from "./finalize"
import { applyIdentityWrite } from "./identity"
import { identityWriteSchema } from "./identity.schema"

/**
 * The Headcanon character protocol binding: three user-facing durable
 * write species — `entity.write` for engine components, `entity.identity` for
 * app-owned identity columns, and the preconditioned `entity.finalize` lifecycle
 * command.
 *
 * This is the shared, client-safe half — stable wire names, Standard
 * Schema-compatible argument parsers, and the pure predictors. `entity.write`
 * reuses the generic entity pipeline
 * (`applyEntityWrite → mergeComponentPatch → resolveEntity`), so the isomorphism
 * law (`__laws__/isomorphism.laws.test.ts`) that governs that pipeline governs
 * this predictor unchanged. The authority-only handlers, deduplication, cache and
 * realtime invalidation live behind the package; the wire carries only intent.
 */

/**
 * What one character root projects: the character profile, its authored entity
 * substrate, and the engine-derived read model. The optional resolve context is
 * mount-local input for an owned encounter sheet; carrying it in the root keeps
 * every optimistic re-fold in the same party and zone context.
 */
export interface CharacterCanonValue {
  profile: CharacterProfile
  entity: Entity
  resolved: ResolvedEntity
  resolveContext?: ResolveContext
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

const characterEntityWrite = defineMutation({
  name: "entity.write",
  args: entityWriteArgs,
  refusal: entityWriteRefusalSchema,
  predict(
    state: CharacterCanonValue,
    { write }
  ): Result<CharacterCanonValue, EntityWritePredictionError> {
    const patch = applyEntityWrite(state.entity.components, write)
    if (!patch.ok) return patch

    const entity = mergeComponentPatch(state.entity, patch.value)
    return ok({
      ...state,
      entity,
      resolved: resolveEntity(entity, state.resolveContext),
    })
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
const characterIdentityWrite = defineMutation({
  name: "entity.identity",
  args: entityIdentityArgs,
  refusal: identityWriteRefusal,
  predict(
    state: CharacterCanonValue,
    { write }
  ): Result<CharacterCanonValue, never> {
    return ok({
      ...state,
      profile: {
        ...state.profile,
        ...applyIdentityWrite(state.profile, write),
      },
    })
  },
})

/** Finalize is a preconditioned mutation with no client projection. Its
 *  authoritative handler seeds components and flips the subtype status in one
 *  receipt transaction; the predictor only rejects an invalid visible draft. */
export const entityFinalizeArgs = z.object({ entityId: z.string().min(1) })
export type EntityFinalizeArgs = z.infer<typeof entityFinalizeArgs>

const characterFinalize = defineMutation({
  name: "entity.finalize",
  args: entityFinalizeArgs,
  refusal: finalizeRefusal,
  predict(
    state: CharacterCanonValue
  ): Result<CharacterCanonValue, FinalizeRefusal> {
    const valid = validateFinalize(
      state.profile.name,
      state.entity.components,
      {
        getArchetype,
        startingWeaponForLineage,
      }
    )
    return valid.ok ? ok(state) : err(valid.error)
  },
})

/** The registered character mutation protocol. The versioned `id` is a deployed
 *  protocol string — a stale tab may call a newer server. */
export const characterProtocol = defineProtocol({
  id: "showtime.entity.v1",
  mutations: [characterEntityWrite, characterIdentityWrite, characterFinalize],
})

/** The exact public refusal union derived from the registered mutation codecs. */
export type CharacterMutationError = MutationRefusalOf<
  | typeof characterEntityWrite
  | typeof characterIdentityWrite
  | typeof characterFinalize
>

export { characterEntityWrite, characterFinalize, characterIdentityWrite }
