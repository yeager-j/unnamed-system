import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { campaigns } from "@/lib/db/schema/campaign"
import { entity, type EntityStatus } from "@/lib/db/schema/entity"

/**
 * Summary view of a character for the My Characters home page: just the
 * columns the card grid renders, off the v2 `entity` table (UNN-556 — the
 * minimal repoint; S3 owns the redesign). `level` and the active Archetype
 * key project out of their component jsonb columns so a 50-character roster
 * stays one round trip with no child-table join.
 *
 * Drafts (UNN-204) appear here alongside finalized characters but the card
 * renders a distinct draft affordance; `status` and `builderStep` drive
 * that branch.
 */
export interface CharacterSummary {
  id: string
  shortId: string
  name: string
  level: number
  portraitUrl: string | null
  activeArchetypeKey: string | null
  status: EntityStatus
  builderStep: number
}

/** The one `entity` → {@link CharacterSummary} column set — shared with the
 *  campaign roster read (`load-campaign.ts`) so the projections can't drift. */
export const characterSummaryProjection = {
  id: entity.id,
  shortId: entity.shortId,
  name: entity.name,
  level: sql<number>`coalesce((${entity.level}->>'value')::int, 1)`,
  portraitUrl: entity.portraitUrl,
  activeArchetypeKey: sql<string | null>`${entity.archetypes}->>'active'`,
  status: entity.status,
  builderStep: entity.builderStep,
}

/**
 * Every entity character owned by `ownerId`, ordered by name. One round trip —
 * the "no N+1" guarantee the original ticket calls out — via the jsonb
 * projections above.
 */
export async function loadOwnedCharacterSummaries(
  ownerId: string
): Promise<CharacterSummary[]> {
  return db
    .select(characterSummaryProjection)
    .from(entity)
    .where(eq(entity.ownerId, ownerId))
    .orderBy(asc(entity.name))
}

/**
 * Every **finalized** character placed into `campaignId` (`entity.campaignId`),
 * as the same one-round-trip {@link CharacterSummary} projection. Backs the
 * encounter setup shell's Import-PCs panel (UNN-298): the DM picks combatants
 * from the campaign's placed roster, not every character they own. Drafts are
 * excluded — only a finished character can be a combatant.
 */
export async function loadPlacedCharactersForCampaign(
  campaignId: string
): Promise<CharacterSummary[]> {
  return db
    .select(characterSummaryProjection)
    .from(entity)
    .where(
      and(eq(entity.campaignId, campaignId), eq(entity.status, "finalized"))
    )
    .orderBy(asc(entity.name))
}

/**
 * A finalized character the viewer owns, plus where it is currently placed — the
 * data the campaign-page placement controls need (UNN-328). `campaignId` is the
 * character's current campaign (null when unplaced); `placedCampaignName` is that
 * campaign's name, resolved by a LEFT JOIN so the "Move from {name}?" dialog can
 * label the prior campaign without a second query.
 */
export interface OwnedPlacementCharacter extends CharacterSummary {
  campaignId: string | null
  placedCampaignName: string | null
}

/**
 * Every **finalized** character owned by `ownerId`, with its current placement,
 * ordered by name. Backs the placement section on the campaign page (UNN-328);
 * drafts are excluded because only a finished character is eligible to be placed
 * (and run as a combatant).
 */
export async function loadOwnedFinalizedCharactersWithPlacement(
  ownerId: string
): Promise<OwnedPlacementCharacter[]> {
  return db
    .select({
      ...characterSummaryProjection,
      campaignId: entity.campaignId,
      placedCampaignName: campaigns.name,
    })
    .from(entity)
    .leftJoin(campaigns, eq(entity.campaignId, campaigns.id))
    .where(and(eq(entity.ownerId, ownerId), eq(entity.status, "finalized")))
    .orderBy(asc(entity.name))
}
