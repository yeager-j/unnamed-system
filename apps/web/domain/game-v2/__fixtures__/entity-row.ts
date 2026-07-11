import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { Result } from "@workspace/game-v2/kernel/result"

import type { EntityWritePatch } from "@/domain/entity/commit/writers"
import {
  loadEntityRow,
  type LiftedComponentKey,
} from "@/domain/game-v2/entity-row-to-bag"
import type { EntityRow } from "@/lib/db/schema/entity"

/**
 * The test-only **inverse of the assemble seam** — `Entity → EntityRow` — so a law
 * can model "commit, then read the row back" without a database.
 *
 * Three things it must get right, each a place the real seam is asymmetric:
 *
 * 1. `name` / `portraitUrl` are **lifted TEXT columns**, not jsonb. An absent
 *    `presentation.portraitUrl` is column `NULL`, which `entityRowToBag` lifts
 *    back as `undefined`.
 * 2. An absent component is column `NULL` — never `{}`, never `undefined`.
 * 3. Each jsonb column round-trips through `JSON.stringify`, because that is what
 *    Postgres does: an `undefined`-valued field inside a component **disappears**.
 *    Modeling the write as a shallow copy would launder away exactly the class of
 *    divergence the isomorphism law exists to catch.
 *
 * Metadata columns (`shortId`, `ownerId`, the version tokens, …) are inert — the
 * loader never reads them — so they carry fixed values.
 */
type ComponentColumnKey = Exclude<keyof ComponentRegistry, LiftedComponentKey>

type ComponentColumns = {
  [K in ComponentColumnKey]: ComponentRegistry[K] | null
}

/** What Postgres stores for one jsonb column: the value, or NULL when absent. */
function toJsonbColumn<T>(value: T | undefined): T | null {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

/**
 * Every durable component column, written out. The explicit list is the point: a
 * component added to the registry without a column here is a compile error, so
 * this fixture cannot silently stop persisting a component the law then "proves"
 * round-trips.
 */
function componentColumns(components: Entity["components"]): ComponentColumns {
  return {
    attributes: toJsonbColumn(components.attributes),
    affinities: toJsonbColumn(components.affinities),
    vitals: toJsonbColumn(components.vitals),
    skillPool: toJsonbColumn(components.skillPool),
    skills: toJsonbColumn(components.skills),
    talents: toJsonbColumn(components.talents),
    level: toJsonbColumn(components.level),
    path: toJsonbColumn(components.path),
    manualBonuses: toJsonbColumn(components.manualBonuses),
    archetypes: toJsonbColumn(components.archetypes),
    resources: toJsonbColumn(components.resources),
    exhaustion: toJsonbColumn(components.exhaustion),
    mechanics: toJsonbColumn(components.mechanics),
    equipment: toJsonbColumn(components.equipment),
    virtues: toJsonbColumn(components.virtues),
    narrative: toJsonbColumn(components.narrative),
  }
}

const INERT_METADATA = {
  shortId: "law-short-id",
  ownerId: "law-owner",
  campaignId: null,
  kind: "pc",
  status: "draft",
  builderStep: 0,
  pronouns: null,
  notes: null,
  deletedAt: null,
  identityVersion: 0,
  vitalsVersion: 0,
  inventoryVersion: 0,
  progressionVersion: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} as const satisfies Partial<EntityRow>

export function entityToRow(entity: Entity): EntityRow {
  return {
    ...INERT_METADATA,
    ...componentColumns(entity.components),
    id: entity.id,
    name: entity.components.identity?.name ?? "",
    portraitUrl: entity.components.presentation?.portraitUrl ?? null,
  }
}

/**
 * The server's half of a write, modeled end to end: apply the Writer's patch to
 * the stored components (each key replaces its column wholesale, which is what the
 * guarded `UPDATE … SET` does), persist, and read back through the load seam.
 *
 * The reload is the whole point. The client keeps the Writer's output object in
 * memory; the server's next read hands it to Zod, which re-applies `.default()`s
 * and strips unknown keys, after Postgres has already dropped every `undefined`.
 * If a Writer's output is not a fixed point of its own load schema, the two sides
 * part ways here — or the reload fails outright, which in production is the sheet
 * rendering a happy optimistic frame over a row the server can no longer read.
 */
export function commitAndReload(
  entity: Entity,
  patch: EntityWritePatch
): Result<Entity, unknown> {
  const stored = { ...entity.components, ...patch }
  return loadEntityRow(entityToRow({ id: entity.id, components: stored }))
}

/**
 * A generated entity as the database would hand it back: written to a row, read
 * through the load seam. Every law runs on a canonicalized entity, so it measures
 * the *write's* contribution rather than pre-existing generator noise.
 */
export function canonicalize(entity: Entity): Entity {
  const loaded = loadEntityRow(entityToRow(entity))
  if (!loaded.ok) {
    throw new Error(
      `arbitraryEntity produced a bag the load seam rejects: ${JSON.stringify(loaded.error)}`
    )
  }
  return loaded.value
}
