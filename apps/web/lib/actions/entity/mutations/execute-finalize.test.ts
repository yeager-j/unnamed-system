import { beforeEach, describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import type { EntityMutationTx } from "./types"

const loadPlayerCharacterById = vi.fn()
const loadEntityRow = vi.fn()
const buildFinalizePatch = vi.fn()
const advanceEntityAxisGuarded = vi.fn()
const setStatus = vi.fn()
const whereStatus = vi.fn()

vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (id: string, tx: unknown) =>
    loadPlayerCharacterById(id, tx),
}))
vi.mock("@/domain/game-v2/entity-row-to-bag", () => ({
  loadEntityRow: (row: unknown) => loadEntityRow(row),
}))
vi.mock("@/domain/entity/finalize", () => ({
  buildFinalizePatch: (...args: unknown[]) => buildFinalizePatch(...args),
}))
vi.mock("@/domain/game-engine-v2", () => ({
  getArchetype: vi.fn(),
  startingWeaponForLineage: vi.fn(),
}))
vi.mock("../version-guard", () => ({
  advanceEntityAxisGuarded: (...args: unknown[]) =>
    advanceEntityAxisGuarded(...args),
}))

const TX = {
  update: () => ({
    set: (value: unknown) => {
      setStatus(value)
      return { where: (condition: unknown) => whereStatus(condition) }
    },
  }),
} as unknown as EntityMutationTx
const ACTOR = { userId: "user-1", email: "user-1@example.com" }
const ARGS = { entityId: "e1" }
const ENTITY = { id: "e1", name: "Vela", identityVersion: 3 }

const { executeFinalize } = await import("./execute-finalize")

beforeEach(() => {
  vi.clearAllMocks()
  loadPlayerCharacterById.mockResolvedValue({
    entityId: "e1",
    userId: ACTOR.userId,
    status: "draft",
    entity: ENTITY,
  })
  loadEntityRow.mockReturnValue(ok({ components: { archetypes: {} } }))
  buildFinalizePatch.mockReturnValue(
    ok({ status: "finalized", equipment: { items: [], currency: 0 } })
  )
  advanceEntityAxisGuarded.mockResolvedValue(4)
})

describe("executeFinalize", () => {
  it("commits the axis patch and subtype status in the supplied transaction", async () => {
    const stamp = createStampAccumulator()

    const result = await executeFinalize({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp,
    })

    expect(result).toEqual(ok(undefined))
    expect(advanceEntityAxisGuarded).toHaveBeenCalledWith(
      TX,
      ENTITY,
      "identity",
      { equipment: { items: [], currency: 0 } },
      stamp
    )
    expect(setStatus).toHaveBeenCalledWith({ status: "finalized" })
    expect(whereStatus).toHaveBeenCalledOnce()
  })

  it("refuses a non-draft before advancing the axis", async () => {
    loadPlayerCharacterById.mockResolvedValue({
      userId: ACTOR.userId,
      status: "finalized",
      entity: ENTITY,
    })

    const result = await executeFinalize({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp: createStampAccumulator(),
    })

    expect(result).toEqual(err("entity-not-draft"))
    expect(advanceEntityAxisGuarded).not.toHaveBeenCalled()
  })

  it("returns the authoritative finalize refusal without writing", async () => {
    buildFinalizePatch.mockReturnValue(err("no-origin-archetype"))

    const result = await executeFinalize({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp: createStampAccumulator(),
    })

    expect(result).toEqual(err("no-origin-archetype"))
    expect(advanceEntityAxisGuarded).not.toHaveBeenCalled()
    expect(setStatus).not.toHaveBeenCalled()
  })

  it("stores a structured gate failure as the protocol's string rejection", async () => {
    buildFinalizePatch.mockReturnValue(
      err({
        kind: "missing-requirement",
        stepSlug: "persona",
        reason: "Name your character.",
      })
    )

    const result = await executeFinalize({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp: createStampAccumulator(),
    })

    expect(result).toEqual(err("missing-finalize-requirement"))
    expect(advanceEntityAxisGuarded).not.toHaveBeenCalled()
  })
})
