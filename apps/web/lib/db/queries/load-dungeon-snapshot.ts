import {
  projectDungeonSnapshot,
  type DungeonRosterEntry,
  type DungeonSnapshot,
} from "@workspace/game-v2/visibility"

import { dungeonExitAnchors } from "@/domain/map/view/exit-anchors"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadDungeonRowByShortId } from "@/lib/db/queries/load-dungeon"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-session"
import { loadPartyVitalsByIds } from "@/lib/db/queries/load-party-vitals"
import { loadLivePlayerCharactersByIds } from "@/lib/db/queries/load-player-character"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"

/** The placed party as the snapshot projector reads it: display identity plus the
 *  current vitals for each token's health bars (UNN-489). `vitalsById` carries the
 *  hydrated pools for the members actually present in the delve; an absent member
 *  falls back to a zero pool (it has no token to draw, so it never renders). */
function buildRoster(
  placed: { id: string; name: string; portraitUrl: string | null }[],
  vitalsById: Map<
    string,
    { hp: DungeonRosterEntry["hp"]; sp: DungeonRosterEntry["sp"] }
  >
): Record<string, DungeonRosterEntry> {
  return Object.fromEntries(
    placed.map((character) => {
      const vitals = vitalsById.get(character.id)
      return [
        character.id,
        {
          name: character.name,
          portraitUrl: character.portraitUrl,
          hp: vitals?.hp ?? { current: 0, max: 0 },
          sp: vitals?.sp ?? { current: 0, max: 0 },
        },
      ]
    })
  )
}

/**
 * Assembles the signed-out **dungeon fog snapshot** for a delve by its public
 * `shortId` (UNN-466), or `null` when no dungeon matches (the page's 404 / the API
 * route's 404). The impure shell around the pure {@link projectDungeonSnapshot}: it
 * loads the dungeon + its Map Instance and the campaign's placed-character roster
 * (for token names/portraits), then projects. During a live fight the snapshot
 * carries the fight's **linkage** (`combat.encounterShortId`, UNN-603) — the
 * observable phase signal the watch client acts on — but never combat session
 * content; the combatant data stays the fogged combat snapshot's concern.
 *
 * The fog **redaction lives in the projector**, so it is unconditional and
 * server-side — this loader never ships DM notes, undiscovered Zones, or unrevealed
 * connections to the client, and deleting the view can't re-expose them. Keyed by
 * `shortId`, never the internal dungeon id, so the public surface (page + poll API)
 * leaks no internal UUID. shortIds are globally unique, so the optional
 * `campaignShortId` **pairing check** (`campaign.shortId === campaignShortId`)
 * stops one campaign's watch URL from resolving another's dungeon; a mismatch
 * collapses to `null` (404). Pairing runs only when a campaign frames the read
 * (the nested watch page passes it); the flat poll API (`/api/dungeon/[shortId]/…`)
 * is keyed on the unique shortId and omits it. `mapInstanceId` is non-null (restrict
 * FK), so a missing Instance is a data-integrity fault and collapses to `null` too.
 */
export async function getDungeonSnapshot(
  shortId: string,
  campaignShortId?: string
): Promise<DungeonSnapshot | null> {
  const dungeon = await loadDungeonRowByShortId(shortId)
  if (!dungeon) return null

  const [campaign, instance, placed, liveEncounter] = await Promise.all([
    loadCampaignRowById(dungeon.campaignId),
    loadMapInstanceById(dungeon.mapInstanceId),
    loadPlacedCharactersForCampaign(dungeon.campaignId),
    loadLiveEncounterForMapInstance(dungeon.mapInstanceId),
  ])
  if (!campaign) return null
  if (campaignShortId && campaign.shortId !== campaignShortId) return null
  if (!instance) return null

  // The party tokens show each other's HP/SP (UNN-489), so hydrate the placed
  // members **actually present** in the delve (occupancy ∩ placed) for their
  // current pools — a non-present placed character has no token, so it's skipped.
  const placedIds = new Set(placed.map((character) => character.id))
  const partyIds = Object.keys(instance.state.occupancy).filter((id) =>
    placedIds.has(id)
  )
  const vitalsById = await loadPartyVitalsByIds(partyIds)
  const roster = buildRoster(placed, vitalsById)

  return projectDungeonSnapshot(
    {
      name: dungeon.name,
      status: dungeon.status,
      campaignShortId: campaign.shortId,
      version: dungeon.version,
      instanceVersion: instance.version,
      ...(liveEncounter
        ? { combat: { encounterShortId: liveEncounter.shortId } }
        : {}),
    },
    instance.state,
    dungeon.state,
    roster,
    dungeonExitAnchors(instance.state)
  )
}

/**
 * The `characterId`s of the party tokens in this delve that the **signed-in viewer
 * owns** — the set the fog view self-highlights (ADR — *self-identifying*). Empty
 * for a spectator, a signed-out viewer, or a member with no placed character here.
 *
 * Privacy: the candidates are the Instance's occupancy keys (the PC tokens present),
 * and ownership is decided on the cheap PC *subtype* — only `userId` is read, never
 * another player's full sheet. The redacted snapshot remains the only token data a
 * non-owner receives; this just tells the viewer which tokens are *theirs*.
 */
export async function loadOwnedDungeonCharacterIds(
  shortId: string,
  viewerId: string
): Promise<string[]> {
  const dungeon = await loadDungeonRowByShortId(shortId)
  if (!dungeon) return []

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (!instance) return []

  const tokenCharacterIds = Object.keys(instance.state.occupancy)

  // Live join (R3 — UNN-573): a tombstoned token drops off the highlight (live
  // occupancy read), and ownership reads off the subtype's `userId`.
  const live = await loadLivePlayerCharactersByIds(tokenCharacterIds)
  return live.filter((pc) => pc.userId === viewerId).map((pc) => pc.entity.id)
}
