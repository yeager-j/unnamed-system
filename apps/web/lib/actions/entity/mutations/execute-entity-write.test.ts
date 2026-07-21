import { describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import type { EntityMutationTx } from "./types"

// The handler pulls `server-only` transitively (Store → version-guard →
// realtime/publish); neutralize the build-time guard for the node runner.
vi.mock("server-only", () => ({}))

const commitEntityWrite = vi.fn()
vi.mock("../entity-row-store", () => ({
  commitEntityWrite: (
    executor: unknown,
    actor: unknown,
    args: unknown,
    stamp: unknown
  ) => commitEntityWrite(executor, actor, args, stamp),
}))

const { executeEntityWrite } = await import("./execute-entity-write")

const TX = { marker: "savepoint-tx" } as unknown as EntityMutationTx
const ACTOR = { userId: "user-1", email: "user-1@example.com" }
const ARGS = {
  entityId: "e1",
  write: { component: "vitals", op: "damage", amount: 2 },
} as const

describe("executeEntityWrite handler adapter", () => {
  it("forwards the savepoint tx, actor, args, and stamp to the Store", async () => {
    const stamp = createStampAccumulator()
    commitEntityWrite.mockResolvedValue(
      ok({
        version: 6,
        shortId: "s1",
        versionClass: "vitals",
        status: "finalized",
      })
    )

    const result = await executeEntityWrite({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp,
    })

    expect(result).toEqual(ok(undefined))
    expect(commitEntityWrite).toHaveBeenCalledWith(TX, ACTOR, ARGS, stamp)
  })

  it("forwards the Store's typed rejection (the executor records it terminally)", async () => {
    const stamp = createStampAccumulator()
    commitEntityWrite.mockResolvedValue(err("unauthorized"))

    const result = await executeEntityWrite({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp,
    })

    expect(result).toEqual({ ok: false, error: "unauthorized" })
  })
})
