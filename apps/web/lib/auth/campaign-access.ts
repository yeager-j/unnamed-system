import { forbidden } from "next/navigation"

import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import {
  loadPlayerCharacterById,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { auth } from "./index"

/**
 * The owner-or-campaign-DM check, shared by the character and entity gates: the
 * PC's owner (`userId`), or the DM of the campaign it is placed into
 * (`campaignId → campaign.dmUserId`), may write it. Two queries max — the campaign
 * is loaded only on a non-owner viewer of a placed PC. Reads the lifecycle facts
 * off the player-character subtype (R3 — UNN-573).
 */
async function isOwnerOrCampaignDM(
  viewerId: string,
  pc: { userId: string; campaignId: string | null }
): Promise<boolean> {
  if (pc.userId === viewerId) return true
  if (pc.campaignId) {
    const campaign = await loadCampaignRowById(pc.campaignId)
    if (campaign && campaign.dmUserId === viewerId) return true
  }
  return false
}

/**
 * Authorization gate for campaign-DM-only mutations — the encounter side of the
 * boundary `requireOwner` (`viewer-role.ts`) draws for character sheets. A
 * campaign has exactly one DM (`campaign.dmUserId`, ADR Decision 9); running an
 * encounter, editing its session, and the DM-vitals writes all require that the
 * caller *is* that DM.
 *
 * Loads the campaign by id, compares its `dmUserId` to the current session's
 * user id, and trips `forbidden()` (HTTP 403) on any mismatch — missing
 * session, missing campaign, or signed-in-but-not-the-DM. Returns the loaded
 * row on success so callers don't re-query.
 *
 * Use at the top of every Server Action that runs or mutates an encounter.
 * UNN-297's `requireOwnerOrCampaignDM(characterId)` composes the same DM check
 * (character → `campaignId` → this comparison) with the owner check.
 */
export async function requireCampaignDM(
  campaignId: string
): Promise<CampaignRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const campaign = await loadCampaignRowById(campaignId)
  if (!campaign || campaign.dmUserId !== viewerId) forbidden()

  return campaign
}

/**
 * Authorization gate for the PC-vitals (pools) writes — `damage`/`heal`/
 * `spendSP`/`recoverSP`/`usePrisma` (UNN-297/UNN-551): a component write is
 * gated against the `entity` row's own owner/placement — the character's owner
 * *or* the DM of the campaign it is placed into may adjust HP/SP. The two-writer
 * race (player heals while DM damages) is HP/SP-only and reconciled by the
 * `vitalsVersion` guard, so no extra locking is needed here.
 *
 * Loads the player character (its subtype row carrying the `entity` substrate)
 * first; on an owner match it returns immediately — no campaign query. Otherwise,
 * if the PC is placed (`campaignId` non-null), it loads the campaign and compares
 * `dmUserId`. Trips `forbidden()` (HTTP 403) on any failure — including an entity
 * with no PC subtype. Returns the loaded {@link LoadedPlayerCharacter} so the Store
 * assembles from `pc.entity` and reads lifecycle facts off `pc` without
 * re-querying. Two queries max.
 */
export async function requireOwnerOrCampaignDMForEntity(
  entityId: string
): Promise<LoadedPlayerCharacter> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const pc = await loadPlayerCharacterById(entityId)
  if (!pc) forbidden()
  if (await isOwnerOrCampaignDM(viewerId, pc)) return pc

  forbidden()
}

/**
 * The strict-owner twin of `requireOwner` (`viewer-role.ts`) — the gate for the
 * column actions and lifecycle writes (name, portrait, builder step, finalize,
 * delete, placement), where v1 never granted the DM. Loads and returns the
 * {@link LoadedPlayerCharacter}; trips `forbidden()` on missing session, missing
 * PC subtype, or a non-owner viewer.
 */
export async function requireEntityOwner(
  entityId: string
): Promise<LoadedPlayerCharacter> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const pc = await loadPlayerCharacterById(entityId)
  if (!pc || pc.userId !== viewerId) forbidden()

  return pc
}
