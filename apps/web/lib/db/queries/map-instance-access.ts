import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { dungeons } from "@/lib/db/schema/dungeon"
import { encounters } from "@/lib/db/schema/encounter"

export interface MapInstanceAccessEnvelope {
  readonly mapInstanceId: string
  readonly campaignId: string
  readonly encounters: ReadonlyArray<{ shortId: string }>
  readonly dungeons: ReadonlyArray<{ shortId: string }>
}

/** Resolves every application route that currently owns one Map Instance. */
export async function loadMapInstanceAccessEnvelope(
  mapInstanceId: string
): Promise<MapInstanceAccessEnvelope | null> {
  const [encounterRows, dungeonRows] = await Promise.all([
    db
      .select({
        campaignId: encounters.campaignId,
        shortId: encounters.shortId,
      })
      .from(encounters)
      .where(eq(encounters.mapInstanceId, mapInstanceId)),
    db
      .select({ campaignId: dungeons.campaignId, shortId: dungeons.shortId })
      .from(dungeons)
      .where(eq(dungeons.mapInstanceId, mapInstanceId)),
  ])
  const campaignIds = new Set(
    [...encounterRows, ...dungeonRows].map((row) => row.campaignId)
  )
  if (campaignIds.size !== 1) return null
  const campaignId = [...campaignIds][0]!
  return {
    mapInstanceId,
    campaignId,
    encounters: encounterRows.map(({ shortId }) => ({ shortId })),
    dungeons: dungeonRows.map(({ shortId }) => ({ shortId })),
  }
}
