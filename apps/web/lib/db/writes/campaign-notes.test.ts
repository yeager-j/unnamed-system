import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import { campaignClock, campaignSlot } from "@/lib/db/schema/campaign-clock"
import {
  campaignBeat,
  campaignBeatMention,
} from "@/lib/db/schema/campaign-notes"
import {
  deleteBeat,
  saveBeatProse,
  scheduleBeat,
} from "@/lib/db/writes/campaign-notes"

/**
 * Pins the campaign-notes write guards with a minimal fake of the drizzle
 * chains these writes use (the `campaign-world.test.ts` pattern): per-table
 * FIFO queues answer the in-transaction selects, and recorded statements let
 * the tests assert *what ran and what didn't*. The behaviors under test are
 * the ones with real branching — D1's frozen-past rule on both ends of a
 * schedule flip, the `"slot-occupied"` unique-violation mapping, the
 * scheduled-to-past delete block, and the mention re-derive riding the body
 * patch.
 */

type Recorded = {
  op: "insert" | "update" | "delete"
  table: unknown
  payload?: unknown
}

let recorded: Recorded[]
let selectQueues: Map<unknown, unknown[][]>
let updateError: Error | null

function nextRows(table: unknown): unknown[] {
  const queue = selectQueues.get(table)
  if (!queue || queue.length === 0) return []
  return queue.shift()!
}

function makeExecutor(): Record<string, unknown> {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(nextRows(table)),
      }),
    }),
    insert: (table: unknown) => ({
      values: (payload: unknown) => {
        recorded.push({ op: "insert", table, payload })
        return {
          returning: async () => [{ id: "new-id" }],
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        }
      },
    }),
    update: (table: unknown) => ({
      set: (payload: unknown) => ({
        where: () => {
          recorded.push({ op: "update", table, payload })
          if (updateError) return Promise.reject(updateError)
          return {
            returning: async () => [{ id: "row-id" }],
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        recorded.push({ op: "delete", table })
        return {
          returning: async () => [{ id: "row-id" }],
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        }
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
  updateError = null
})

describe("scheduleBeat", () => {
  it("schedules an unscheduled beat into an open future slot", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: null }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(campaignSlot, [{ day: 6 }])

    const result = await scheduleBeat({
      campaignId: CAMPAIGN,
      beatId: "b1",
      slotId: "s6",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignBeat,
        payload: { scheduledSlotId: "s6", floating: false },
      },
    ])
  })

  it("rejects a frozen target slot without writing", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: null }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(campaignSlot, [{ day: 4 }])

    const result = await scheduleBeat({
      campaignId: CAMPAIGN,
      beatId: "b1",
      slotId: "s4",
    })

    expect(result).toEqual(err("frozen-day"))
    expect(recorded).toEqual([])
  })

  it("rejects moving a beat OUT of a frozen slot (history keeps its shape)", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: "s-past" }])
    // First clock/slot reads answer the *current* slot's frozen check.
    queue(campaignClock, [{ currentDay: 5 }])
    queue(campaignSlot, [{ day: 3 }])

    const result = await scheduleBeat({
      campaignId: CAMPAIGN,
      beatId: "b1",
      slotId: "s-future",
    })

    expect(result).toEqual(err("frozen-day"))
    expect(recorded).toEqual([])
  })

  it("maps the one-beat-per-slot unique violation to slot-occupied", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: null }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(campaignSlot, [{ day: 6 }])
    updateError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "campaignBeat_scheduledSlot_unique",
    })

    const result = await scheduleBeat({
      campaignId: CAMPAIGN,
      beatId: "b1",
      slotId: "s6",
    })

    expect(result).toEqual(err("slot-occupied"))
  })

  it("no-ops when the beat already holds the target slot", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: "s6" }])

    const result = await scheduleBeat({
      campaignId: CAMPAIGN,
      beatId: "b1",
      slotId: "s6",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([])
  })

  it("rejects a cross-campaign slot as slot-not-found", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: null }])
    queue(campaignClock, [{ currentDay: 5 }])
    queue(campaignSlot, []) // (id, campaignId) scoping filtered it out

    const result = await scheduleBeat({
      campaignId: CAMPAIGN,
      beatId: "b1",
      slotId: "foreign-slot",
    })

    expect(result).toEqual(err("slot-not-found"))
    expect(recorded).toEqual([])
  })
})

describe("deleteBeat", () => {
  it("blocks deleting a beat scheduled to a past slot", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: "s-past" }])
    queue(campaignClock, [{ currentDay: 9 }])
    queue(campaignSlot, [{ day: 2 }])

    const result = await deleteBeat({ campaignId: CAMPAIGN, beatId: "b1" })

    expect(result).toEqual(err("scheduled-to-past"))
    expect(recorded).toEqual([])
  })

  it("deletes a beat scheduled to today", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: "s-today" }])
    queue(campaignClock, [{ currentDay: 9 }])
    queue(campaignSlot, [{ day: 9 }])

    const result = await deleteBeat({ campaignId: CAMPAIGN, beatId: "b1" })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([{ op: "delete", table: campaignBeat }])
  })

  it("deletes an unscheduled beat without reading the clock", async () => {
    queue(campaignBeat, [{ id: "b1", scheduledSlotId: null }])

    const result = await deleteBeat({ campaignId: CAMPAIGN, beatId: "b1" })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([{ op: "delete", table: campaignBeat }])
  })
})

describe("saveBeatProse", () => {
  it("re-derives the mention index when the body changes", async () => {
    const body =
      "Meet [[npc:n1|Maren]] at [[article:a1|Saltmere]], then [[npc:n1|her]] again."

    const result = await saveBeatProse({
      campaignId: CAMPAIGN,
      beatId: "b1",
      patch: { body },
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      { op: "update", table: campaignBeat, payload: { body } },
      { op: "delete", table: campaignBeatMention },
      {
        op: "insert",
        table: campaignBeatMention,
        payload: [
          { beatId: "b1", participantKind: "npc", participantId: "n1" },
          { beatId: "b1", participantKind: "article", participantId: "a1" },
        ],
      },
    ])
  })

  it("clears the index for a chip-free body without inserting", async () => {
    const result = await saveBeatProse({
      campaignId: CAMPAIGN,
      beatId: "b1",
      patch: { body: "No chips here." },
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignBeat,
        payload: { body: "No chips here." },
      },
      { op: "delete", table: campaignBeatMention },
    ])
  })

  it("leaves the mention index alone on a title-only patch", async () => {
    const result = await saveBeatProse({
      campaignId: CAMPAIGN,
      beatId: "b1",
      patch: { title: "The Queen's Offer" },
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignBeat,
        payload: { title: "The Queen's Offer" },
      },
    ])
  })
})
