"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadActiveDungeonForCampaign,
  loadDungeonRowById,
} from "@/lib/db/queries/load-dungeon"
import { setDungeonStatus } from "@/lib/db/writes/dungeon"
import { publishDungeonPing } from "@/lib/realtime/publish"

import { revalidateDungeon } from "./revalidate"
import {
  SetDungeonStatusSchema,
  type SetDungeonStatusError,
  type SetDungeonStatusInput,
} from "./status.schema"

/**
 * Advances a dungeon's lifecycle `status` (`draft` → `active` → `done`) in a single
 * version-guarded write — the exploration-time peer of
 * {@link import("../encounter/end").endEncounterAction} plus the `startCombat`
 * status flip.
 *
 * Enforces **one active delve per campaign** server-side (UNN-465 AC), mirroring the
 * one-live-encounter guard ({@link import("../encounter/events").applyCombatEvent}):
 * a `draft → active` transition is rejected when another delve in the same campaign
 * already holds the active slot. (`active → done` has no such guard.)
 *
 * Flow mirrors the encounter writes: load the dungeon row, authorize the caller
 * against its campaign (`requireCampaignDM` trips `forbidden()` for a non-DM), run
 * the guard, flip the status guarded on `expectedVersion`, then revalidate the
 * campaign overview (its dungeons list + live-delve banner) **and** the DM console
 * route (UNN-464). The `draft → active` start is normally driven by
 * {@link import("./delve-start").startDelveAction} (which also snapshots geometry +
 * places tokens); this action backs the `active → done` finish and the
 * server-enforced one-active-delve guard.
 */
export async function setDungeonStatusAction(
  input: SetDungeonStatusInput
): Promise<Result<{ version: number }, SetDungeonStatusError>> {
  const parsed = SetDungeonStatusSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, status, expectedVersion } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  const campaign = await requireCampaignDM(dungeon.campaignId)

  if (status === "active") {
    const active = await loadActiveDungeonForCampaign(dungeon.campaignId)
    if (active && active.id !== dungeonId) {
      return err("campaign-already-has-active-delve")
    }
  }

  const result = await setDungeonStatus(dungeonId, status, expectedVersion)
  if (!result.ok) return result

  publishDungeonPing(dungeon.shortId, { version: result.value.version, status })
  revalidatePath(`/campaigns/${campaign.shortId}`)
  revalidateDungeon(dungeon)

  return ok({ version: result.value.version })
}
