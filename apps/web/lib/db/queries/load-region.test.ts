import { describe, expect, it, vi } from "vitest"

import type { WriteExecutor } from "@/lib/db/client"
import type { RegionRow } from "@/lib/db/schema/region"

import { loadRegionRowById } from "./load-region"

vi.mock("@/lib/db/client", () => ({ db: {} }))

const FIXED_DATE = new Date("2026-07-24T00:00:00.000Z")

function executorReturning(row: RegionRow): WriteExecutor {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [row],
        }),
      }),
    }),
  } as unknown as WriteExecutor
}

describe("loadRegionRowById", () => {
  it("parses both knowledge columns and heals defaultable legacy values", async () => {
    const row = {
      id: "region-1",
      shortId: "region-short",
      campaignId: "campaign-1",
      name: "Drakkenheim",
      seedMapId: "map-1",
      templateSetId: "set-1",
      settings: {},
      discoveredSiteKeys: undefined,
      staticReveal: {
        "map-1": {},
      },
      archivedAt: null,
      version: 3,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    } as unknown as RegionRow

    const loaded = await loadRegionRowById(row.id, executorReturning(row))

    expect(loaded).toMatchObject({
      discoveredSiteKeys: [],
      staticReveal: {
        "map-1": {
          zoneIds: [],
          connectionIds: [],
        },
      },
    })
  })
})
