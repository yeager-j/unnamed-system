import { beforeEach, describe, expect, it, vi } from "vitest"

import { emptyMapInstance } from "@workspace/game-v2/spatial"

import { loadMapInstanceAcceptedAction } from "./snapshot"

const loadMapInstanceAccessEnvelope = vi.fn()
const requireCampaignDM = vi.fn()
const registered = vi.fn()
let joinedRows: unknown[] = []

vi.mock("@/lib/db/queries/map-instance-access", () => ({
  loadMapInstanceAccessEnvelope: (id: string) =>
    loadMapInstanceAccessEnvelope(id),
}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => ({
        onConflictDoUpdate: () => {
          registered(row)
          return Promise.resolve()
        },
      }),
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(joinedRows),
        }),
      }),
    }),
  },
}))

const identity = {
  clientGroupId: "map-instance:mi-1",
  clientId: "tab-1",
}
const access = {
  mapInstanceId: "mi-1",
  campaignId: "c-1",
  encounters: [],
  dungeons: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  loadMapInstanceAccessEnvelope.mockResolvedValue(access)
  requireCampaignDM.mockResolvedValue({ id: "c-1" })
  joinedRows = [
    {
      row: {
        id: "mi-1",
        state: emptyMapInstance(),
        status: "open",
        version: 4,
      },
      through: 2,
    },
  ]
})

describe("loadMapInstanceAcceptedAction", () => {
  it("registers the client and returns one accepted aggregate tuple", async () => {
    const result = await loadMapInstanceAcceptedAction({
      mapInstanceId: "mi-1",
      identity,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      value: { state: emptyMapInstance(), status: "open" },
      through: 2,
      cursor: 4,
    })
    expect(registered).toHaveBeenCalledWith({
      ...identity,
      mapInstanceId: "mi-1",
      lastMutationId: 0,
    })
  })

  it("authorizes through the sole owning campaign", async () => {
    await loadMapInstanceAcceptedAction({ mapInstanceId: "mi-1", identity })
    expect(requireCampaignDM).toHaveBeenCalledWith("c-1")
  })

  it("fails before registration when no unique owner exists", async () => {
    loadMapInstanceAccessEnvelope.mockResolvedValue(null)
    expect(
      await loadMapInstanceAcceptedAction({ mapInstanceId: "mi-1", identity })
    ).toEqual({ ok: false, error: "map-instance-not-found" })
    expect(registered).not.toHaveBeenCalled()
  })

  it("rejects malformed persisted state", async () => {
    joinedRows = [
      {
        row: { state: { occupancy: "invalid" }, status: "open", version: 0 },
        through: 0,
      },
    ]
    expect(
      await loadMapInstanceAcceptedAction({ mapInstanceId: "mi-1", identity })
    ).toEqual({ ok: false, error: "invalid-state" })
  })
})
