import { and, asc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { campaigns } from "@/lib/db/schema/campaign"
import {
  characterArchetypes,
  characters,
  type CharacterStatus,
} from "@/lib/db/schema/character"

/**
 * Summary view of a character for the My Characters home page: just the
 * columns the card grid renders. Distinct from {@link HydratedCharacter} so
 * the list query can stay a single round-trip and never pulls JSON columns,
 * child rows, or derived stats it would not display.
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
  status: CharacterStatus
  builderStep: number
}

/**
 * Every character owned by `ownerId`, ordered by most-recently-updated first.
 * A single `LEFT JOIN` on `characters.activeArchetypeId` resolves the active
 * Archetype's key in the same query, so a 50-character roster is one round
 * trip — the "no N+1" guarantee the ticket calls out.
 */
export async function loadOwnedCharacterSummaries(
  ownerId: string
): Promise<CharacterSummary[]> {
  const rows = await db
    .select({
      id: characters.id,
      shortId: characters.shortId,
      name: characters.name,
      level: characters.level,
      portraitUrl: characters.portraitUrl,
      activeArchetypeKey: characterArchetypes.archetypeKey,
      status: characters.status,
      builderStep: characters.builderStep,
    })
    .from(characters)
    .leftJoin(
      characterArchetypes,
      eq(characters.activeArchetypeId, characterArchetypes.id)
    )
    .where(eq(characters.ownerId, ownerId))
    .orderBy(asc(characters.name))

  return rows
}

/**
 * Every **finalized** character placed into `campaignId` (`characters.campaignId`),
 * as the same one-round-trip {@link CharacterSummary} projection. Backs the
 * encounter setup shell's Import-PCs panel (UNN-298): the DM picks combatants
 * from the campaign's placed roster, not every character they own. Drafts are
 * excluded — only a finished character can be a combatant.
 */
export async function loadPlacedCharactersForCampaign(
  campaignId: string
): Promise<CharacterSummary[]> {
  const rows = await db
    .select({
      id: characters.id,
      shortId: characters.shortId,
      name: characters.name,
      level: characters.level,
      portraitUrl: characters.portraitUrl,
      activeArchetypeKey: characterArchetypes.archetypeKey,
      status: characters.status,
      builderStep: characters.builderStep,
    })
    .from(characters)
    .leftJoin(
      characterArchetypes,
      eq(characters.activeArchetypeId, characterArchetypes.id)
    )
    .where(
      and(
        eq(characters.campaignId, campaignId),
        eq(characters.status, "finalized")
      )
    )
    .orderBy(asc(characters.name))

  return rows
}

/** A PC combatant's persistent name + current HP, keyed by character id. The
 *  live DM console (UNN-344) injects this into its pure view: a PC's name and
 *  Fallen state live on the character row, not the session. */
export interface CharacterVitals {
  name: string
  currentHP: number
}

/**
 * The `name` + `currentHP` of every character in `characterIds`, keyed by id —
 * the one batch read the live console needs to label its PC combatants and
 * resolve their Fallen state (`fallenCombatantIds`). One round trip via
 * `IN (...)`; an empty id list short-circuits to `{}` (Drizzle rejects an empty
 * `inArray`). Selects only the two columns, never the heavy character JSON.
 */
export async function loadCharacterVitalsByIds(
  characterIds: string[]
): Promise<Record<string, CharacterVitals>> {
  if (characterIds.length === 0) return {}

  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      currentHP: characters.currentHP,
    })
    .from(characters)
    .where(inArray(characters.id, characterIds))

  return Object.fromEntries(
    rows.map((row) => [row.id, { name: row.name, currentHP: row.currentHP }])
  )
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
      id: characters.id,
      shortId: characters.shortId,
      name: characters.name,
      level: characters.level,
      portraitUrl: characters.portraitUrl,
      activeArchetypeKey: characterArchetypes.archetypeKey,
      status: characters.status,
      builderStep: characters.builderStep,
      campaignId: characters.campaignId,
      placedCampaignName: campaigns.name,
    })
    .from(characters)
    .leftJoin(
      characterArchetypes,
      eq(characters.activeArchetypeId, characterArchetypes.id)
    )
    .leftJoin(campaigns, eq(characters.campaignId, campaigns.id))
    .where(
      and(eq(characters.ownerId, ownerId), eq(characters.status, "finalized"))
    )
    .orderBy(asc(characters.name))
}
