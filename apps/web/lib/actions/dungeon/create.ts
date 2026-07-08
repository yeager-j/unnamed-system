"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import {
  createDungeonState,
  emptyMapInstance,
} from "@workspace/game-v2/spatial"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { loadMapByShortId } from "@/lib/db/queries/load-map"
import { createDungeon } from "@/lib/db/writes/dungeon"
import { insertMapInstance } from "@/lib/db/writes/map-instance"

import {
  CreateDungeonSchema,
  type CreateDungeonError,
  type CreateDungeonInput,
} from "./create.schema"

/**
 * Creates a fresh `draft` dungeon inside a campaign and returns its public
 * `shortId` so the client can redirect to the console (`/dungeon/{shortId}`,
 * UNN-462) — mirroring how {@link import("../encounter/create").createEncounterAction}
 * hands back a `shortId`.
 *
 * Selecting a Map mints the dungeon's Map Instance. Per UNN-465 the Instance is
 * born **blank** ({@link emptyMapInstance}) but records `mapId` = the chosen Map,
 * so the link is durable; delve-start snapshots the geometry into it
 * (`mapInstanceFromGeometry`). Create touches **two** rows in
 * one transaction — the Instance (so `dungeon.mapInstanceId` is non-null) and the
 * dungeon referencing it — and the `shortId`-collision retry re-runs the whole
 * closure, so a partial create can't strand an Instance or a dungeon.
 *
 * Auth: `requireCampaignDM` gates the campaign (a non-DM trips `forbidden()` before
 * any write), and the picked Map must be owned by that DM — checked server-side via
 * `map.userId === campaign.dmUserId` (the gate already proved the viewer is the DM),
 * so a forged `mapShortId` for someone else's Map is rejected. No `revalidate` is
 * needed: the new dungeon is reached by the returned redirect.
 */
export async function createDungeonAction(
  input: CreateDungeonInput
): Promise<Result<{ shortId: string }, CreateDungeonError>> {
  const parsed = CreateDungeonSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const map = await loadMapByShortId(parsed.data.mapShortId)
  if (!map || map.userId !== campaign.dmUserId) return err("map-not-found")

  const mapInstanceId = crypto.randomUUID()
  const { shortId } = await db.transaction(async (tx) => {
    await insertMapInstance(tx, mapInstanceId, emptyMapInstance(), map.id)
    return createDungeon(
      {
        campaignId: parsed.data.campaignId,
        name: parsed.data.name,
        mapInstanceId,
        state: createDungeonState(),
      },
      tx
    )
  })

  return ok({ shortId })
}
