import {
  combatantDisplayNames,
  combatEnemyTokensByZone,
  projectDungeonSnapshot,
  type DungeonCombatLink,
  type DungeonRosterEntry,
  type DungeonSnapshot,
} from "@workspace/game/engine"
import type { HydratedCharacter } from "@workspace/game/foundation"

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

/** The roster narrowed to the `{ name, currentHP }` shape {@link
 *  combatantDisplayNames} reads PC names from — so the "Round N · {actor}" banner
 *  numbers duplicate enemies identically to their map tokens. */
function pcInfoFromRoster(
  roster: Record<string, DungeonRosterEntry>
): Record<string, { name: string; currentHP: number }> {
  return Object.fromEntries(
    Object.entries(roster).map(([id, entry]) => [
      id,
      { name: entry.name, currentHP: entry.hp.current },
    ])
  )
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

  // The party tokens show each other's HP/SP (UNN-489), so hydrate the placed
  // members **actually present** in the delve (occupancy ∩ placed) for their
  // current pools — a non-present placed character has no token, so it's skipped.
  const placedIds = new Set(placed.map((character) => character.id))
  const partyIds = Object.keys(instance.state.occupancy).filter((id) =>
    placedIds.has(id)
  )
  const hydrated = (
    await Promise.all(partyIds.map((id) => loadHydratedCharacterById(id)))
  ).filter((character): character is HydratedCharacter => character !== null)
  const vitalsById = new Map(
    hydrated.map((character) => [
      character.id,
      {
        hp: { current: character.currentHP, max: character.maxHP },
        sp: { current: character.currentSP, max: character.maxSP },
      },
    ])
  )
  const roster = buildRoster(placed, vitalsById)

  // A live encounter on this delve's Instance ⇒ combat is running: surface the
  // linkage the fog view dual-subscribes + composes its own-sheet column from,
  // plus the redacted enemy tokens for the battlefield (HP only, no affinities).
  // The acting-combatant signal numbers duplicate enemies the same way the tokens
  // do, resolving through the shared disambiguator (UNN-489).
  const enemyStatblockById = live
    ? resolveCatalogEnemyStatblocks(live.session.combatants)
    : {}
  const combat: DungeonCombatLink | undefined = live
    ? {
        encounterShortId: live.shortId,
        round: live.session.round,
        currentActorId: live.session.currentActorId ?? null,
        currentActorName: live.session.currentActorId
          ? (combatantDisplayNames(
              live.session,
              pcInfoFromRoster(roster),
              enemyStatblockById
            ).get(live.session.currentActorId) ?? null)
          : null,
      }
    : undefined
  const enemyTokensByZone = live
    ? combatEnemyTokensByZone(live.session, instance.state, enemyStatblockById)
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
