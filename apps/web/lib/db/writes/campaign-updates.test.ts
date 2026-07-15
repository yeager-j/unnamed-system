import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import { campaignClock, campaignSlot } from "@/lib/db/schema/campaign-clock"
import {
  campaignUpdate,
  campaignUpdateConcern,
} from "@/lib/db/schema/campaign-updates"
import { campaignArticle } from "@/lib/db/schema/campaign-world"
import {
  bindDeadlineMarker,
  deleteActivity,
  editActivity,
  recordActivity,
  redateUpdate,
  reopenDeadline,
  resolveDeadline,
} from "@/lib/db/writes/campaign-updates"

/**
 * Pins the update-stream write guards with the same fake-executor pattern as
 * `campaign-notes.test.ts`: the current-day recording guard (D1's stale-tab
 * neutralizer), the server-derived `day`, the copy fan-out's skip semantics,
 * and the `"already-recorded"` unique-violation mapping.
 */

type Recorded = {
  op: "insert" | "update" | "delete"
  table: unknown
  payload?: unknown
}

let recorded: Recorded[]
let selectQueues: Map<unknown, unknown[][]>
let conflictInsertsToSkip: number
let insertError: Error | null
let updateError: Error | null
let insertCounter: number
let updateReturnRows: unknown[]

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
    insert: (table: unknown) => {
      const finish = (skippable: boolean) => ({
        returning: async () => {
          if (insertError && !skippable) throw insertError
          const skipped = skippable && conflictInsertsToSkip-- > 0
          return skipped ? [] : [{ id: `insert-${insertCounter++}` }]
        },
        then: (resolve: (v: unknown) => void) => resolve(undefined),
      })
      return {
        values: (payload: unknown) => {
          recorded.push({ op: "insert", table, payload })
          return {
            ...finish(false),
            onConflictDoNothing: () => finish(true),
          }
        },
      }
    },
    update: (table: unknown) => ({
      set: (payload: unknown) => ({
        where: () => {
          recorded.push({ op: "update", table, payload })
          return {
            returning: async () => {
              if (updateError) throw updateError
              return updateReturnRows
            },
            then: (
              resolve: (v: unknown) => void,
              reject?: (e: unknown) => void
            ) => {
              if (updateError && reject) return reject(updateError)
              return resolve(undefined)
            },
          }
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
  conflictInsertsToSkip = 0
  insertError = null
  updateError = null
  insertCounter = 0
  updateReturnRows = []
})

describe("recordActivity", () => {
  it("derives day from the slot and inserts the row + concerns", async () => {
    queue(campaignClock, [{ currentDay: 4 }])
    queue(campaignSlot, [{ day: 4 }])

    const result = await recordActivity({
      campaignId: CAMPAIGN,
      slotId: "s1",
      characterId: "c1",
      body: "Trained at the mill.",
      category: "collaborator",
      concerns: [{ kind: "npc", id: "n1" }],
      alsoCharacterIds: [],
    })

    expect(result).toEqual(
      ok({ updateId: "insert-0", skippedCharacterIds: [] })
    )
    expect(recorded[0]).toMatchObject({
      table: campaignUpdate,
      payload: expect.objectContaining({
        day: 4,
        primaryKind: "character",
        primaryId: "c1",
        slotId: "s1",
      }),
    })
    expect(recorded[1]).toMatchObject({
      table: campaignUpdateConcern,
      payload: [
        { updateId: "insert-0", participantKind: "npc", participantId: "n1" },
      ],
    })
  })

  it("rejects a slot that isn't today (stale tab after an advance)", async () => {
    queue(campaignClock, [{ currentDay: 5 }])
    queue(campaignSlot, [{ day: 4 }])

    const result = await recordActivity({
      campaignId: CAMPAIGN,
      slotId: "s1",
      characterId: "c1",
      body: "x",
      category: "practical",
      concerns: [],
      alsoCharacterIds: [],
    })

    expect(result).toEqual(err("not-current-day"))
    expect(recorded).toEqual([])
  })

  it("fans copies out, skipping already-recorded characters and the primary", async () => {
    queue(campaignClock, [{ currentDay: 4 }])
    queue(campaignSlot, [{ day: 4 }])
    conflictInsertsToSkip = 1 // the first copy target already recorded

    const result = await recordActivity({
      campaignId: CAMPAIGN,
      slotId: "s1",
      characterId: "c1",
      body: "Foraged the fens.",
      category: "practical",
      concerns: [],
      alsoCharacterIds: ["c2", "c3", "c1", "c2"],
    })

    expect(result).toEqual(
      ok({ updateId: "insert-0", skippedCharacterIds: ["c2"] })
    )
    const updateInserts = recorded.filter(
      (call) => call.op === "insert" && call.table === campaignUpdate
    )
    expect(
      updateInserts.map(
        (call) => (call.payload as { primaryId: string }).primaryId
      )
    ).toEqual(["c1", "c2", "c3"])
  })

  it("maps the (slot, primary) unique violation to already-recorded", async () => {
    queue(campaignClock, [{ currentDay: 4 }])
    queue(campaignSlot, [{ day: 4 }])
    insertError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "campaignUpdate_slot_primary_unique",
    })

    const result = await recordActivity({
      campaignId: CAMPAIGN,
      slotId: "s1",
      characterId: "c1",
      body: "x",
      category: "practical",
      concerns: [],
      alsoCharacterIds: [],
    })

    expect(result).toEqual(err("already-recorded"))
  })
})

describe("deleteActivity", () => {
  it("guards a slotted row on the current day", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: "s1" }])
    queue(campaignClock, [{ currentDay: 6 }])
    queue(campaignSlot, [{ day: 5 }])

    const result = await deleteActivity({
      campaignId: CAMPAIGN,
      updateId: "u1",
    })

    expect(result).toEqual(err("not-current-day"))
    expect(recorded).toEqual([])
  })

  it("rejects a cross-campaign update as not found", async () => {
    queue(campaignUpdate, [])

    const result = await deleteActivity({
      campaignId: CAMPAIGN,
      updateId: "foreign",
    })

    expect(result).toEqual(err("update-not-found"))
  })
})

describe("resolveDeadline", () => {
  const DEADLINE_ARTICLE = [
    { name: "Siege of Saltmere", datedKind: "deadline", deletedAt: null },
  ]

  it("inserts the ⚑ marker as a world update stamped on the current day", async () => {
    queue(campaignClock, [{ currentDay: 14 }])
    queue(campaignArticle, DEADLINE_ARTICLE)

    const result = await resolveDeadline({
      campaignId: CAMPAIGN,
      articleId: "a1",
      body: "The party broke the siege at dawn.",
    })

    expect(result).toEqual(ok({ updateId: "insert-0" }))
    expect(recorded).toEqual([
      {
        op: "insert",
        table: campaignUpdate,
        payload: {
          campaignId: CAMPAIGN,
          day: 14,
          primaryKind: "article",
          primaryId: "a1",
          body: "The party broke the siege at dawn.",
          slotId: null,
          resolvesArticleId: "a1",
        },
      },
    ])
  })

  it("defaults a blank body to the outcome-neutral resolution line", async () => {
    queue(campaignClock, [{ currentDay: 14 }])
    queue(campaignArticle, DEADLINE_ARTICLE)

    await resolveDeadline({ campaignId: CAMPAIGN, articleId: "a1", body: "  " })

    expect((recorded[0]!.payload as { body: string }).body).toBe(
      "Resolved — Siege of Saltmere"
    )
  })

  it("treats a lost double-resolve race as idempotent success (the partial unique)", async () => {
    queue(campaignClock, [{ currentDay: 14 }])
    queue(campaignArticle, DEADLINE_ARTICLE)
    conflictInsertsToSkip = 1

    const result = await resolveDeadline({
      campaignId: CAMPAIGN,
      articleId: "a1",
      body: "",
    })

    expect(result).toEqual(ok({ updateId: null }))
  })

  it("refuses an event or undated article", async () => {
    queue(campaignClock, [{ currentDay: 14 }])
    // Events are inline-undated (UNN-627: they live in campaignEventPlacement),
    // so a non-deadline article reads datedKind = null here.
    queue(campaignArticle, [
      { name: "Tidewake Festival", datedKind: null, deletedAt: null },
    ])

    const result = await resolveDeadline({
      campaignId: CAMPAIGN,
      articleId: "a1",
      body: "",
    })

    expect(result).toEqual(err("not-a-deadline"))
    expect(recorded).toEqual([])
  })

  it("treats a tombstoned or cross-campaign article as not found", async () => {
    queue(campaignClock, [{ currentDay: 14 }])
    queue(campaignArticle, [])

    const result = await resolveDeadline({
      campaignId: CAMPAIGN,
      articleId: "forged",
      body: "",
    })

    expect(result).toEqual(err("article-not-found"))
    expect(recorded).toEqual([])
  })
})

describe("redateUpdate", () => {
  it("re-dates a slotted row by detaching it (slotId cleared, category kept)", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: "s1", resolvesArticleId: null }])
    queue(campaignClock, [{ currentDay: 14 }])

    const result = await redateUpdate({
      campaignId: CAMPAIGN,
      updateId: "u1",
      day: 9,
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignUpdate,
        payload: { day: 9, slotId: null },
      },
    ])
  })

  it("refuses while the row is a ⚑ marker (unbind first — the D5 bind)", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: "a1" }])

    const result = await redateUpdate({
      campaignId: CAMPAIGN,
      updateId: "u1",
      day: 9,
    })

    expect(result).toEqual(err("update-resolves-deadline"))
    expect(recorded).toEqual([])
  })

  it("refuses a future day — the Chronicle is the past", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: null }])
    queue(campaignClock, [{ currentDay: 14 }])

    const result = await redateUpdate({
      campaignId: CAMPAIGN,
      updateId: "u1",
      day: 15,
    })

    expect(result).toEqual(err("future-day"))
    expect(recorded).toEqual([])
  })

  it("rejects a cross-campaign update as not found", async () => {
    queue(campaignUpdate, [])

    const result = await redateUpdate({
      campaignId: CAMPAIGN,
      updateId: "foreign",
      day: 3,
    })

    expect(result).toEqual(err("update-not-found"))
  })
})

describe("bindDeadlineMarker", () => {
  const LIVE_DEADLINE = [{ datedKind: "deadline", deletedAt: null }]

  it("binds a world update as the article's ⚑ marker", async () => {
    queue(
      campaignUpdate,
      [{ id: "u1", slotId: null, resolvesArticleId: null }],
      [] // existing-marker pre-check: none
    )
    queue(campaignArticle, LIVE_DEADLINE)

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignUpdate,
        payload: { resolvesArticleId: "a1" },
      },
    ])
  })

  it("is idempotent when the row already resolves this article", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: "a1" }])

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([])
  })

  it("refuses a row that already marks a different article", async () => {
    queue(campaignUpdate, [
      { id: "u1", slotId: null, resolvesArticleId: "other" },
    ])

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(err("update-already-marker"))
  })

  it("refuses a slotted row (marker_is_world — re-date/detach first)", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: "s1", resolvesArticleId: null }])

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(err("update-is-slotted"))
  })

  it("refuses when another update already resolves the article", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: null }])
    queue(campaignArticle, LIVE_DEADLINE)
    queue(campaignUpdate, [{ id: "marker" }])

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(err("already-resolved"))
  })

  it("refuses an event or undated article", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: null }])
    // Events are inline-undated (UNN-627); a non-deadline reads datedKind = null.
    queue(campaignArticle, [{ datedKind: null, deletedAt: null }])

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(err("not-a-deadline"))
  })

  it("maps the concurrent double-bind's unique violation to already-resolved", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: null }])
    queue(campaignArticle, LIVE_DEADLINE)
    queue(campaignUpdate, [])
    updateError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "campaignUpdate_resolvesArticle_unique",
    })

    const result = await bindDeadlineMarker({
      campaignId: CAMPAIGN,
      articleId: "a1",
      updateId: "u1",
    })

    expect(result).toEqual(err("already-resolved"))
  })
})

describe("marker delete/edit semantics (D5: resolution is derived)", () => {
  it("deletes a ⚑ marker with no guard — deleting the marker IS re-opening", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: "a1" }])

    const result = await deleteActivity({
      campaignId: CAMPAIGN,
      updateId: "u1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([{ op: "delete", table: campaignUpdate }])
  })

  it("editing a marker's content keeps the bind (patch never touches resolvesArticleId)", async () => {
    queue(campaignUpdate, [{ id: "u1", slotId: null, resolvesArticleId: "a1" }])

    const result = await editActivity({
      campaignId: CAMPAIGN,
      updateId: "u1",
      body: "The ritual completed at the eclipse.",
      category: null,
      concerns: [],
    })

    expect(result).toEqual(ok(undefined))
    const patch = recorded.find((call) => call.op === "update")
    expect(patch?.payload).toEqual({
      body: "The ritual completed at the eclipse.",
      category: null,
    })
  })
})

describe("reopenDeadline", () => {
  it("unbinds the marker, keeping the prose row (unbind, never delete)", async () => {
    updateReturnRows = [{ id: "u1" }]

    const result = await reopenDeadline({
      campaignId: CAMPAIGN,
      articleId: "a1",
    })

    expect(result).toEqual(ok(undefined))
    expect(recorded).toEqual([
      {
        op: "update",
        table: campaignUpdate,
        payload: { resolvesArticleId: null },
      },
    ])
  })

  it("errs when no marker binds the article", async () => {
    updateReturnRows = []

    const result = await reopenDeadline({
      campaignId: CAMPAIGN,
      articleId: "a1",
    })

    expect(result).toEqual(err("not-resolved"))
  })
})
