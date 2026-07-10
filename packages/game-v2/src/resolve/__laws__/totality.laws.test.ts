import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { arbitraryEntity } from "@workspace/game-v2/__fixtures__/arbitraries/entity"
import {
  LAW_GAME_DATA,
  LAW_VOCAB,
} from "@workspace/game-v2/__fixtures__/arbitraries/law-catalog"
import { arbitraryResolveContext } from "@workspace/game-v2/__fixtures__/arbitraries/resolve-context"
import { HOSTILE_VOCAB } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import type { ResolvedComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  createResolve,
  type ResolveContext,
} from "@workspace/game-v2/resolve/resolve"
import { createResolveEntity } from "@workspace/game-v2/resolve/resolve-entity"

/**
 * **Totality.** `resolve` and `resolveEntity` are total over the bag space: for
 * *any* entity whose components parse, they return — never throw — and they emit
 * a resolved read-unit only for a capability the entity actually carries.
 *
 * This is the engine's central claim ("any entity carrying the components
 * qualifies") stated as a universally quantified sentence rather than a comment.
 * Example tests can only check points in a space of ~2^18 component subsets.
 *
 * Two tiers, because "a valid bag" has two readings. The load seam validates a
 * key's **shape** (`archetypes.active` is a `z.string()`), never its **referent**.
 * Tier 1 draws catalog keys that resolve; tier 2 draws dangling ones — the state a
 * corrupted or hand-edited row is in, and the harder claim.
 */
const resolve = createResolve(LAW_GAME_DATA)
const resolveEntity = createResolveEntity(LAW_GAME_DATA)

type ResolvedKey = keyof ResolvedComponentRegistry

/**
 * The exact emission rule of the bare stat fold, one entry per resolved read-unit.
 * Exhaustive over `ResolvedComponentRegistry`, so a new read-unit cannot be added
 * without stating when it appears — the table is the specification, and it is
 * checked in both directions (present ⟺ emitted).
 *
 * `skills` and `activeMechanics` are `resolveEntity`'s to emit; the bare fold is
 * mechanics- and skill-agnostic by construction (D30).
 */
const EMITTED_BY_RESOLVE: Record<
  ResolvedKey,
  (entity: Entity, context: ResolveContext) => boolean
> = {
  identity: (entity) => entity.components.identity !== undefined,
  presentation: (entity) => entity.components.presentation !== undefined,
  attributes: (entity) => entity.components.attributes !== undefined,
  affinities: (entity) => entity.components.affinities !== undefined,
  vitals: (entity) => entity.components.vitals !== undefined,
  skillPool: (entity) => entity.components.skillPool !== undefined,
  talents: (entity) => entity.components.talents !== undefined,
  archetypes: (entity) => entity.components.archetypes !== undefined,
  exhaustion: (entity) => entity.components.exhaustion !== undefined,
  virtues: (entity) => entity.components.virtues !== undefined,
  narrative: (entity) => entity.components.narrative !== undefined,
  // Dice maxima derive from the Level; the spend-state gates the read-unit.
  resources: (entity) =>
    entity.components.resources !== undefined &&
    entity.components.level !== undefined,
  // Carried, not folded: an attack-roll or damage effect resolves against a
  // specific attack at use time, so it surfaces only when one exists.
  pendingEffects: (_entity, context) =>
    (context.effects ?? []).some(
      (effect) => effect.type === "attackRoll" || effect.type === "damage"
    ),
  skills: () => false,
  activeMechanics: () => false,
}

/**
 * The capability each read-unit *requires* to be emitted at all. `resolveEntity`
 * layers mechanics, skills, and equipment on the fold, so `skills`,
 * `activeMechanics`, and `pendingEffects` can now appear from sources other than
 * the context — but never from nothing. Stating the necessary condition (rather
 * than re-deriving `collectSkills` here) keeps the law a law instead of a copy of
 * the implementation.
 */
const REQUIRED_FOR_RESOLVE_ENTITY: Record<
  ResolvedKey,
  (entity: Entity, context: ResolveContext) => boolean
> = {
  ...EMITTED_BY_RESOLVE,
  skills: (entity) =>
    entity.components.skills !== undefined ||
    entity.components.archetypes !== undefined ||
    entity.components.equipment !== undefined,
  activeMechanics: (entity) =>
    entity.components.mechanics !== undefined ||
    entity.components.archetypes !== undefined,
  pendingEffects: (entity, context) =>
    EMITTED_BY_RESOLVE.pendingEffects(entity, context) ||
    entity.components.mechanics !== undefined ||
    entity.components.archetypes !== undefined ||
    entity.components.skills !== undefined ||
    entity.components.equipment !== undefined,
}

const RESOLVED_KEYS = Object.keys(EMITTED_BY_RESOLVE) as ResolvedKey[]

function emittedKeys(components: object): Set<string> {
  return new Set(Object.keys(components))
}

describe.each([
  { tier: "referential", vocab: LAW_VOCAB },
  { tier: "hostile", vocab: HOSTILE_VOCAB },
])("totality over $tier bags", ({ vocab }) => {
  it("resolve never throws", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab }),
        arbitraryResolveContext,
        (entity, context) => {
          expect(() => resolve(entity, context)).not.toThrow()
        }
      )
    )
  })

  it("resolveEntity never throws", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab }),
        arbitraryResolveContext,
        (entity, context) => {
          expect(() => resolveEntity(entity, context)).not.toThrow()
        }
      )
    )
  })

  it("resolve emits a read-unit exactly when its capability is present", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab }),
        arbitraryResolveContext,
        (entity, context) => {
          const emitted = emittedKeys(resolve(entity, context).components)
          for (const key of RESOLVED_KEYS) {
            expect({ key, emitted: emitted.has(key) }).toEqual({
              key,
              emitted: EMITTED_BY_RESOLVE[key](entity, context),
            })
          }
        }
      )
    )
  })

  it("resolveEntity emits a read-unit only when its capability is present", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab }),
        arbitraryResolveContext,
        (entity, context) => {
          const emitted = emittedKeys(resolveEntity(entity, context).components)
          for (const key of emitted) {
            expect({
              key,
              permitted: REQUIRED_FOR_RESOLVE_ENTITY[key as ResolvedKey](
                entity,
                context
              ),
            }).toEqual({ key, permitted: true })
          }
        }
      )
    )
  })

  it("resolve preserves the entity id", () => {
    fc.assert(
      fc.property(arbitraryEntity({ vocab }), (entity) => {
        expect(resolveEntity(entity).id).toBe(entity.id)
      })
    )
  })
})
