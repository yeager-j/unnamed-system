import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

// A minimal fake of the drizzle call chains these writes use, recording each
// statement so the tests can pin *what ran, against which table, in what
// order, and inside the transaction*. As in `guard-many.test.ts`, the only
// transaction behavior that matters is: the callback runs, and a throw inside
// it rolls back + propagates — `rolledBack` records the throw.
type RecordedCall = {
  op: "insert" | "update"
  table: unknown
  payload: unknown
  inTx: boolean
}

let calls: RecordedCall[]
let rolledBack: boolean
let inTx = false
let npcInsertError: Error | null
let npcUpdateRows: unknown[]
let articleUpdateRows: unknown[]

const ENTITY_ID = "entity-1"
const SHORT_ID = "shortid1"

function thenable(reject?: Error | null) {
  return {
    returning: async () => [{ id: ENTITY_ID, entityId: ENTITY_ID }],
    then: (resolve: (v: unknown) => void, rej: (e: unknown) => void) =>
      reject ? rej(reject) : resolve(undefined),
  }
}

function makeExecutor() {
  return {
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
const { mintArticle, mintNpc, softDeleteArticle, softDeleteNpc } =
  await import("./campaign-world")

beforeEach(() => {
  calls = []
  rolledBack = false
  npcInsertError = null
  npcUpdateRows = [{ entityId: ENTITY_ID }]
  articleUpdateRows = [{ id: "article-1" }]
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
    expect(calls).toHaveLength(2)
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
