import {
  projectDungeonSnapshot,
  type DungeonSnapshot,
} from "@workspace/game/engine"

import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadCharacterRowById } from "@/lib/db/queries/load-character"
import { loadDungeonRowByShortId } from "@/lib/db/queries/load-dungeon"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"

/**
 * Assembles the signed-out **dungeon fog snapshot** for a delve by its public
 * `shortId` (UNN-466), or `null` when no dungeon matches (the page's 404 / the API
 * route's 404). The impure shell around the pure {@link projectDungeonSnapshot}: it
 * loads the dungeon + its Map Instance and the campaign's placed-character roster
 * (for token names/portraits), then projects.
 *
 * The fog **redaction lives in the projector**, so it is unconditional and
 * server-side — this loader never ships DM notes, undiscovered Zones, or unrevealed
 * connections to the client, and deleting the view can't re-expose them. Keyed by
 * `shortId`, never the internal dungeon id, so the public surface (page + poll API)
 * leaks no internal UUID. `mapInstanceId` is non-null (restrict FK), so a missing
 * Instance is a data-integrity fault and collapses to `null` (the surface 404s).
 */
export async function getDungeonSnapshot(
  shortId: string
): Promise<DungeonSnapshot | null> {
  const dungeon = await loadDungeonRowByShortId(shortId)
  if (!dungeon) return null

  const [campaign, instance, placed] = await Promise.all([
    loadCampaignRowById(dungeon.campaignId),
    loadMapInstanceById(dungeon.mapInstanceId),
    loadPlacedCharactersForCampaign(dungeon.campaignId),
  ])
  if (!instance) return null

  const roster = Object.fromEntries(
    placed.map((character) => [
      character.id,
      { name: character.name, portraitUrl: character.portraitUrl },
    ])
  )

  return projectDungeonSnapshot(
    {
      name: dungeon.name,
      status: dungeon.status,
      campaignShortId: campaign?.shortId ?? "",
      version: dungeon.version,
      instanceVersion: instance.version,
    },
    instance.state,
    dungeon.state,
    roster
  )
}

/**
 * The `characterId`s of the party tokens in this delve that the **signed-in viewer
 * owns** — the set the fog view self-highlights (ADR — *self-identifying*). Empty
 * for a spectator, a signed-out viewer, or a member with no placed character here.
 *
 * Privacy: the candidates are the Instance's occupancy keys (the PC tokens present),
 * and ownership is decided on the cheap character *row* — only `ownerId` is read,
 * never another player's full sheet. The redacted snapshot remains the only token
 * data a non-owner receives; this just tells the viewer which tokens are *theirs*.
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

  const owned = await Promise.all(
    tokenCharacterIds.map(async (characterId) => {
      const row = await loadCharacterRowById(characterId)
      return row?.ownerId === viewerId ? characterId : null
    })
  )

  return owned.filter((id) => id !== null)
}
