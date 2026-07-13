import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

// A minimal fake of the drizzle call chains these writes use, recording each
// statement so the tests can pin *what ran, against which table, in what
// order, and inside the transaction*. As in `guard-many.test.ts`, the only
// transaction behavior that matters is: the callback runs, and a throw inside
// it rolls back + propagates — `rolledBack` records the throw.
type RecordedCall = {
  op: "insert" | "update" | "delete"
  table: unknown
  payload?: unknown
  inTx: boolean
}

let calls: RecordedCall[]
let rolledBack: boolean
let inTx = false
let npcInsertError: Error | null
let npcUpdateRows: unknown[]
let articleUpdateRows: unknown[]
let selectQueues: Map<unknown, unknown[][]>

const ENTITY_ID = "entity-1"
const SHORT_ID = "shortid1"

function thenable(reject?: Error | null) {
  return {
    returning: async () => [{ id: ENTITY_ID, entityId: ENTITY_ID }],
    then: (resolve: (v: unknown) => void, rej: (e: unknown) => void) =>
      reject ? rej(reject) : resolve(undefined),
  }
}

function nextRows(table: unknown): unknown[] {
  const queue = selectQueues.get(table)
  if (!queue || queue.length === 0) return []
  return queue.shift()!
}

function makeExecutor() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(nextRows(table)),
        innerJoin: () => ({
          where: () => Promise.resolve(nextRows(table)),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (payload: unknown) => {
        calls.push({ op: "insert", table, payload, inTx })
        const isSubtype = table === schema.campaignNpc
        return thenable(isSubtype ? npcInsertError : null)
      },
    }),
    update: (table: unknown) => ({
      set: (payload: unknown) => ({
        where: () => {
          calls.push({ op: "update", table, payload, inTx })
          const rows =
            table === schema.campaignNpc
              ? npcUpdateRows
              : table === schema.campaignArticle
                ? articleUpdateRows
                : [{}]
          return {
            returning: async () => rows,
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        calls.push({ op: "delete", table, inTx })
        return thenable(null)
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      inTx = true
      try {
        return await run(makeExecutor())
      } catch (error) {
        rolledBack = true
        throw error
      } finally {
        inTx = false
      }
    },
  }
}

vi.mock("@/lib/db/client", () => ({
  get db() {
    return makeExecutor()
  },
}))
vi.mock("@/lib/db/short-id", () => ({
  insertWithShortId: (insert: (candidate: string) => Promise<unknown>) =>
    insert(SHORT_ID),
}))

const schema = await import("@/lib/db/schema/campaign-world")
const entitySchema = await import("@/lib/db/schema/entity")
const updatesSchema = await import("@/lib/db/schema/campaign-updates")
const {
  casNpcBondTier,
  clearArticleDate,
  mintArticle,
  mintNpc,
  setArticleDate,
  setNpcLineage,
  softDeleteArticle,
  softDeleteNpc,
} = await import("./campaign-world")

function queue(table: unknown, ...responses: unknown[][]) {
  selectQueues.set(table, [...(selectQueues.get(table) ?? []), ...responses])
}

beforeEach(() => {
  calls = []
  rolledBack = false
  npcInsertError = null
  npcUpdateRows = [{ entityId: ENTITY_ID }]
  articleUpdateRows = [{ id: "article-1" }]
  selectQueues = new Map()
})

describe("mintNpc", () => {
  it("dual-mints the entity substrate and the subtype in one transaction, sharing the id", async () => {
    const minted = await mintNpc({ campaignId: "camp-1", name: "Maren" })

    expect(minted).toEqual({ entityId: ENTITY_ID, shortId: SHORT_ID })
    expect(calls).toEqual([
      {
        op: "insert",
        table: entitySchema.entity,
        payload: { shortId: SHORT_ID, name: "Maren" },
        inTx: true,
      },
      {
        op: "insert",
        table: schema.campaignNpc,
        payload: { entityId: ENTITY_ID, campaignId: "camp-1" },
        inTx: true,
      },
    ])
  })

  it("mints no components — a fresh NPC is a stub by construction", async () => {
    await mintNpc({ campaignId: "camp-1", name: "Maren" })

    expect(Object.keys(calls[0]!.payload as object)).toEqual([
      "shortId",
      "name",
    ])
  })

  it("rolls the entity insert back when the subtype insert fails (one-subtype invariant)", async () => {
    npcInsertError = new Error("unique violation")

    await expect(mintNpc({ campaignId: "camp-1", name: "Maren" })).rejects.toBe(
      npcInsertError
    )
    expect(rolledBack).toBe(true)
  })
})

describe("mintArticle", () => {
  it("inserts a plain article row with a null default type", async () => {
    const minted = await mintArticle({ campaignId: "camp-1", name: "Saltmere" })

    expect(minted).toMatchObject({ id: ENTITY_ID })
    expect(calls[0]).toMatchObject({
      op: "insert",
      table: schema.campaignArticle,
      payload: { campaignId: "camp-1", name: "Saltmere", type: null },
    })
  })
})

describe("softDeleteNpc", () => {
  it("clears the traits and tombstones the entity in one transaction", async () => {
    const result = await softDeleteNpc({
      campaignId: "camp-1",
      entityId: ENTITY_ID,
    })

    expect(result).toEqual(ok(undefined))
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({
      op: "update",
      table: schema.campaignNpc,
      payload: { arcana: null, lineageKey: null },
      inTx: true,
    })
    expect(calls[1]!.table).toBe(entitySchema.entity)
    expect(calls[1]!.inTx).toBe(true)
    expect(
      (calls[1]!.payload as { deletedAt: unknown }).deletedAt
    ).toBeInstanceOf(Date)
    // Touching relations hard-delete in the same transaction (D4 — UNN-579).
    expect(calls[2]).toMatchObject({
      op: "delete",
      table: schema.campaignRelation,
      inTx: true,
    })
  })

  it("errs on a zero-row subtype match and never touches the entity (write boundary)", async () => {
    npcUpdateRows = []

    const result = await softDeleteNpc({
      campaignId: "other-campaign",
      entityId: ENTITY_ID,
    })

    expect(result).toEqual(err("npc-not-found"))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.table).toBe(schema.campaignNpc)
  })
})

describe("setNpcLineage", () => {
  it("refuses a tombstoned NPC — a stale page must not lock a Lineage onto a hidden row", async () => {
    // liveNpcInCampaign's subtype⋈entity read: row exists but is tombstoned.
    queue(schema.campaignNpc, [{ entityId: ENTITY_ID, deletedAt: new Date() }])

    const result = await setNpcLineage({
      campaignId: "camp-1",
      entityId: ENTITY_ID,
      lineageKey: "warlock",
    })

    expect(result).toEqual(err("npc-not-found"))
    expect(calls).toHaveLength(0)
  })
})

describe("casNpcBondTier", () => {
  it("sets the tier and stamps bondTierChangedAt in one guarded update", async () => {
    queue(schema.campaignNpc, [{ entityId: ENTITY_ID, deletedAt: null }])

    const result = await casNpcBondTier({
      campaignId: "camp-1",
      entityId: ENTITY_ID,
      expectedTier: 1,
      tier: 2,
    })

    expect(result).toEqual(ok(undefined))
    expect(calls).toHaveLength(1)
    const update = calls[0]!
    expect(update).toMatchObject({ op: "update", table: schema.campaignNpc })
    expect(update.payload).toMatchObject({ bondTier: 2 })
    // DB now(), not app time: the cutoff is compared against DB-generated
    // authoredAt stamps, so both must come from the same clock.
    expect(
      (update.payload as { bondTierChangedAt: unknown }).bondTierChangedAt
    ).toEqual(sql`now()`)
  })

  it("reports stale on a zero-row CAS miss (double-confirm cannot jump two tiers)", async () => {
    queue(schema.campaignNpc, [{ entityId: ENTITY_ID, deletedAt: null }])
    npcUpdateRows = []

    const result = await casNpcBondTier({
      campaignId: "camp-1",
      entityId: ENTITY_ID,
      expectedTier: 1,
      tier: 2,
    })

    expect(result).toEqual(err("stale"))
  })

  it("refuses a tombstoned NPC before writing", async () => {
    queue(schema.campaignNpc, [{ entityId: ENTITY_ID, deletedAt: new Date() }])

    const result = await casNpcBondTier({
      campaignId: "camp-1",
      entityId: ENTITY_ID,
      expectedTier: 0,
      tier: 1,
    })

    expect(result).toEqual(err("npc-not-found"))
    expect(calls).toHaveLength(0)
  })
})

describe("softDeleteArticle", () => {
  it("tombstones a scoped article", async () => {
    const result = await softDeleteArticle({
      campaignId: "camp-1",
      articleId: "article-1",
    })

    expect(result).toEqual(ok(undefined))
    expect(
      (calls[0]!.payload as { deletedAt: unknown }).deletedAt
    ).toBeInstanceOf(Date)
    // Touching relations hard-delete in the same transaction (D4 — UNN-579).
    expect(calls[1]).toMatchObject({
      op: "delete",
      table: schema.campaignRelation,
      inTx: true,
    })
  })

  it("errs on a zero-row match (missing or cross-campaign id)", async () => {
    articleUpdateRows = []

    const result = await softDeleteArticle({
      campaignId: "camp-1",
      articleId: "forged",
    })

    expect(result).toEqual(err("article-not-found"))
  })
})

describe("setArticleDate / clearArticleDate", () => {
  const LIVE_ARTICLE = [{ id: "article-1", deletedAt: null }]

  it("sets the dated facet on a live, unresolved article", async () => {
    queue(schema.campaignArticle, LIVE_ARTICLE)
    queue(updatesSchema.campaignUpdate, [])

    const result = await setArticleDate({
      campaignId: "camp-1",
      articleId: "article-1",
      day: 17,
      kind: "deadline",
    })

    expect(result).toEqual(ok(undefined))
    expect(calls).toEqual([
      {
        op: "update",
        table: schema.campaignArticle,
        payload: { datedDay: 17, datedKind: "deadline" },
        inTx: true,
      },
    ])
  })

  it("clears both facet columns together (the set-together CHECK)", async () => {
    queue(schema.campaignArticle, LIVE_ARTICLE)
    queue(updatesSchema.campaignUpdate, [])

    const result = await clearArticleDate({
      campaignId: "camp-1",
      articleId: "article-1",
    })

    expect(result).toEqual(ok(undefined))
    expect(calls[0]!.payload).toEqual({ datedDay: null, datedKind: null })
  })

  it("refuses a resolved article — unbind first (D5's re-dating guard)", async () => {
    queue(schema.campaignArticle, LIVE_ARTICLE)
    queue(updatesSchema.campaignUpdate, [[{ id: "marker-1" }]].flat())

    const result = await setArticleDate({
      campaignId: "camp-1",
      articleId: "article-1",
      day: 20,
      kind: "deadline",
    })

    expect(result).toEqual(err("article-resolved"))
    expect(calls).toEqual([])
  })

  it("treats a tombstoned article as not found", async () => {
    queue(schema.campaignArticle, [
      { id: "article-1", deletedAt: new Date("2026-07-01") },
    ])

    const result = await setArticleDate({
      campaignId: "camp-1",
      articleId: "article-1",
      day: 17,
      kind: "event",
    })

    expect(result).toEqual(err("article-not-found"))
    expect(calls).toEqual([])
  })

  it("treats a zero-row match (cross-campaign or missing) as not found", async () => {
    queue(schema.campaignArticle, [])

    const result = await clearArticleDate({
      campaignId: "camp-1",
      articleId: "forged",
    })

    expect(result).toEqual(err("article-not-found"))
    expect(calls).toEqual([])
  })
})
