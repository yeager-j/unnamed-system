import { forbidden } from "next/navigation"

import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadCharacterRowById } from "@/lib/db/queries/load-character"
import { loadEntityRowById } from "@/lib/db/queries/load-entity"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { CharacterRow } from "@/lib/db/schema/character"
import type { EntityRow } from "@/lib/db/schema/entity"

import { auth } from "./index"

/**
 * The owner-or-campaign-DM check, shared by the character and entity gates: the
 * row's owner, or the DM of the campaign it is placed into, may write it. Two
 * queries max — the campaign is loaded only on a non-owner viewer of a placed row.
 */
async function isOwnerOrCampaignDM(
  viewerId: string,
  placement: { ownerId: string; campaignId: string | null }
): Promise<boolean> {
  if (placement.ownerId === viewerId) return true
  if (placement.campaignId) {
    const campaign = await loadCampaignRowById(placement.campaignId)
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
 * `spendSP`/`recoverSP`/`usePrisma` (UNN-297). Widens `requireOwner`
 * (`viewer-role.ts`) by the campaign-DM branch: the character's owner *or* the
 * DM of the campaign the character is placed into may adjust HP/SP. The
 * two-writer race (player heals while DM damages) is HP/SP-only and reconciled
 * by the existing `vitalsVersion` guard, so no extra locking is needed here.
 *
 * Loads the character row first (as `requireOwner` does); on an owner match it
 * returns immediately — no campaign query. Otherwise, if the character is placed
 * (`campaignId` non-null), it loads the campaign and compares `dmUserId`. Trips
 * `forbidden()` (HTTP 403) on any failure — missing session, missing character,
 * a non-owner whose character is unplaced, or a viewer who is not the campaign's
 * DM. Returns the loaded {@link CharacterRow} on success so callers don't
 * re-query. Two queries max, no joins.
 */
export async function requireOwnerOrCampaignDM(
  characterId: string
): Promise<CharacterRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const character = await loadCharacterRowById(characterId)
  if (!character) forbidden()
  if (await isOwnerOrCampaignDM(viewerId, character)) return character

  forbidden()
}

/**
 * The entity-row twin of {@link requireOwnerOrCampaignDM} (UNN-551): the durable
 * write pipeline gates a component write against the `entity` row's own
 * owner/placement — a player writes their own PC, the campaign DM may too (v1
 * parity). Loads and returns the {@link EntityRow} so the Store assembles from it
 * without re-querying. Same posture, one gate per write path.
 */
export async function requireOwnerOrCampaignDMForEntity(
  entityId: string
): Promise<EntityRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const row = await loadEntityRowById(entityId)
  if (!row) forbidden()
  if (await isOwnerOrCampaignDM(viewerId, row)) return row

  forbidden()
}
