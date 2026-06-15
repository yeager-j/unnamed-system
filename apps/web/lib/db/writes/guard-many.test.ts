import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game/foundation"

// `guardMany` wraps `db.transaction`, whose only behavior that matters here is:
// it runs the callback, and a throw inside it rolls back + propagates. Emulate
// that with a fake transaction so the rollback contract is testable without a
// DB — `rolledBack` records whether the callback threw (i.e. a real tx would
// have rolled back). The `tx` handle is opaque to `guardMany`; pass a sentinel.
const FAKE_TX = { __tx: true }
let rolledBack = false

const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) => {
  try {
    return await run(FAKE_TX)
  } catch (error) {
    rolledBack = true
    throw error
  }
})

vi.mock("@/lib/db/client", () => ({ db: { transaction } }))

const { guardMany } = await import("./guard-many")

beforeEach(() => {
  rolledBack = false
  transaction.mockClear()
})

describe("guardMany", () => {
  it("commits and returns the value when the body succeeds", async () => {
    const result = await guardMany(async () => ok({ version: 3 }))

    expect(result).toEqual(ok({ version: 3 }))
    expect(rolledBack).toBe(false)
    expect(transaction).toHaveBeenCalledOnce()
  })

  it("rolls back and surfaces the error when the body returns err", async () => {
    const result = await guardMany(async () => err("stale"))

    expect(result).toEqual(err("stale"))
    expect(rolledBack).toBe(true)
  })

  it("rolls back the whole transaction when a later guard fails after an earlier one wrote", async () => {
    const firstGuard = vi.fn(async () => ok({ version: 1 }))
    const secondGuard = vi.fn(async () => err("map-instance-not-found"))

    const result = await guardMany(async (tx) => {
      const first = await firstGuard()
      if (!first.ok) return first
      const second = await secondGuard()
      if (!second.ok) return second
      return ok({ first: first.value, second: second.value, tx })
    })

    expect(result).toEqual(err("map-instance-not-found"))
    expect(firstGuard).toHaveBeenCalledOnce()
    expect(secondGuard).toHaveBeenCalledOnce()
    expect(rolledBack).toBe(true)
  })

  it("passes the transaction executor to the body", async () => {
    let seen: unknown
    await guardMany(async (tx) => {
      seen = tx
      return ok(null)
    })

    expect(seen).toBe(FAKE_TX)
  })

  it("propagates a non-guard exception unchanged (a real failure, not a verdict)", async () => {
    const boom = new Error("connection reset")

    await expect(
      guardMany(async () => {
        throw boom
      })
    ).rejects.toBe(boom)
    expect(rolledBack).toBe(true)
  })
})
