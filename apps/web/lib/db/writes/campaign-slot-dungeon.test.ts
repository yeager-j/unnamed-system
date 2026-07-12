import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import {
  campaignClock,
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import { campaignBeat } from "@/lib/db/schema/campaign-notes"
import { dungeons } from "@/lib/db/schema/dungeon"
import {
  claimDungeonSlot,
  setDungeonSlotResolved,
  unclaimDungeonSlot,
} from "@/lib/db/writes/campaign-slot-dungeon"

/**
 * Pins the dungeon-claim write guards with the house fake-executor pattern
 * (`campaign-notes.test.ts`): per-table FIFO queues answer the
 * in-transaction selects; recorded statements assert what ran and what
 * didn't. Under test: D1's frozen-past rule on claim/unclaim, D9's mutual
 * exclusion (a beat-held slot rejects the claim), and the claim PK's
 * 23505 → `"slot-occupied"` mapping.
 */

type Recorded = {
  op: "insert" | "update" | "delete"
  table: unknown
  payload?: unknown
}

let recorded: Recorded[]
let selectQueues: Map<unknown, unknown[][]>
let insertError: Error | null
let writeReturning: unknown[]

function nextRows(table: unknown): unknown[] {
  const queue = selectQueues.get(table)
  if (!queue || queue.length === 0) return []
  return queue.shift()!
}

function makeExecutor(): Record<string, unknown> {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = nextRows(table)
          return {
            then: (resolve: (v: unknown) => void) => resolve(rows),
            for: () => Promise.resolve(rows),
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (payload: unknown) => {
        recorded.push({ op: "insert", table, payload })
        return {
          then: (
            resolve: (v: unknown) => void,
            reject: (e: unknown) => void
          ) => (insertError ? reject(insertError) : resolve(undefined)),
        }
      },
    }),
    update: (table: unknown) => ({
      set: (payload: unknown) => ({
        where: () => {
          recorded.push({ op: "update", table, payload })
          return { returning: async () => writeReturning }
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        recorded.push({ op: "delete", table })
        return { returning: async () => writeReturning }
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
  insertError = null
  writeReturning = [{ slotId: "s1" }]
})

describe("claimDungeonSlot", () => {
  it("claims an open current-day slot", async () => {
    queue(campaignSlot, [{ day: 5 }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(dungeons, [{ id: "d1" }])

    const result = await claimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
      dungeonId: "d1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "insert",
        table: campaignSlotDungeon,
        payload: { slotId: "s1", dungeonId: "d1" },
      },
    ])
  })

  it("rejects a frozen (past) slot without writing", async () => {
    queue(campaignSlot, [{ day: 3 }])
    queue(campaignClock, [{ currentDay: 5 }])

    const result = await claimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
      dungeonId: "d1",
    })

    expect(result).toEqual(err("frozen-day"))
    expect(recorded).toEqual([])
  })

  it("rejects a cross-campaign dungeon as dungeon-not-found", async () => {
    queue(campaignSlot, [{ day: 5 }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(dungeons, [])

    const result = await claimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
      dungeonId: "foreign-dungeon",
    })

    expect(result).toEqual(err("dungeon-not-found"))
    expect(recorded).toEqual([])
  })

  it("rejects a slot holding a beat as slot-occupied (mutual exclusion)", async () => {
    queue(campaignSlot, [{ day: 5 }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(dungeons, [{ id: "d1" }])
    queue(campaignBeat, [{ id: "b1" }])

    const result = await claimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
      dungeonId: "d1",
    })

    expect(result).toEqual(err("slot-occupied"))
    expect(recorded).toEqual([])
  })

  it("maps the claim PK's 23505 (concurrent double-claim) to slot-occupied", async () => {
    queue(campaignSlot, [{ day: 5 }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(dungeons, [{ id: "d1" }])
    insertError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "campaignSlotDungeon_pkey",
    })

    const result = await claimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
      dungeonId: "d1",
    })

    expect(result).toEqual(err("slot-occupied"))
  })
})

describe("unclaimDungeonSlot", () => {
  it("removes a current-day claim (slot reverts to downtime)", async () => {
    queue(campaignSlot, [{ day: 5 }])
    queue(campaignClock, [{ currentDay: 5 }])

    const result = await unclaimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([{ op: "delete", table: campaignSlotDungeon }])
  })

  it("rejects unclaiming a frozen slot (history keeps its shape)", async () => {
    queue(campaignSlot, [{ day: 3 }])
    queue(campaignClock, [{ currentDay: 5 }])

    const result = await unclaimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
    })

    expect(result).toEqual(err("frozen-day"))
    expect(recorded).toEqual([])
  })

  it("reports a missing claim as claim-not-found", async () => {
    queue(campaignSlot, [{ day: 5 }])
    queue(campaignClock, [{ currentDay: 5 }])
    writeReturning = []

    const result = await unclaimDungeonSlot({
      campaignId: CAMPAIGN,
      slotId: "s1",
    })

    expect(result).toEqual(err("claim-not-found"))
  })
})

describe("setDungeonSlotResolved", () => {
  it("stamps and clears resolvedAt (LWW, frozen-exempt like a beat's)", async () => {
    queue(campaignSlot, [{ day: 5 }], [{ day: 5 }])

    const resolved = await setDungeonSlotResolved({
      campaignId: CAMPAIGN,
      slotId: "s1",
      resolved: true,
    })
    const reopened = await setDungeonSlotResolved({
      campaignId: CAMPAIGN,
      slotId: "s1",
      resolved: false,
    })

    expect(resolved).toEqual(ok(undefined))
    expect(reopened).toEqual(ok(undefined))
    expect(
      (recorded[0]!.payload as { resolvedAt: Date | null }).resolvedAt
    ).toBeInstanceOf(Date)
    expect(recorded[1]!.payload).toEqual({ resolvedAt: null })
  })

  it("scopes by campaign: a foreign slot reads as claim-not-found", async () => {
    queue(campaignSlot, [])

    const result = await setDungeonSlotResolved({
      campaignId: CAMPAIGN,
      slotId: "foreign-slot",
      resolved: true,
    })

    expect(result).toEqual(err("claim-not-found"))
    expect(recorded).toEqual([])
  })
})
