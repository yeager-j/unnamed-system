import { getEnemy } from "@workspace/game/data"
import {
  combatEnemyTokensByZone,
  projectDungeonSnapshot,
  type DungeonCombatLink,
  type DungeonSnapshot,
} from "@workspace/game/engine"
import type {
  CombatSession,
  HydratedCharacter,
} from "@workspace/game/foundation"

import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import {
  loadCharacterRowById,
  loadHydratedCharacterById,
} from "@/lib/db/queries/load-character"
import { loadDungeonRowByShortId } from "@/lib/db/queries/load-dungeon"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter"
import {
  loadOwnedEncounterSheets,
  type OwnedEncounterSheet,
} from "@/lib/db/queries/load-encounter-snapshot"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import { resolveCatalogEnemyStatblocks } from "@/lib/game-engine"

/**
 * The acting combatant's display name for the "Combat — Round N · {actor}" signal,
 * resolved with **no extra DB read**: a PC's name comes from the already-loaded
 * delve roster, an enemy's from the hardcoded catalog (or its inline stat block).
 * `null` before anyone is drafted / between rounds.
 */
function currentActorName(
  session: CombatSession,
  roster: Record<string, { name: string }>
): string | null {
  const actor = session.combatants.find(
    (combatant) => combatant.id === session.currentActorId
  )
  if (!actor) return null
  const ref = actor.ref
  if (ref.kind === "pc") return roster[ref.characterId]?.name ?? null
  if (ref.kind === "catalog-enemy") return getEnemy(ref.enemyKey)?.name ?? null
  return ref.statBlock.name
}

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

  const [campaign, instance, placed, live] = await Promise.all([
    loadCampaignRowById(dungeon.campaignId),
    loadMapInstanceById(dungeon.mapInstanceId),
    loadPlacedCharactersForCampaign(dungeon.campaignId),
    loadLiveEncounterForMapInstance(dungeon.mapInstanceId),
  ])
  if (!instance) return null

  const roster = Object.fromEntries(
    placed.map((character) => [
      character.id,
      { name: character.name, portraitUrl: character.portraitUrl },
    ])
  )

  // A live encounter on this delve's Instance ⇒ combat is running: surface the
  // linkage the fog view dual-subscribes + composes its own-sheet column from,
  // plus the redacted enemy tokens for the battlefield (HP only, no affinities).
  const combat: DungeonCombatLink | undefined = live
    ? {
        encounterShortId: live.shortId,
        round: live.session.round,
        currentActorName: currentActorName(live.session, roster),
      }
    : undefined
  const enemyTokensByZone = live
    ? combatEnemyTokensByZone(
        live.session,
        instance.state,
        resolveCatalogEnemyStatblocks(live.session.combatants)
      )
    : {}

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
    roster,
    combat,
    enemyTokensByZone
  )
}

/**
 * The viewer's own hydrated character sheets for the encounter running on **this
 * delve** (UNN-467, AC8), or `[]` when no fight is live / the viewer owns none.
 * The fog view composes these into the encounter watch's own-sheet column during
 * combat. Thin shell over {@link loadOwnedEncounterSheets} (redaction-correct —
 * only the viewer's own characters are hydrated): it resolves the delve's live
 * encounter shortId, which the snapshot also exposes as `combat.encounterShortId`.
 */
export async function loadOwnedDungeonCombatSheets(
  dungeonShortId: string,
  viewerId: string
): Promise<OwnedEncounterSheet[]> {
  const dungeon = await loadDungeonRowByShortId(dungeonShortId)
  if (!dungeon) return []

  const live = await loadLiveEncounterForMapInstance(dungeon.mapInstanceId)
  if (!live) return []

  return loadOwnedEncounterSheets(live.shortId, viewerId)
}

/**
 * The viewer's own hydrated character sheets for the delve's **exploration**
 * (non-combat) player view (`/c/dungeon/{shortId}`), feeding the Explore-tab
 * column beside the fog map. Hydrate-only: it takes the already-resolved owned
 * `characterId`s (the page computes them once for the fog self-highlight, so we
 * don't re-walk occupancy) and loads each full sheet. Returns bare
 * {@link HydratedCharacter}s — exploration has no combatant, so no
 * `combatantId`, unlike the combat path's {@link OwnedEncounterSheet}.
 *
 * Privacy: callers pass only ids the viewer owns ({@link
 * loadOwnedDungeonCharacterIds}, owner-filtered on the cheap character row), so
 * a non-owner's sheet is never hydrated.
 */
export async function hydrateOwnedDungeonSheets(
  ownedCharacterIds: string[]
): Promise<HydratedCharacter[]> {
  const characters = await Promise.all(
    ownedCharacterIds.map((id) => loadHydratedCharacterById(id))
  )
  return characters.filter((character) => character !== null)
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
