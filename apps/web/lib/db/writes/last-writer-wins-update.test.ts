import { beforeEach, describe, expect, it, vi } from "vitest"

import { maps } from "@/lib/db/schema/map"

import { lastWriterWinsUpdate } from "./last-writer-wins-update"

const setArg = vi.fn()
const returningRows = vi.fn()

vi.mock("@/lib/db/client", () => ({
  db: {
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        setArg(payload)
        return { where: () => ({ returning: async () => returningRows() }) }
      },
    }),
  },
}))

beforeEach(() => {
  setArg.mockReset()
  returningRows.mockReset().mockReturnValue([{ id: "m1" }])
})

describe("lastWriterWinsUpdate", () => {
  it("patches only the named fields and advances the row revision", async () => {
    const result = await lastWriterWinsUpdate({
      table: maps,
      id: "m1",
      patch: { name: "renamed" },
      notFound: "map-not-found",
    })

    expect(result).toEqual({ ok: true, value: undefined })
    expect(Object.keys(setArg.mock.calls[0]![0]).sort()).toEqual([
      "name",
      "version",
    ])
  })

  it("returns the aggregate's not-found error when no row was updated", async () => {
    returningRows.mockReturnValue([])

    const result = await lastWriterWinsUpdate({
      table: maps,
      id: "gone",
      patch: { name: "renamed" },
      notFound: "map-not-found",
    })

    expect(result).toEqual({ ok: false, error: "map-not-found" })
  })
})
