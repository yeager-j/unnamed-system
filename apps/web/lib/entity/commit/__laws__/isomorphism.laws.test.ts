import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { arbitraryResolveContext } from "@workspace/game-v2/__fixtures__/arbitraries/resolve-context"
import type { Entity } from "@workspace/game-v2/kernel/entity"

import { mergeComponentPatch } from "@/lib/entity/commit/merge-patch"
import type { EntityWrite } from "@/lib/entity/commit/write.schema"
import { applyEntityWrite } from "@/lib/entity/commit/writers"
import { resolveEntity } from "@/lib/game-engine-v2"
import { commitAndReload } from "@/lib/game-v2/__fixtures__/entity-row"

import {
  arbitraryEntityFor,
  arbitraryWriteFor,
  WRITE_FAMILIES,
  type WriteFamily,
} from "./write-arbitraries"

/**
 * **Optimistic isomorphism** — the contract the whole write architecture rests on,
 * and until now guarded only by discipline and examples.
 *
 * For any valid entity and any valid write descriptor:
 *
 * ```
 * resolveEntity(mergeComponentPatch(E, patch))   ≡   resolveEntity(commit → reload)
 * ```
 *
 * `applyEntityWrite` is pure and deterministic, and both sides call it with the
 * same component bag — so the *patch* is identical by construction. What can
 * differ is the round trip: the client keeps the Writer's output object in memory,
 * while the server writes it to jsonb and its next read hands it back through the
 * load seam, where Zod re-applies defaults and strips unknown keys and Postgres has
 * already dropped every `undefined`.
 *
 * The law therefore reduces to a sharp question: **is every Writer's output a fixed
 * point of its own load schema?** If not, the client renders a happy optimistic
 * frame over a row the server can no longer read.
 *
 * One `describe` per family, not one aggregate property: each family needs its own
 * entity-dependent write generator, and a shrunk counterexample from thirteen
 * unioned arms is unreadable. The `resolveContext` is drawn once and handed to both
 * sides — exactly as `useEntityWrite` re-folds with the context its base was folded
 * with, never a fresh one.
 */
function assertIsomorphic(
  entity: Entity,
  write: EntityWrite,
  context: Parameters<typeof resolveEntity>[1]
): { refused: boolean } {
  const patch = applyEntityWrite(entity.components, write)

  if (!patch.ok) {
    // A refusal is symmetric and total: the server returns it before touching the
    // row, and the client's reducer returns its previous frame. Nothing moves.
    return { refused: true }
  }

  const client = mergeComponentPatch(entity, patch.value)
  const reloaded = commitAndReload(entity, patch.value)

  if (!reloaded.ok) {
    throw new Error(
      `a Writer emitted a component its own load schema rejects: ${JSON.stringify(reloaded.error)}`
    )
  }

  expect(reloaded.value.components).toStrictEqual(client.components)
  expect(resolveEntity(reloaded.value, context)).toStrictEqual(
    resolveEntity(client, context)
  )
  return { refused: false }
}

describe.each(WRITE_FAMILIES)("isomorphism over %s writes", (family) => {
  const entities = arbitraryEntityFor(family)

  it("client prediction and server reload agree", () => {
    fc.assert(
      fc.property(
        entities.chain((entity) =>
          fc.tuple(fc.constant(entity), arbitraryWriteFor(entity, family))
        ),
        arbitraryResolveContext,
        ([entity, write], context) => {
          assertIsomorphic(entity, write, context)
        }
      )
    )
  })

  it("exercises accepted writes, not only refusals", () => {
    const accepted = countAccepted(family)
    expect({ family, meetsFloor: accepted >= ACCEPTANCE_FLOOR }).toEqual({
      family,
      meetsFloor: true,
    })
  })
})

/**
 * The **non-vacuity guard**. A property whose every write refuses is green and
 * worthless — it only ever asserts `identity ≡ identity`. Each family samples its
 * own generators and counts the writes the Writer actually accepts, so a generator
 * that rots into all-refusals fails loudly instead of passing quietly.
 *
 * Every family currently clears 50%; the floor sits well below that so a healthy
 * seed never trips it, and a generator that stops naming the entity's own roster
 * keys or item ids collapses straight through it.
 */
const ACCEPTANCE_SAMPLES = 60
const ACCEPTANCE_FLOOR = 12

function countAccepted(family: WriteFamily): number {
  const entities = fc.sample(arbitraryEntityFor(family), ACCEPTANCE_SAMPLES)
  return entities.filter((entity) => {
    const [write] = fc.sample(arbitraryWriteFor(entity, family), 1)
    return write !== undefined && applyEntityWrite(entity.components, write).ok
  }).length
}

/**
 * `mergeComponentPatch` treats an `undefined` patch value as "remove the
 * component"; the guarded `UPDATE`'s `.set` **skips** an `undefined` column,
 * leaving it unchanged. The two disagree, and no Writer emits an `undefined` patch
 * value today — so the divergence is unreachable rather than absent. Pin it, and
 * the first delete-style write family will fail here instead of silently.
 */
describe("no Writer emits a component-removing patch", () => {
  it.each(WRITE_FAMILIES)("%s", (family) => {
    fc.assert(
      fc.property(
        arbitraryEntityFor(family).chain((entity) =>
          fc.tuple(fc.constant(entity), arbitraryWriteFor(entity, family))
        ),
        ([entity, write]) => {
          const patch = applyEntityWrite(entity.components, write)
          if (!patch.ok) return
          for (const value of Object.values(patch.value)) {
            expect(value).toBeDefined()
          }
        }
      )
    )
  })
})
