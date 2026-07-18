"use server"

import { revalidatePath } from "next/cache"

import {
  createDungeonState,
  emptyMapInstance,
  type DungeonState,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import type { RegionRow } from "@/lib/db/schema/region"
import { createDungeon } from "@/lib/db/writes/dungeon"
import { insertMapInstance } from "@/lib/db/writes/map-instance"
import { campaignRegionPath } from "@/lib/paths"

import {
  CreateExpeditionSchema,
  type CreateExpeditionError,
  type CreateExpeditionInput,
} from "./expedition-create.schema"

/**
 * Mints a fresh `draft` **expedition** for a Region (UNN-589 D5/D8) and returns
 * its public `shortId` so the client can redirect to the existing prep screen —
 * the expedition sibling of
 * {@link import("./create").createDungeonAction}, differing in exactly two
 * stamps: `regionId` on the dungeon row (the immutable variant marker the D11
 * sealing discriminates on) and the Region's wandering defaults folded into the
 * initial {@link DungeonState} (D7 — `region.settings` is only the authored
 * default; from here on the dungeon row's `reminderSettings` is the runtime
 * truth, editable per expedition like any delve).
 *
 * The Instance is born **blank** recording `mapId = region.seedMapId`;
 * `startExpeditionAction` snapshots the **live** seed Map at start, which is
 * what makes authored edits arrive next expedition automatically. Two rows in
 * one transaction, exactly like the plain mint.
 *
 * Auth: `requireCampaignDM` over the Region's campaign. No seed-Map/Set
 * ownership re-check here — `region/create` proved both at designation time and
 * the restrict FKs keep the rows alive. An archived Region refuses: archive
 * hides the Region from discovery, and minting new runs from a hidden Region
 * would resurrect it.
 */
export async function createExpeditionAction(
  input: CreateExpeditionInput
): Promise<Result<{ shortId: string }, CreateExpeditionError>> {
  const parsed = CreateExpeditionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const region = await loadRegionRowById(parsed.data.regionId)
  if (region === null) return err("region-not-found")
  const campaign = await requireCampaignDM(region.campaignId)

  if (region.archivedAt !== null) return err("region-archived")

  const mapInstanceId = crypto.randomUUID()
  const { shortId } = await db.transaction(async (tx) => {
    await insertMapInstance(
      tx,
      mapInstanceId,
      emptyMapInstance(),
      region.seedMapId
    )
    return createDungeon(
      {
        campaignId: region.campaignId,
        name: parsed.data.name,
        mapInstanceId,
        regionId: region.id,
        state: expeditionDungeonState(region),
      },
      tx
    )
  })

  // The client redirects to the new expedition's prep console; the Region
  // detail's history list gains a row for back-navigation.
  revalidatePath(campaignRegionPath(campaign.shortId, region.shortId))
  return ok({ shortId })
}

/** The initial delve state with the Region's wandering defaults stamped in
 *  (D7): the check fires only when the Region designates a table, on the
 *  Region's authored cadence (falling back to the delve default). */
function expeditionDungeonState(region: RegionRow): DungeonState {
  const base = createDungeonState()
  const { wanderingTableKey, wanderingIntervalTurns } = region.settings
  return {
    ...base,
    reminderSettings: {
      ...base.reminderSettings,
      randomEncounters: {
        enabled: wanderingTableKey !== undefined,
        intervalTurns:
          wanderingIntervalTurns ??
          base.reminderSettings.randomEncounters.intervalTurns,
      },
    },
  }
}
