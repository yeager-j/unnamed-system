"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadActiveDungeonForCampaign,
  loadDungeonCampaignId,
} from "@/lib/db/queries/load-dungeon"
import { setDungeonStatus } from "@/lib/db/writes/dungeon"

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
 * Flow mirrors the encounter writes: resolve the owning campaign, authorize the
 * caller against it (`requireCampaignDM` trips `forbidden()` for a non-DM) **before**
 * the heavy read, run the guard, flip the status guarded on `expectedVersion`, then
 * revalidate the campaign overview (so its dungeons list + live-delve banner refresh).
 * This action has no UI caller yet — the console button that drives it lands in
 * UNN-464 — but it is the AC's server-enforced deliverable. (Revalidating the console
 * route, which is keyed by `shortId`, rides that ticket alongside the button.)
 */
export async function setDungeonStatusAction(
  input: SetDungeonStatusInput
): Promise<Result<{ version: number }, SetDungeonStatusError>> {
  const parsed = SetDungeonStatusSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, status, expectedVersion } = parsed.data

  const campaignId = await loadDungeonCampaignId(dungeonId)
  if (campaignId === null) return err("dungeon-not-found")
  const campaign = await requireCampaignDM(campaignId)

  if (status === "active") {
    const active = await loadActiveDungeonForCampaign(campaignId)
    if (active && active.id !== dungeonId) {
      return err("campaign-already-has-active-delve")
    }
  }

  const result = await setDungeonStatus(dungeonId, status, expectedVersion)
  if (!result.ok) return result

  revalidatePath(`/campaigns/${campaign.shortId}`)

  return ok({ version: result.value.version })
}
