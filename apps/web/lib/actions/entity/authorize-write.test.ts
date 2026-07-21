import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

// Neutralize `server-only` (pulled transitively via the query/auth graph).
vi.mock("server-only", () => ({}))

const isOwnerOrCampaignDM = vi.fn()
const refuseGatedArchetypeSpend = vi.fn()
const loadPlayerCharacterById = vi.fn()
const forbidden = vi.fn(() => {
  throw new Error("forbidden")
})

vi.mock("next/navigation", () => ({ forbidden: () => forbidden() }))
vi.mock("@/lib/auth/campaign-access", () => ({
  isOwnerOrCampaignDM: (viewerId: string, pc: unknown, executor: unknown) =>
    isOwnerOrCampaignDM(viewerId, pc, executor),
}))
vi.mock("./archetype-gate", () => ({
  refuseGatedArchetypeSpend: (email: unknown, pc: unknown, write: unknown) =>
    refuseGatedArchetypeSpend(email, pc, write),
}))
vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (id: string) => loadPlayerCharacterById(id),
}))

const {
  authorizeEntityWrite,
  requireEntityWriteAuthorized,
  isEntityWriteAuthRejection,
} = await import("./authorize-write")

const ACTOR = { userId: "owner-1", email: "owner-1@example.com" }
const EXECUTOR = { marker: "executor" }
const pc = (overrides: Record<string, unknown> = {}) =>
  ({ userId: "owner-1", campaignId: null, entity: {}, ...overrides }) as never

const VITALS = { component: "vitals", op: "damage", amount: 1 } as const
const SECRET = {
  component: "narrative",
  op: "setField",
  field: "secrets",
  value: "mine",
} as const

beforeEach(() => {
  vi.clearAllMocks()
  isOwnerOrCampaignDM.mockResolvedValue(true)
  refuseGatedArchetypeSpend.mockResolvedValue(ok(undefined))
})

describe("authorizeEntityWrite — one contextual authorization rule", () => {
  it("gates a vitals-class write owner-or-campaign-DM (the console's HP/SP access)", async () => {
    const result = await authorizeEntityWrite(
      EXECUTOR as never,
      ACTOR,
      pc(),
      VITALS
    )

    expect(result).toEqual(ok(undefined))
    expect(isOwnerOrCampaignDM).toHaveBeenCalledWith("owner-1", pc(), EXECUTOR)
  })

  it("refuses a vitals-class write when neither owner nor campaign DM", async () => {
    isOwnerOrCampaignDM.mockResolvedValue(false)

    const result = await authorizeEntityWrite(
      EXECUTOR as never,
      ACTOR,
      pc(),
      VITALS
    )

    expect(result).toEqual(err("unauthorized"))
  })

  it("gates a non-vitals-class write strict-owner — a DM cannot rewrite identity/narrative", async () => {
    const notOwner = { userId: "dm-1", email: "dm-1@example.com" }

    const result = await authorizeEntityWrite(
      EXECUTOR as never,
      notOwner,
      pc({ userId: "owner-1" }),
      SECRET
    )

    expect(result).toEqual(err("unauthorized"))
    // Strict-owner never consults the DM check.
    expect(isOwnerOrCampaignDM).not.toHaveBeenCalled()
  })

  it("forwards the restricted-Archetype / narrative gate's rejection after ownership", async () => {
    refuseGatedArchetypeSpend.mockResolvedValue(err("archetype-locked"))

    const result = await authorizeEntityWrite(EXECUTOR as never, ACTOR, pc(), {
      component: "archetypes",
      op: "spendArchetypeRank",
      archetypeKey: "elemental-thief",
    })

    expect(result).toEqual(err("archetype-locked"))
    expect(refuseGatedArchetypeSpend).toHaveBeenCalledWith(
      ACTOR.email,
      pc(),
      expect.objectContaining({ op: "spendArchetypeRank" })
    )
  })
})

describe("requireEntityWriteAuthorized — the door's throwing pre-check", () => {
  it("forbids a missing target without authorizing", async () => {
    loadPlayerCharacterById.mockResolvedValue(null)

    await expect(
      requireEntityWriteAuthorized(ACTOR, "e1", VITALS)
    ).rejects.toThrow("forbidden")
    expect(isOwnerOrCampaignDM).not.toHaveBeenCalled()
  })

  it("forbids an unauthorized write", async () => {
    loadPlayerCharacterById.mockResolvedValue(pc())
    isOwnerOrCampaignDM.mockResolvedValue(false)

    await expect(
      requireEntityWriteAuthorized(ACTOR, "e1", VITALS)
    ).rejects.toThrow("forbidden")
  })

  it("passes an authorized write through", async () => {
    loadPlayerCharacterById.mockResolvedValue(pc())

    await expect(
      requireEntityWriteAuthorized(ACTOR, "e1", VITALS)
    ).resolves.toBeUndefined()
    expect(forbidden).not.toHaveBeenCalled()
  })
})

describe("isEntityWriteAuthRejection", () => {
  it("recognizes the authorization refusals a door turns into a 403", () => {
    expect(isEntityWriteAuthRejection("unauthorized")).toBe(true)
    expect(isEntityWriteAuthRejection("archetype-hidden")).toBe(true)
    expect(isEntityWriteAuthRejection("archetype-locked")).toBe(true)
  })

  it("leaves ordinary domain rejections alone", () => {
    expect(isEntityWriteAuthRejection("capability-missing")).toBe(false)
    expect(isEntityWriteAuthRejection("entity-not-found")).toBe(false)
    expect(isEntityWriteAuthRejection("stale")).toBe(false)
  })
})
