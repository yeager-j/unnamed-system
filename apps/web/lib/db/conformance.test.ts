import { getTableColumns } from "drizzle-orm"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import { componentSchemas } from "@workspace/game-v2/kernel/load-seam"

import {
  LIFTED_COMPONENT_KEYS,
  type LiftedComponentKey,
} from "@/domain/game-v2/entity-row-to-bag"

import { entity, type EntityRow } from "./schema/entity"
import { playerCharacter } from "./schema/player-character"

/**
 * The `entity` table is the **component-column projection** of the durable
 * `ComponentRegistry` (UNN-551, ADR §2.2/CH15): one column per durable component
 * key, except `identity`/`presentation` which are lifted from the `name`/
 * `portraitUrl` metadata columns at load. These asserts pin that correspondence
 * so a registry key added without a column (or vice-versa) fails the suite, and
 * that each column's payload type is exactly its registry component (nullable ⇔
 * absent). `componentSchemas` (`load-seam.ts`) is the runtime key list + the
 * per-column payload contract.
 */
const LIFTED_KEYS = LIFTED_COMPONENT_KEYS
type LiftedKey = LiftedComponentKey
type DurableComponentColumn = Exclude<keyof ComponentRegistry, LiftedKey>

describe("entity table ⇔ durable component registry", () => {
  it("has one column per durable component key (bar the lifted identity/presentation)", () => {
    const columns = new Set(Object.keys(getTableColumns(entity)))
    const registryKeys = Object.keys(componentSchemas)

    for (const key of registryKeys) {
      if ((LIFTED_KEYS as readonly string[]).includes(key)) {
        expect(
          columns.has(key),
          `'${key}' is lifted from a metadata column, not a component column`
        ).toBe(false)
      } else {
        expect(
          columns.has(key),
          `missing entity column for durable component '${key}'`
        ).toBe(true)
      }
    }
  })

  it("types each component column as its registry payload, nullable ⇔ absent", () => {
    // Compile-forced (Pick fails if a key is missing from EntityRow): every
    // durable component column is exactly `ComponentRegistry[K] | null`.
    type ComponentColumns = Pick<EntityRow, DurableComponentColumn>
    type Expected = {
      [K in DurableComponentColumn]: ComponentRegistry[K] | null
    }
    expectTypeOf<ComponentColumns>().toEqualTypeOf<Expected>()
  })

  it("carries no PC-lifecycle metadata columns — they moved to the playerCharacter subtype (R3 — UNN-573)", () => {
    const columns = new Set(Object.keys(getTableColumns(entity)))
    for (const moved of [
      "ownerId",
      "campaignId",
      "kind",
      "status",
      "builderStep",
    ]) {
      expect(
        columns.has(moved),
        `'${moved}' moved to the playerCharacter door; entity is pure substrate`
      ).toBe(false)
    }
  })

  it("the playerCharacter subtype owns exactly the PC-lifecycle columns (+ its keys/timestamps)", () => {
    const columns = new Set(Object.keys(getTableColumns(playerCharacter)))
    expect(columns).toEqual(
      new Set([
        "entityId",
        "userId",
        "campaignId",
        "status",
        "builderStep",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("validates component-column payloads under the engine's load schemas", () => {
    expect(
      componentSchemas.vitals.safeParse({ base: 30, damage: 5 }).success
    ).toBe(true)
    // Net-new component bounds (UNN-551; ranks + Spark log merged into one
    // `virtues` component in E1/UNN-552): the schema the entity column stores.
    expect(
      componentSchemas.virtues.safeParse({
        ranks: { expression: 7, empathy: 0, wisdom: 0, focus: 0 },
        sparkLog: Array(7).fill("focus"),
      }).success
    ).toBe(true)
    expect(
      componentSchemas.virtues.safeParse({
        ranks: { expression: 8, empathy: 0, wisdom: 0, focus: 0 },
        sparkLog: [],
      }).success
    ).toBe(false)
    expect(
      componentSchemas.virtues.safeParse({
        ranks: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
        sparkLog: Array(8).fill("focus"),
      }).success
    ).toBe(false)
    expect(
      componentSchemas.narrative.safeParse({
        ancestry: null,
        background: null,
        backstory: null,
        personality: null,
        hopes: null,
        dreams: null,
        fears: null,
        secrets: null,
        knives: [],
        chains: [],
      }).success
    ).toBe(true)
  })
})
