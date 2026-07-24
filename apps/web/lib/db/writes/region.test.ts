import { beforeEach, describe, expect, it, vi } from "vitest"

import type { WriteExecutor } from "@/lib/db/client"

const guardedVersionUpdate = vi.fn()

vi.mock("@/lib/db/client", () => ({ db: {} }))
vi.mock("@/lib/db/writes/guarded-update", () => ({
  guardedVersionUpdate: (args: unknown) => guardedVersionUpdate(args),
}))

const { foldRegionKnowledge } = await import("./region")

describe("foldRegionKnowledge", () => {
  beforeEach(() => {
    guardedVersionUpdate.mockReset().mockResolvedValue({
      ok: true,
      value: { version: 8 },
    })
  })

  it("commits both knowledge columns through one guarded Region update", async () => {
    const executor = { kind: "transaction" } as unknown as WriteExecutor
    const knowledge = {
      discoveredSiteKeys: ["castle", "reliquary"],
      staticReveal: {
        "map-1": {
          zoneIds: ["entry"],
          connectionIds: ["entry-hall"],
        },
      },
    }

    await expect(
      foldRegionKnowledge(executor, "region-1", 7, knowledge)
    ).resolves.toEqual({ ok: true, value: { version: 8 } })

    expect(guardedVersionUpdate).toHaveBeenCalledOnce()
    expect(guardedVersionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "region-1",
        expectedVersion: 7,
        executor,
        patch: knowledge,
      })
    )
  })
})
