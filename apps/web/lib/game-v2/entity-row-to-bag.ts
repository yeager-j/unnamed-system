import type { Entity } from "@workspace/game-v2/kernel"
import {
  componentSchemas,
  loadEntity,
  type ComponentLoadIssue,
} from "@workspace/game-v2/kernel/load-seam"
import type { Result } from "@workspace/game-v2/kernel/result"

import type { EntityRow } from "@/lib/db/schema/entity"

/**
 * The **assemble seam** (CD14, generalized to the durable home — UNN-551): the
 * `entity` row → runtime `Entity` projection. It is the entity-table successor of
 * `rawInputsToEntity`, and lives in `apps/web` (not the game-v2 kernel) because it
 * reads a Drizzle row shape, which the independence-gated engine may not name.
 *
 * Two responsibilities, kept separate: **assemble** (here) gathers the row's
 * non-null component columns into a component bag and **lifts** the `name` /
 * `portraitUrl` metadata columns into the `identity` / `presentation` components —
 * no validation; then the kernel's {@link loadEntity} owns shape validation (the
 * F6 load seam). `NULL ⇔ component absent`: a null column contributes no key, so
 * the runtime entity carries exactly the components the row stored.
 */

/**
 * The components **lifted from metadata columns** instead of having a column of
 * their own (`name` → `identity`, `portraitUrl` → `presentation`) — the CH15
 * exception, decided once here at the assemble seam. Every other site that needs
 * the distinction (the conformance test's column-set pin, `EntityWritePatch`'s
 * exclusion) derives from this const; a third lifted component is one edit.
 */
export const LIFTED_COMPONENT_KEYS = ["identity", "presentation"] as const
export type LiftedComponentKey = (typeof LIFTED_COMPONENT_KEYS)[number]

// The durable component *columns* — every registry key with a load schema except
// the lifted ones. Derived from the load-seam's total map so it can't drift from
// the registry (the same correspondence the conformance test pins).
const LIFTED_KEYS: ReadonlySet<string> = new Set(LIFTED_COMPONENT_KEYS)
const COMPONENT_COLUMN_KEYS = Object.keys(componentSchemas).filter(
  (key) => !LIFTED_KEYS.has(key)
)

/** Builds the component bag from a row's non-null columns + the lifted metadata. */
export function entityRowToBag(row: EntityRow): Record<string, unknown> {
  const bag: Record<string, unknown> = {
    identity: { name: row.name },
    presentation: { portraitUrl: row.portraitUrl ?? undefined },
  }
  const columns = row as Record<string, unknown>
  for (const key of COMPONENT_COLUMN_KEYS) {
    const value = columns[key]
    if (value !== null && value !== undefined) bag[key] = value
  }
  return bag
}

/**
 * Projects an `entity` row into a validated runtime {@link Entity}. `err` carries
 * one {@link ComponentLoadIssue} per component whose stored shape is invalid (a
 * data-integrity failure the caller surfaces, never silently drops).
 */
export function loadEntityRow(
  row: EntityRow
): Result<Entity, ComponentLoadIssue[]> {
  return loadEntity(row.id, entityRowToBag(row))
}
