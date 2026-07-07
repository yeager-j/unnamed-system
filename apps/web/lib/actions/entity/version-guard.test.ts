import { beforeEach, describe, expect, it, vi } from "vitest"

import { bumpEntityVersionGuarded } from "./version-guard"

/**
 * The structural guarantee CH15 buys (UNN-551): a guarded write SETs **only** its
 * patch's component columns plus **exactly** its Writer's class token, so two
 * writes in different classes touch disjoint column sets and cannot clobber each
 * other — the safety is structural, not a matter of per-path discipline. We assert
 * that footprint by capturing the `UPDATE … SET` payload.
 */
const setArg = vi.fn()
const returningRows = vi.fn()
const selectRows = vi.fn()
const publishCharacterPing = vi.fn()

vi.mock("@/lib/db/client", () => ({
  db: {
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        setArg(payload)
        return {
          where: () => ({ returning: async () => returningRows() }),
        }
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => selectRows() }),
      }),
    }),
  },
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: (shortId: string, kind: string, versions: unknown) =>
    publishCharacterPing(shortId, kind, versions),
}))

beforeEach(() => {
  setArg.mockReset()
  returningRows.mockReset().mockReturnValue([{ version: 8, shortId: "s1" }])
  selectRows.mockReset()
  publishCharacterPing.mockReset()
})

describe("bumpEntityVersionGuarded — disjoint per-class column footprint", () => {
  it("a vitals write SETs only its vitals column + the vitals token", async () => {
    const result = await bumpEntityVersionGuarded("e1", "vitals", 3, {
      vitals: { base: 20, damage: 5 },
    })

    expect(result).toEqual({ ok: true, value: { version: 8 } })
    const keys = Object.keys(setArg.mock.calls[0]![0]).sort()
    expect(keys).toEqual(["vitals", "vitalsVersion"])
    expect(publishCharacterPing).toHaveBeenCalledWith("s1", "entity", {
      vitals: 8,
    })
  })

  it("a progression write SETs only its component column + the progression token", async () => {
    await bumpEntityVersionGuarded("e1", "progression", 2, {
      virtues: {
        ranks: { expression: 3, empathy: 0, wisdom: 0, focus: 0 },
        sparkLog: [],
      },
    })

    const keys = Object.keys(setArg.mock.calls[0]![0]).sort()
    // A cross-class token (`vitalsVersion`, `identityVersion`, …) is NEVER in the
    // set — that disjointness is why a concurrent vitals write can't be clobbered.
    expect(keys).toEqual(["progressionVersion", "virtues"])
  })

  it("returns `stale` when the guard misses but the row exists", async () => {
    returningRows.mockReturnValue([])
    selectRows.mockReturnValue([{ id: "e1" }])
    const result = await bumpEntityVersionGuarded("e1", "vitals", 99, {
      vitals: { base: 20, damage: 0 },
    })
    expect(result).toEqual({ ok: false, error: "stale" })
    expect(publishCharacterPing).not.toHaveBeenCalled()
  })

  it("returns `entity-not-found` when the row is gone", async () => {
    returningRows.mockReturnValue([])
    selectRows.mockReturnValue([])
    const result = await bumpEntityVersionGuarded("e1", "vitals", 1, {
      vitals: { base: 20, damage: 0 },
    })
    expect(result).toEqual({ ok: false, error: "entity-not-found" })
  })
})
