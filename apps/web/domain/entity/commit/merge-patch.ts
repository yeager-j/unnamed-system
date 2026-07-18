import type { Entity } from "@workspace/game-v2/kernel/entity"

import type { EntityWritePatch } from "./writers"

/**
 * Merges a Writer's predicted patch onto an entity's component bag — the
 * optimistic client's half of the commit (the server's half is the guarded
 * column UPDATE, whose per-column SET this whole-component spread mirrors
 * exactly). Patch keys replace their component wholesale; a key set to
 * `undefined` removes the component (NULL ⇔ absent, CH15).
 */
export function mergeComponentPatch(
  entity: Entity,
  patch: EntityWritePatch
): Entity {
  return { ...entity, components: mergeComponents(entity.components, patch) }
}

/**
 * The bag-level half of {@link mergeComponentPatch}, for callers that hold a
 * component bag without an `Entity` wrapper (the replica binding's state
 * root). Same CH15 semantics: keys replace wholesale, `undefined` removes.
 */
export function mergeComponents(
  components: Entity["components"],
  patch: EntityWritePatch
): Entity["components"] {
  const next = { ...components }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key as keyof typeof next]
    } else {
      Object.assign(next, { [key]: value })
    }
  }
  return next
}

/**
 * Combines two patches into one that merges as their sequence: for every entity
 * `e`, `mergeComponentPatch(mergeComponentPatch(e, a), b)` equals
 * `mergeComponentPatch(e, combinePatches(a, b))`. Right-biased — `b` wins a
 * shared key — so it is deliberately not commutative.
 *
 * The CH15 deletion semantics (NULL ⇔ absent) ride the spread: an explicit
 * `undefined` key is an own key, so spread carries it and lets a later patch
 * overwrite it — delete-then-set is a set, set-then-delete is a delete. That
 * edge is exactly what a hand-rolled conditional spread
 * (`...(patch.vitals && { vitals: … })`) silently drops, which is why patch
 * composition lives here once instead of at each caller. Combining is also
 * closed over deletion-free patches — no Writer emits one today, an invariant
 * `__laws__/isomorphism.laws.test.ts` pins because the server's guarded UPDATE
 * skips `undefined` columns rather than NULLing them.
 *
 * `(EntityWritePatch, combinePatches, {})` is a monoid; the identity,
 * associativity, and merge-compatibility laws live in
 * `__laws__/patch-monoid.laws.test.ts`.
 */
export function combinePatches(
  a: EntityWritePatch,
  b: EntityWritePatch
): EntityWritePatch {
  return { ...a, ...b }
}
