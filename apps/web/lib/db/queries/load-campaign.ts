import { and, asc, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  campaigns,
  campaignUsers,
  type CampaignRow,
} from "@/lib/db/schema/campaign"
import { entity } from "@/lib/db/schema/entity"
import { users } from "@/lib/db/schema/user"

import {
  characterSummaryProjection,
  type CharacterSummary,
} from "./character-list"

/**
 * Reads for the `campaigns` table. The campaign is the durable DM↔player
 * boundary (ADR Decision 9); this loader backs the campaign-DM authorization
 * guard (`requireCampaignDM`) and the campaign surfaces (UNN-329). Most reads
 * touch only `campaigns` / `campaignUsers`; the roster read (`loadCampaignRoster`)
 * is cross-domain by nature — it joins `users` for member display and groups the
 * campaign's placed characters (`entity.campaignId`, UNN-556) onto each member.
 */

/** The raw `campaigns` row by id, or `null` when no campaign matches. */
export async function loadCampaignRowById(
  campaignId: string
): Promise<CampaignRow | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  return row ?? null
}

/**
 * Every campaign a user runs as the DM (`dmUserId`), newest first. Backs the
 * thin `/campaigns` entry (UNN-335) that lists a DM's campaigns with a "New
 * encounter" button; the full My Campaigns / manage page is UNN-329.
 */
export async function loadCampaignsByDmUserId(
  dmUserId: string
): Promise<CampaignRow[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.dmUserId, dmUserId))
    .orderBy(desc(campaigns.createdAt))
}

/**
 * Every campaign the user plays in — i.e. is a `campaignUsers` member of — newest
 * first. Backs the "Playing in" section of My Campaigns (UNN-329); the DM's own
 * campaigns come from {@link loadCampaignsByDmUserId} and never overlap (the DM is
 * never a member row).
 */
export async function loadCampaignsForMember(
  userId: string
): Promise<CampaignRow[]> {
  const rows = await db
    .select({ campaign: campaigns })
    .from(campaignUsers)
    .innerJoin(campaigns, eq(campaignUsers.campaignId, campaigns.id))
    .where(eq(campaignUsers.userId, userId))
    .orderBy(desc(campaigns.createdAt))

  return rows.map((row) => row.campaign)
}

/** The raw `campaigns` row by public `shortId` (the manage/overview URL), or
 *  `null` when none matches. Peer of {@link loadCampaignByJoinToken}. */
export async function loadCampaignByShortId(
  shortId: string
): Promise<CampaignRow | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.shortId, shortId))
    .limit(1)

  return row ?? null
}

/** One campaign member plus the characters they've placed into the campaign. A
 *  member who has placed nothing has an empty `characters` array → the manage
 *  page renders "No character placed". */
export interface RosterMember {
  member: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
  characters: CharacterSummary[]
}

/**
 * The campaign's roster for the manage page (UNN-329): every `campaignUsers`
 * member with their display identity, each carrying the characters they've placed
 * into this campaign. Two reads — members (`campaignUsers` ⋈ `users`) and the
 * campaign's placed characters (with `ownerId`) — grouped in app code so a member
 * with no placed character still appears. Ordered by member name then character
 * name for a stable render.
 */
export async function loadCampaignRoster(
  campaignId: string
): Promise<RosterMember[]> {
  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(campaignUsers)
    .innerJoin(users, eq(campaignUsers.userId, users.id))
    .where(eq(campaignUsers.campaignId, campaignId))
    .orderBy(asc(users.name))

  const characterRows = await db
    .select({ ownerId: entity.ownerId, ...characterSummaryProjection })
    .from(entity)
    .where(and(eq(entity.campaignId, campaignId), isNull(entity.deletedAt)))
    .orderBy(asc(entity.name))

  const charactersByOwner = new Map<string, CharacterSummary[]>()
  for (const { ownerId, ...summary } of characterRows) {
    const list = charactersByOwner.get(ownerId) ?? []
    list.push(summary)
    charactersByOwner.set(ownerId, list)
  }

  return memberRows.map((member) => ({
    member,
    characters: charactersByOwner.get(member.id) ?? [],
  }))
}

/**
 * The campaign behind a `/join/{joinToken}` link, or `null` when the token is
 * unknown — the only lookup the public join page (UNN-327) does. The token is
 * the access secret, so a non-match renders the "link no longer valid" state
 * rather than leaking whether any campaign exists.
 */
export async function loadCampaignByJoinToken(
  joinToken: string
): Promise<CampaignRow | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.joinToken, joinToken))
    .limit(1)

  return row ?? null
}

/**
 * Whether `userId` is already a `campaignUsers` member of `campaignId`. Drives
 * the join page's "already in" vs "join" branch (UNN-327) and stays index-only
 * — a `LIMIT 1` existence probe against the `(campaignId, userId)` primary key.
 * The DM is never a member row, so this is `false` for the DM (handled separately).
 */
export async function isCampaignMember(
  campaignId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ userId: campaignUsers.userId })
    .from(campaignUsers)
    .where(
      and(
        eq(campaignUsers.campaignId, campaignId),
        eq(campaignUsers.userId, userId)
      )
    )
    .limit(1)

  return row !== undefined
}
