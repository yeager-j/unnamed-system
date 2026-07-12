import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import {
  campaignClock,
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import { campaignBeat } from "@/lib/db/schema/campaign-notes"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import { campaignArticle } from "@/lib/db/schema/campaign-world"
import { playerCharacter } from "@/lib/db/schema/player-character"
import {
  advanceClock,
  endDay,
  unAdvanceClock,
} from "@/lib/db/writes/campaign-clock"

/**
 * Pins the `endDay` bulk gesture (UNN-577, PRD FR-5) with the house
 * fake-executor pattern: the two mode branches' beat/claim treatment, the
 * Idle fill's evaluate-downtime-AFTER-the-mutations slot set, the
 * tombstone-filtered roster join, and the stale pre-check writing nothing.
 */

type Recorded = {
  op: "insert" | "update" | "delete"
  table: unknown
  payload?: unknown
}

let recorded: Recorded[]
let selectQueues: Map<unknown, unknown[][]>

const CAS_RESULT = [{ currentDay: 6, clockVersion: 8 }]

function nextRows(table: unknown): unknown[] {
  const queue = selectQueues.get(table)
  if (!queue || queue.length === 0) return []
  return queue.shift()!
}

function selectChain() {
  return {
    from: (table: unknown) => {
      const where = () => {
        const rows = nextRows(table)
        return {
          then: (resolve: (v: unknown) => void) => resolve(rows),
          for: () => Promise.resolve(rows),
        }
      }
      return { where, innerJoin: () => ({ where }) }
    },
  }
}

function makeExecutor(): Record<string, unknown> {
  return {
    select: selectChain,
    selectDistinct: selectChain,
    insert: (table: unknown) => ({
      values: (payload: unknown) => {
        recorded.push({ op: "insert", table, payload })
        return {
          onConflictDoNothing: () => Promise.resolve(undefined),
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        }
      },
    }),
    update: (table: unknown) => ({
      set: (payload: unknown) => ({
        where: () => {
          recorded.push({ op: "update", table, payload })
          return {
            returning: async () => (table === campaignClock ? CAS_RESULT : []),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        recorded.push({ op: "delete", table })
        return {
          returning: async () => [],
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
const CLOCK = [
  {
    campaignId: CAMPAIGN,
    currentDay: 5,
    clockVersion: 7,
    slotTemplate: [{ label: "Morning" }, { label: "Evening" }],
  },
]

function queue(table: unknown, ...responses: unknown[][]) {
  selectQueues.set(table, [...(selectQueues.get(table) ?? []), ...responses])
}

/** Today: a story slot, a dungeon slot, an open downtime slot. */
function queueTypicalDay(input: {
  beatResolvedAt: Date | null
  claimResolvedAt: Date | null
}) {
  queue(campaignClock, CLOCK)
  queue(
    campaignSlot,
    [{ id: "s-story" }, { id: "s-dungeon" }, { id: "s-open" }],
    [] // daysWithSlots: tomorrow not materialized yet
  )
  queue(campaignBeat, [
    { id: "b1", scheduledSlotId: "s-story", resolvedAt: input.beatResolvedAt },
  ])
  queue(campaignSlotDungeon, [
    { slotId: "s-dungeon", resolvedAt: input.claimResolvedAt },
  ])
  queue(playerCharacter, [{ characterId: "c1" }, { characterId: "c2" }])
  queue(campaignUpdate, [{ slotId: "s-open", primaryId: "c1" }])
}

beforeEach(() => {
  recorded = []
  selectQueues = new Map()
})

describe("endDay", () => {
  it("resolve-all stamps beats and claims, fills only true downtime gaps", async () => {
    queueTypicalDay({ beatResolvedAt: null, claimResolvedAt: null })

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "resolve-all",
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))

    const [beatStamp, claimStamp, idleFill, tomorrowSlots, cas] = recorded
    expect(beatStamp).toMatchObject({ op: "update", table: campaignBeat })
    expect(
      (beatStamp!.payload as { resolvedAt: Date }).resolvedAt
    ).toBeInstanceOf(Date)
    expect(claimStamp).toMatchObject({
      op: "update",
      table: campaignSlotDungeon,
    })
    // Only the open slot's missing character gets Idle — the story and
    // dungeon slots stay occupied under resolve-all.
    expect(idleFill).toMatchObject({ op: "insert", table: campaignUpdate })
    expect(idleFill!.payload).toEqual([
      {
        campaignId: CAMPAIGN,
        day: 5,
        primaryKind: "character",
        primaryId: "c2",
        body: "",
        category: "idle",
        slotId: "s-open",
      },
    ])
    expect(tomorrowSlots).toMatchObject({ op: "insert", table: campaignSlot })
    expect(cas).toMatchObject({ op: "update", table: campaignClock })
    expect(recorded).toHaveLength(5)
  })

  it("defer-unresolved floats the beat with provenance, unclaims, and fills the freed slots", async () => {
    queueTypicalDay({ beatResolvedAt: null, claimResolvedAt: null })

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "defer-unresolved",
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))

    const [beatDefer, claimDelete, idleFill] = recorded
    expect(beatDefer).toMatchObject({
      op: "update",
      table: campaignBeat,
      payload: expect.objectContaining({
        scheduledSlotId: null,
        floating: true,
        resolvedAt: null,
        // Provenance rides the SQL self-reference (one statement, CHECK-safe).
        deferredFromSlotId: expect.anything(),
      }),
    })
    expect(claimDelete).toEqual({ op: "delete", table: campaignSlotDungeon })
    // The deferred and unclaimed slots became downtime — they get filled too.
    expect(idleFill!.payload).toEqual([
      expect.objectContaining({ slotId: "s-story", primaryId: "c1" }),
      expect.objectContaining({ slotId: "s-story", primaryId: "c2" }),
      expect.objectContaining({ slotId: "s-dungeon", primaryId: "c1" }),
      expect.objectContaining({ slotId: "s-dungeon", primaryId: "c2" }),
      expect.objectContaining({ slotId: "s-open", primaryId: "c2" }),
    ])
  })

  it("defer-unresolved leaves resolved beats and claims in place", async () => {
    queueTypicalDay({
      beatResolvedAt: new Date("2026-07-11"),
      claimResolvedAt: new Date("2026-07-11"),
    })

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "defer-unresolved",
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))
    // No beat/claim mutations; only the open slot's gap fills, then
    // materialize + CAS.
    expect(recorded.map((entry) => [entry.op, entry.table])).toEqual([
      ["insert", campaignUpdate],
      ["insert", campaignSlot],
      ["update", campaignClock],
    ])
    expect(recorded[0]!.payload).toEqual([
      expect.objectContaining({ slotId: "s-open", primaryId: "c2" }),
    ])
  })

  it("advance on a genuinely complete day writes only materialize + CAS", async () => {
    queueTypicalDay({
      beatResolvedAt: new Date("2026-07-11"),
      claimResolvedAt: new Date("2026-07-11"),
    })
    // The open slot's one roster gap is filled — the day is truly done.
    selectQueues.set(campaignUpdate, [
      [
        { slotId: "s-open", primaryId: "c1" },
        { slotId: "s-open", primaryId: "c2" },
      ],
    ])

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "advance",
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))
    expect(recorded.map((entry) => [entry.op, entry.table])).toEqual([
      ["insert", campaignSlot],
      ["update", campaignClock],
    ])
  })

  it("advance refuses an unresolved beat or claim as not-ready, writing nothing", async () => {
    queueTypicalDay({ beatResolvedAt: null, claimResolvedAt: null })

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "advance",
      expectedVersion: 7,
    })

    expect(result).toEqual(err("not-ready"))
    expect(recorded).toEqual([])
  })

  it("advance refuses a missing downtime entry as not-ready (the recount, not the client cue, decides)", async () => {
    queueTypicalDay({
      beatResolvedAt: new Date("2026-07-11"),
      claimResolvedAt: new Date("2026-07-11"),
    })
    // queueTypicalDay leaves c2 without an entry on the open slot.

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "advance",
      expectedVersion: 7,
    })

    expect(result).toEqual(err("not-ready"))
    expect(recorded).toEqual([])
  })

  it("a stale version pre-check writes nothing", async () => {
    queue(campaignClock, CLOCK)

    const result = await endDay({
      campaignId: CAMPAIGN,
      mode: "resolve-all",
      expectedVersion: 6,
    })

    expect(result).toEqual(err("stale"))
    expect(recorded).toEqual([])
  })
})

describe("advanceClock — the deadline gate + montage pass", () => {
  it("refuses deadline-due while an unresolved deadline sits at or before the landing day, writing nothing", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignArticle, [{ id: "a1" }]) // an unresolved deadline ≤ newDay
    queue(campaignUpdate, []) // no ⚑ marker binds it

    const result = await advanceClock({
      campaignId: CAMPAIGN,
      days: 3,
      expectedVersion: 7,
    })

    expect(result).toEqual(err("deadline-due"))
    expect(recorded).toEqual([])
  })

  it("advances past a deadline once a marker resolves it", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignArticle, [{ id: "a1" }])
    queue(campaignUpdate, [{ articleId: "a1" }]) // resolved
    queue(campaignSlot, []) // daysWithSlots: nothing materialized yet

    const result = await advanceClock({
      campaignId: CAMPAIGN,
      days: 1,
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))
    expect(recorded.map((entry) => [entry.op, entry.table])).toEqual([
      ["insert", campaignSlot],
      ["update", campaignClock],
    ])
  })

  it("inserts montage entries unslotted on the landing day", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignArticle, []) // no deadlines
    queue(campaignSlot, [])
    queue(playerCharacter, [{ characterId: "c1" }, { characterId: "c2" }])

    const result = await advanceClock({
      campaignId: CAMPAIGN,
      days: 5,
      expectedVersion: 7,
      montage: [
        {
          characterId: "c1",
          body: "Walked the coast road.",
          category: "practical",
        },
        {
          characterId: "c2",
          body: "Trained with Maren.",
          category: "collaborator",
        },
      ],
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))
    const montageInsert = recorded.find(
      (entry) => entry.op === "insert" && entry.table === campaignUpdate
    )
    expect(montageInsert!.payload).toEqual([
      {
        campaignId: CAMPAIGN,
        day: 10,
        primaryKind: "character",
        primaryId: "c1",
        body: "Walked the coast road.",
        category: "practical",
        slotId: null,
      },
      {
        campaignId: CAMPAIGN,
        day: 10,
        primaryKind: "character",
        primaryId: "c2",
        body: "Trained with Maren.",
        category: "collaborator",
        slotId: null,
      },
    ])
    // CAS stays last.
    expect(recorded.at(-1)).toMatchObject({
      op: "update",
      table: campaignClock,
    })
  })

  it("refuses a montage entry for a character outside the placed roster", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignArticle, [])
    queue(campaignSlot, [])
    queue(playerCharacter, [{ characterId: "c1" }])

    const result = await advanceClock({
      campaignId: CAMPAIGN,
      days: 2,
      expectedVersion: 7,
      montage: [{ characterId: "c9", body: "x", category: "practical" }],
    })

    expect(result).toEqual(err("montage-character-invalid"))
    expect(
      recorded.some(
        (entry) => entry.op === "insert" && entry.table === campaignUpdate
      )
    ).toBe(false)
    expect(
      recorded.some(
        (entry) => entry.op === "update" && entry.table === campaignClock
      )
    ).toBe(false)
  })

  it("a plain advance with no dated articles never reads markers", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignArticle, [])
    queue(campaignSlot, [])
    // No campaignUpdate queue: hasBlockingDeadline must short-circuit.

    const result = await advanceClock({
      campaignId: CAMPAIGN,
      days: 1,
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))
  })
})

describe("endDay — the deadline gate", () => {
  it("refuses deadline-due before any bulk mutation, in every mode", async () => {
    for (const mode of [
      "advance",
      "resolve-all",
      "defer-unresolved",
    ] as const) {
      recorded = []
      selectQueues = new Map()
      queue(campaignClock, CLOCK)
      queue(campaignArticle, [{ id: "a1" }])
      queue(campaignUpdate, [])

      const result = await endDay({
        campaignId: CAMPAIGN,
        mode,
        expectedVersion: 7,
      })

      expect(result).toEqual(err("deadline-due"))
      expect(recorded).toEqual([])
    }
  })
})

describe("unAdvanceClock — the ⚑ unbind", () => {
  it("unbinds markers after the restored day, then CAS", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignSlot, [{ day: 4 }]) // day 4 is materialized

    const result = await unAdvanceClock({
      campaignId: CAMPAIGN,
      expectedVersion: 7,
    })

    expect(result).toEqual(ok({ currentDay: 6, clockVersion: 8 }))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignUpdate,
        payload: { resolvesArticleId: null },
      },
      expect.objectContaining({ op: "update", table: campaignClock }),
    ])
  })

  it("at-floor writes nothing — no unbind on a refused un-advance", async () => {
    queue(campaignClock, CLOCK)
    queue(campaignSlot, []) // day 4 never materialized

    const result = await unAdvanceClock({
      campaignId: CAMPAIGN,
      expectedVersion: 7,
    })

    expect(result).toEqual(err("at-floor"))
    expect(recorded).toEqual([])
  })
})
