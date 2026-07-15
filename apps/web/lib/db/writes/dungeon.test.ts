import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import {
  campaignClock,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import { dungeons } from "@/lib/db/schema/dungeon"
import { archiveDungeon } from "@/lib/db/writes/dungeon"

/**
 * Pins {@link archiveDungeon}'s soft-delete flip with the house fake-executor
 * pattern (`campaign-slot-dungeon.test.ts`): per-table FIFO queues answer the
 * in-transaction selects; recorded statements assert what ran and what didn't.
 * Under test: the `deletedAt` flip always fires, **frozen** claims are preserved
 * while present/future claims are released, and cross-campaign scoping.
 *
 * The claims read joins `campaignSlotDungeon → campaignSlot`, so the fake
 * `select` chain gains an `innerJoin` passthrough; its rows are queued on the
 * `from` table (`campaignSlotDungeon`) and already carry the joined `day`.
 */

type Recorded = {
  op: "insert" | "update" | "delete"
  table: unknown
  payload?: unknown
}

let recorded: Recorded[]
let selectQueues: Map<unknown, unknown[][]>

function nextRows(table: unknown): unknown[] {
  const queue = selectQueues.get(table)
  if (!queue || queue.length === 0) return []
  return queue.shift()!
}

function makeExecutor(): Record<string, unknown> {
  return {
    select: () => ({
      from: (table: unknown) => {
        const chain = {
          innerJoin: () => chain,
          where: () => {
            const rows = nextRows(table)
            return {
              then: (resolve: (v: unknown) => void) => resolve(rows),
              for: () => Promise.resolve(rows),
            }
          },
        }
        return chain
      },
    }),
    update: (table: unknown) => ({
      set: (payload: unknown) => ({
        where: () => {
          recorded.push({ op: "update", table, payload })
          return Promise.resolve(undefined)
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        recorded.push({ op: "delete", table })
        return Promise.resolve(undefined)
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run(makeExecutor()),
  }
}

vi.mock("@/lib/db/client", () => ({
  get db() {
    return makeExecutor()
  },
}))

const CAMPAIGN = "campaign-1"

function queue(table: unknown, ...responses: unknown[][]) {
  selectQueues.set(table, [...(selectQueues.get(table) ?? []), ...responses])
}

beforeEach(() => {
  recorded = []
  selectQueues = new Map()
})

describe("archiveDungeon", () => {
  it("preserves frozen claims — only flips deletedAt", async () => {
    queue(dungeons, [{ id: "d1" }])
    queue(campaignSlotDungeon, [{ slotId: "s-past", day: 3 }])
    queue(campaignClock, [{ currentDay: 5 }])

    const result = await archiveDungeon({
      campaignId: CAMPAIGN,
      dungeonId: "d1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.op).toBe("update")
    expect(recorded[0]!.table).toBe(dungeons)
    expect(
      (recorded[0]!.payload as { deletedAt: Date }).deletedAt
    ).toBeInstanceOf(Date)
  })

  it("releases present/future claims to downtime, then flips deletedAt", async () => {
    queue(dungeons, [{ id: "d1" }])
    queue(campaignSlotDungeon, [
      { slotId: "s-now", day: 5 },
      { slotId: "s-future", day: 7 },
    ])
    queue(campaignClock, [{ currentDay: 5 }])

    const result = await archiveDungeon({
      campaignId: CAMPAIGN,
      dungeonId: "d1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      { op: "delete", table: campaignSlotDungeon },
      {
        op: "update",
        table: dungeons,
        payload: expect.objectContaining({ deletedAt: expect.any(Date) }),
      },
    ])
  })

  it("releases only the non-frozen claims of a mixed dungeon", async () => {
    queue(dungeons, [{ id: "d1" }])
    queue(campaignSlotDungeon, [
      { slotId: "s-past", day: 2 },
      { slotId: "s-future", day: 6 },
    ])
    queue(campaignClock, [{ currentDay: 5 }])

    const result = await archiveDungeon({
      campaignId: CAMPAIGN,
      dungeonId: "d1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded.map((r) => r.op)).toEqual(["delete", "update"])
  })

  it("archives a claimless dungeon without reading the clock", async () => {
    queue(dungeons, [{ id: "d1" }])
    queue(campaignSlotDungeon, [])

    const result = await archiveDungeon({
      campaignId: CAMPAIGN,
      dungeonId: "d1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: dungeons,
        payload: expect.objectContaining({ deletedAt: expect.any(Date) }),
      },
    ])
  })

  it("reports a missing/cross-campaign dungeon as dungeon-not-found", async () => {
    queue(dungeons, [])

    const result = await archiveDungeon({
      campaignId: CAMPAIGN,
      dungeonId: "foreign-dungeon",
    })

    expect(result).toEqual(err("dungeon-not-found"))
    expect(recorded).toEqual([])
  })
})
