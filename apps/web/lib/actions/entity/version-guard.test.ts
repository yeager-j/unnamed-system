import { beforeEach, describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"

import { entityAxisFor } from "@/lib/db/axes"
import type { EntityRow } from "@/lib/db/schema/entity"

import { advanceEntityAxisGuarded } from "./version-guard"

/** The structural guarantee CH15 buys (UNN-551/UNN-677): a guarded write SETs
 * only its patch and one class token, and the accepted revision is recorded on
 * the same attempt stamp. */
const setArg = vi.fn()
const returningRows = vi.fn()
const executor = {
  update: () => ({
    set: (payload: Record<string, unknown>) => {
      setArg(payload)
      return {
        where: () => ({ returning: async () => returningRows() }),
      }
    },
  }),
}

const row = {
  id: "e1",
  identityVersion: 3,
  vitalsVersion: 3,
  inventoryVersion: 3,
  progressionVersion: 3,
} as EntityRow

beforeEach(() => {
  setArg.mockReset()
  returningRows.mockReset().mockReturnValue([{ version: 8 }])
})

describe("advanceEntityAxisGuarded", () => {
  it("sets only the component column and class token, then stamps it", async () => {
    const stamp = createStampAccumulator()
    const version = await advanceEntityAxisGuarded(
      executor as never,
      row,
      "vitals",
      { vitals: { base: 20, damage: 5 } },
      stamp
    )

    expect(version).toBe(8)
    expect(Object.keys(setArg.mock.calls[0]![0]).sort()).toEqual([
      "vitals",
      "vitalsVersion",
    ])
    expect(stamp.accepted().revisions).toEqual({
      [entityAxisFor.vitals("e1")]: 8,
    })
  })

  it("keeps progression writes disjoint from every sibling token", async () => {
    await advanceEntityAxisGuarded(
      executor as never,
      row,
      "progression",
      {
        virtues: {
          ranks: { expression: 3, empathy: 0, wisdom: 0, focus: 0 },
          sparkLog: [],
        },
      },
      createStampAccumulator()
    )

    expect(Object.keys(setArg.mock.calls[0]![0]).sort()).toEqual([
      "progressionVersion",
      "virtues",
    ])
  })

  it("throws contention when the guarded update loses its race", async () => {
    returningRows.mockReturnValue([])

    await expect(
      advanceEntityAxisGuarded(
        executor as never,
        row,
        "identity",
        { name: "Vela" },
        createStampAccumulator()
      )
    ).rejects.toMatchObject({ name: "MutationContentionError" })
  })
})
