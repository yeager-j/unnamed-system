import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

// Fake the drizzle read chains with per-table row scripts: what the DB would
// have returned for each kind's (already campaign-scoped) lookup. A
// cross-campaign or dangling id is simply a row that never comes back.
let rowsByTable: Map<unknown, unknown[]>

function rowsFor(table: unknown) {
  return rowsByTable.get(table) ?? []
}

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => rowsFor(table),
        innerJoin: () => ({ where: async () => rowsFor(table) }),
      }),
    }),
  },
}))

const { campaignArticle, campaignNpc } =
  await import("@/lib/db/schema/campaign-world")
const { playerCharacter } = await import("@/lib/db/schema/player-character")
const { loadParticipantHits, validateParticipantRefs } =
  await import("./load-participants")

beforeEach(() => {
  rowsByTable = new Map()
})

describe("validateParticipantRefs", () => {
  it("accepts refs that all resolve live", async () => {
    rowsByTable.set(campaignNpc, [{ id: "n1", name: "Maren", deletedAt: null }])
    rowsByTable.set(campaignArticle, [
      { id: "a1", name: "Saltmere", deletedAt: null },
    ])

    const result = await validateParticipantRefs("camp-1", [
      { kind: "npc", id: "n1" },
      { kind: "article", id: "a1" },
    ])

    expect(result).toEqual(ok(undefined))
  })

  it("rejects a lookup miss — the forged / cross-campaign id case", async () => {
    const result = await validateParticipantRefs("camp-1", [
      { kind: "npc", id: "someone-elses-npc" },
    ])

    expect(result).toEqual(err("invalid-ref"))
  })

  it("rejects a tombstoned target — no new reference may point at one", async () => {
    rowsByTable.set(campaignArticle, [
      { id: "a1", name: "Saltmere", deletedAt: new Date("2026-07-01") },
    ])

    const result = await validateParticipantRefs("camp-1", [
      { kind: "article", id: "a1" },
    ])

    expect(result).toEqual(err("invalid-ref"))
  })
})

describe("loadParticipantHits", () => {
  it("keys hits by kind so an id never crosses kinds, and keeps tombstones (read side)", async () => {
    rowsByTable.set(playerCharacter, [
      { id: "c1", name: "Bram", deletedAt: new Date("2026-07-01") },
    ])

    const hits = await loadParticipantHits("camp-1", [
      { kind: "character", id: "c1" },
      { kind: "npc", id: "c1" },
    ])

    expect(hits.character.get("c1")).toEqual({
      name: "Bram",
      deletedAt: new Date("2026-07-01"),
    })
    expect(hits.npc.get("c1")).toBeUndefined()
  })

  it("skips the query entirely for kinds with no refs", async () => {
    const hits = await loadParticipantHits("camp-1", [])

    expect(hits.article.size).toBe(0)
    expect(hits.npc.size).toBe(0)
    expect(hits.character.size).toBe(0)
  })
})
