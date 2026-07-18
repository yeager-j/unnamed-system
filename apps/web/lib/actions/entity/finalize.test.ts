import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

const {
  buildFinalizePatch,
  bumpEntityVersionGuarded,
  publishPlayerCharacterLifecyclePing,
  requireEntityOwner,
  update,
  where,
} = vi.hoisted(() => ({
  buildFinalizePatch: vi.fn(),
  bumpEntityVersionGuarded: vi.fn(),
  publishPlayerCharacterLifecyclePing: vi.fn(),
  requireEntityOwner: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
}))

vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "where") }))
vi.mock("@/domain/entity/finalize", () => ({ buildFinalizePatch }))
vi.mock("@/domain/game-engine-v2", () => ({
  getArchetype: vi.fn(),
  startingWeaponForLineage: vi.fn(),
}))
vi.mock("@/domain/game-v2/entity-row-to-bag", () => ({
  loadEntityRow: vi.fn(() => ok({ components: {} })),
}))
vi.mock("@/lib/auth/campaign-access", () => ({ requireEntityOwner }))
vi.mock("@/lib/db/client", () => ({
  db: {
    update,
  },
}))
vi.mock("@/lib/db/schema/player-character", () => ({
  playerCharacter: { entityId: "entityId" },
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishPlayerCharacterLifecyclePing,
}))
vi.mock("./revalidate", () => ({
  revalidateCharacterList: vi.fn(),
  revalidateEntity: vi.fn(),
}))
vi.mock("./version-guard", () => ({ bumpEntityVersionGuarded }))

const { finalizeEntityAction } = await import("./finalize")

beforeEach(() => {
  vi.clearAllMocks()
  requireEntityOwner.mockResolvedValue({
    entity: { id: "entity-1", shortId: "short-1", name: "Ariadne" },
  })
  buildFinalizePatch.mockReturnValue(ok({ identity: { name: "Ariadne" } }))
  bumpEntityVersionGuarded.mockResolvedValue(ok({ version: 8 }))
  where.mockResolvedValue(undefined)
  update.mockReturnValue({
    set: vi.fn(() => ({ where })),
  })
})

describe("finalizeEntityAction lifecycle ping", () => {
  it("publishes finalized status after the subtype update succeeds", async () => {
    await expect(
      finalizeEntityAction({ entityId: "entity-1", expectedVersion: 7 })
    ).resolves.toEqual(ok({ shortId: "short-1", version: 8 }))

    expect(publishPlayerCharacterLifecyclePing).toHaveBeenCalledWith(
      "short-1",
      "finalized",
      { identity: 8 }
    )
    expect(where.mock.invocationCallOrder[0]).toBeLessThan(
      publishPlayerCharacterLifecyclePing.mock.invocationCallOrder[0]!
    )
  })

  it("does not publish lifecycle state when the subtype update fails", async () => {
    where.mockRejectedValueOnce(new Error("database unavailable"))

    await expect(
      finalizeEntityAction({ entityId: "entity-1", expectedVersion: 7 })
    ).rejects.toThrow("database unavailable")
    expect(publishPlayerCharacterLifecyclePing).not.toHaveBeenCalled()
  })
})
