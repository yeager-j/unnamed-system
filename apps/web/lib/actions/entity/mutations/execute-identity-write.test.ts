import { describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import type { EntityMutationTx } from "./types"

// The handler pulls `server-only` transitively (Store → version-guard →
// realtime/publish); neutralize the build-time guard for the node runner.
vi.mock("server-only", () => ({}))

const commitIdentityWrite = vi.fn()
vi.mock("../identity-store", () => ({
  commitIdentityWrite: (
    executor: unknown,
    actor: unknown,
    args: unknown,
    stamp: unknown
  ) => commitIdentityWrite(executor, actor, args, stamp),
}))

const { executeIdentityWrite } = await import("./execute-identity-write")

const TX = { marker: "savepoint-tx" } as unknown as EntityMutationTx
const ACTOR = { userId: "user-1", email: "user-1@example.com" }
const ARGS = {
  entityId: "e1",
  write: { field: "name", value: "Vela" },
} as const

describe("executeIdentityWrite handler adapter", () => {
  it("forwards the savepoint tx, actor, args, and stamp to the Store", async () => {
    const stamp = createStampAccumulator()
    commitIdentityWrite.mockResolvedValue(ok({ version: 4, shortId: "s1" }))

    const result = await executeIdentityWrite({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp,
    })

    // The committed facts are the door's business, not the handler's: the
    // executor builds the accepted vector from the stamp alone.
    expect(result).toEqual(ok(undefined))
    expect(commitIdentityWrite).toHaveBeenCalledWith(TX, ACTOR, ARGS, stamp)
  })

  it("forwards the Store's typed rejection (the executor records it terminally)", async () => {
    const stamp = createStampAccumulator()
    commitIdentityWrite.mockResolvedValue(err("unauthorized"))

    const result = await executeIdentityWrite({
      tx: TX,
      args: ARGS,
      actor: ACTOR,
      stamp,
    })

    expect(result).toEqual(err("unauthorized"))
  })

  it("lets contention propagate so the authority can rerun the attempt", async () => {
    const stamp = createStampAccumulator()
    const contention = new Error("contention")
    commitIdentityWrite.mockRejectedValue(contention)

    await expect(
      executeIdentityWrite({ tx: TX, args: ARGS, actor: ACTOR, stamp })
    ).rejects.toBe(contention)
  })
})
