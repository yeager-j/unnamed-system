import { forbidden } from "next/navigation"

import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadCharacterRowById } from "@/lib/db/queries/load-character"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { CharacterRow } from "@/lib/db/schema/character"

import { auth } from "./index"

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
  if (character.ownerId === viewerId) return character

  if (character.campaignId) {
    const campaign = await loadCampaignRowById(character.campaignId)
    if (campaign && campaign.dmUserId === viewerId) return character
  }

  forbidden()
}
