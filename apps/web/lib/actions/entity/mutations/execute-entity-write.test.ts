import { describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"

import { entityToRow } from "@/domain/game-v2/__fixtures__/entity-row"
import {
  SEED_CHARACTERS,
  seedCharacterToEntity,
} from "@/lib/__fixtures__/seed-characters"
import { entityVitalsAxis } from "@/lib/db/axes"
import type { EntityRow } from "@/lib/db/schema/entity"

import { executeEntityWrite } from "./execute-entity-write"
import type { EntityMutationTx } from "./types"

// The handler pulls `server-only` transitively (version-guard → realtime/publish);
// neutralize the build-time guard for the node runner.
vi.mock("server-only", () => ({}))

const ENTITY_ID = "entity-under-test"

function seedRow(vitalsVersion: number): EntityRow {
  const entity = seedCharacterToEntity(SEED_CHARACTERS[0]!)
  return { ...entityToRow(entity), id: ENTITY_ID, vitalsVersion }
}

/**
 * A minimal chainable stand-in for the Drizzle transaction. It proves the
 * handler's orchestration (read → predict → guarded write → stamp) without a live
 * database; the guard SQL itself is proven against Postgres by the package's
 * Drizzle authority contract.
 */
function fakeTx(options: { row?: EntityRow; updated: { version: number }[] }): {
  tx: EntityMutationTx
  updateCalled: () => boolean
} {
  let updated = false
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => (options.row ? [options.row] : []),
  }
  const updateChain = {
    set: () => updateChain,
    where: () => updateChain,
    returning: async () => {
      updated = true
      return options.updated
    },
  }
  const tx = {
    select: () => selectChain,
    update: () => updateChain,
  } as unknown as EntityMutationTx
  return { tx, updateCalled: () => updated }
}

const DAMAGE = { component: "vitals", op: "damage", amount: 2 } as const
const ACTOR = { userId: "user-1" }

describe("executeEntityWrite handler", () => {
  it("stamps the write's class axis at the committed revision", async () => {
    const stamp = createStampAccumulator()
    const { tx } = fakeTx({ row: seedRow(5), updated: [{ version: 6 }] })

    const result = await executeEntityWrite({
      tx,
      args: { entityId: ENTITY_ID, write: DAMAGE },
      actor: ACTOR,
      stamp,
    })

    expect(result.ok).toBe(true)
    expect(stamp.accepted().revisions).toEqual({
      [entityVitalsAxis(ENTITY_ID)]: 6,
    })
  })

  it("rejects a missing entity without touching the row", async () => {
    const stamp = createStampAccumulator()
    const { tx, updateCalled } = fakeTx({ row: undefined, updated: [] })

    const result = await executeEntityWrite({
      tx,
      args: { entityId: ENTITY_ID, write: DAMAGE },
      actor: ACTOR,
      stamp,
    })

    expect(result).toEqual({ ok: false, error: "entity-not-found" })
    expect(updateCalled()).toBe(false)
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("throws contention (not a rejection) when the guarded write loses a race", async () => {
    const stamp = createStampAccumulator()
    const { tx } = fakeTx({ row: seedRow(5), updated: [] })

    await expect(
      executeEntityWrite({
        tx,
        args: { entityId: ENTITY_ID, write: DAMAGE },
        actor: ACTOR,
        stamp,
      })
    ).rejects.toBeInstanceOf(MutationContentionError)
  })
})
