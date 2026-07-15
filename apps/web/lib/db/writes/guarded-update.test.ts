import { beforeEach, describe, expect, it, vi } from "vitest"

import { maps } from "@/lib/db/schema/map"

import { guardedVersionUpdate } from "./guarded-update"

/**
 * The single-`version` guard the non-character aggregates share (UNN-597). We pin
 * the two properties every caller relies on: the `UPDATE … SET` footprint is the
 * patch **plus exactly** the `version` token (so a write can't clobber a sibling
 * column or skip the bump), and the zero-row result disambiguates `stale` (row
 * present) from `not-found` (row gone) via the existence SELECT. A real table
 * object (`maps`) drives it; only the `db` client is mocked.
 */
const setArg = vi.fn()
const returningRows = vi.fn()
const selectRows = vi.fn()

vi.mock("@/lib/db/client", () => ({
  db: {
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        setArg(payload)
        return { where: () => ({ returning: async () => returningRows() }) }
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => selectRows() }),
      }),
    }),
  },
}))

beforeEach(() => {
  setArg.mockReset()
  returningRows.mockReset().mockReturnValue([{ version: 5 }])
  selectRows.mockReset()
})

describe("guardedVersionUpdate", () => {
  it("SETs exactly the patch columns plus the version token, and returns the bumped version", async () => {
    const result = await guardedVersionUpdate({
      table: maps,
      id: "m1",
      expectedVersion: 3,
      patch: { name: "renamed" },
      notFound: "map-not-found",
    })

    expect(result).toEqual({ ok: true, value: { version: 5 } })
    const keys = Object.keys(setArg.mock.calls[0]![0]).sort()
    expect(keys).toEqual(["name", "version"])
  })

  it("returns `stale` when the guard misses but the row exists", async () => {
    returningRows.mockReturnValue([])
    selectRows.mockReturnValue([{ id: "m1" }])

    const result = await guardedVersionUpdate({
      table: maps,
      id: "m1",
      expectedVersion: 99,
      patch: { name: "renamed" },
      notFound: "map-not-found",
    })

    expect(result).toEqual({ ok: false, error: "stale" })
  })

  it("returns the caller's `notFound` string when the row is gone", async () => {
    returningRows.mockReturnValue([])
    selectRows.mockReturnValue([])

    const result = await guardedVersionUpdate({
      table: maps,
      id: "gone",
      expectedVersion: 1,
      patch: { name: "renamed" },
      notFound: "map-not-found",
    })

    expect(result).toEqual({ ok: false, error: "map-not-found" })
  })
})
