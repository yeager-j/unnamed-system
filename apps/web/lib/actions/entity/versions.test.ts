import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/game-v2/kernel/result"

import type { EntityRow } from "@/lib/db/schema/entity"

import { getEntityClassVersionAction } from "./versions"

// The action is a gate + a column read; the gates are the seam under test.
const requireEntityOwner = vi.fn()
const requireOwnerOrCampaignDMForEntity = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireEntityOwner: (id: string) => requireEntityOwner(id),
  requireOwnerOrCampaignDMForEntity: (id: string) =>
    requireOwnerOrCampaignDMForEntity(id),
}))

const ROW = {
  identityVersion: 11,
  vitalsVersion: 22,
  inventoryVersion: 33,
  progressionVersion: 44,
} as EntityRow

beforeEach(() => {
  requireEntityOwner.mockReset().mockResolvedValue(ROW)
  requireOwnerOrCampaignDMForEntity.mockReset().mockResolvedValue(ROW)
})

describe("getEntityClassVersionAction — the gate is a fact of the class", () => {
  it("vitals reads through owner-or-campaign-DM (the console's durable retry)", async () => {
    const result = await getEntityClassVersionAction({
      entityId: "char-1",
      versionClass: "vitals",
    })
    expect(result).toEqual(ok({ version: 22 }))
    expect(requireOwnerOrCampaignDMForEntity).toHaveBeenCalledWith("char-1")
    expect(requireEntityOwner).not.toHaveBeenCalled()
  })

  it.each([
    ["identity", 11],
    ["inventory", 33],
    ["progression", 44],
  ] as const)(
    "%s reads through the strict owner gate",
    async (cls, version) => {
      const result = await getEntityClassVersionAction({
        entityId: "char-1",
        versionClass: cls,
      })
      expect(result).toEqual(ok({ version }))
      expect(requireEntityOwner).toHaveBeenCalledWith("char-1")
      expect(requireOwnerOrCampaignDMForEntity).not.toHaveBeenCalled()
    }
  )

  it("rejects an unknown class before any gate runs", async () => {
    const result = await getEntityClassVersionAction({
      entityId: "char-1",
      // @ts-expect-error — the wire is untrusted
      versionClass: "mana",
    })
    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireEntityOwner).not.toHaveBeenCalled()
    expect(requireOwnerOrCampaignDMForEntity).not.toHaveBeenCalled()
  })
})
