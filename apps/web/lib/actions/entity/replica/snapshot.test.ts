import { beforeEach, describe, expect, it, vi } from "vitest"

import { loadEntityAcceptedAction } from "./snapshot"

/**
 * The personalized snapshot's mapping contract (UNN-645): one joined row →
 * one consistent `Accepted` observation. The db chain is stubbed (the
 * single-statement join IS the atomicity argument and can only be exercised
 * against Postgres); the real assemble seam runs, so a malformed stored bag
 * still fails loudly here.
 */
const requireEntityOwner = vi.fn()
const registered = vi.fn()
let rows: unknown[] = []

vi.mock("@/lib/auth/campaign-access", () => ({
  requireEntityOwner: (id: string) => requireEntityOwner(id),
}))
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => ({
        onConflictDoUpdate: () => {
          registered(row)
          return Promise.resolve()
        },
      }),
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    }),
  },
}))

/** A minimal joined row: the entity row plus the client's watermark column. */
function joinedRow(lastMutationId: number | null) {
  return {
    entity: {
      id: "e1",
      shortId: "s1",
      name: "Momo",
      portraitUrl: null,
      pronouns: null,
      vitals: { base: 20, damage: 4 },
      identityVersion: 3,
      vitalsVersion: 7,
      inventoryVersion: 1,
      progressionVersion: 2,
    },
    lastMutationId,
  }
}

const request = {
  entityId: "e1",
  clientGroupId: "entity-e1",
  clientId: "tab-1",
}

beforeEach(() => {
  requireEntityOwner.mockReset().mockResolvedValue({})
  registered.mockReset()
  rows = []
})

describe("loadEntityAcceptedAction", () => {
  it("returns value, watermark, and cursor from the one joined row", async () => {
    rows = [joinedRow(5)]

    const result = await loadEntityAcceptedAction(request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.through).toBe(5)
    expect(result.value.cursor).toEqual({
      identity: 3,
      vitals: 7,
      inventory: 1,
      progression: 2,
    })
    expect(result.value.value.vitals).toEqual({ base: 20, damage: 4 })
    // The lifted metadata components arrive like any other component.
    expect(result.value.value.identity).toMatchObject({ name: "Momo" })
  })

  it("reads `through: 0` for a client with no dedup row yet", async () => {
    rows = [joinedRow(null)]

    const result = await loadEntityAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.through).toBe(0)
  })

  it("gates the read strict-owner — the full bag includes unredacted Secrets", async () => {
    rows = [joinedRow(null)]
    await loadEntityAcceptedAction(request)
    expect(requireEntityOwner).toHaveBeenCalledWith("e1")
  })

  it("registers the client — the bootstrap that licenses absent-row ⇒ unknown-client at the push door", async () => {
    rows = [joinedRow(null)]
    await loadEntityAcceptedAction(request)
    expect(registered).toHaveBeenCalledWith({
      clientGroupId: "entity-e1",
      clientId: "tab-1",
      entityId: "e1",
      lastMutationId: 0,
    })
  })

  it("errs entity-load-failed for a missing entity", async () => {
    rows = []
    const result = await loadEntityAcceptedAction(request)
    expect(result).toEqual({ ok: false, error: "entity-load-failed" })
  })

  it("refuses a malformed request shape", async () => {
    const result = await loadEntityAcceptedAction({ entityId: "" } as never)
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })
})
