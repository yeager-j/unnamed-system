import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { MapZone } from "@workspace/game-v2/spatial"
import type {
  DungeonSnapshotToken,
  DungeonSnapshotZone,
} from "@workspace/game-v2/visibility"
import { initials } from "@workspace/ui/lib/initials"

import { groupTokensByEngagement } from "@/domain/combat/view/engagement-groups"
import type { RailRow } from "@/domain/combat/view/roster-view"
import type { WatchCombatant } from "@/domain/combat/view/watch-layout"
import type {
  SetPieceFaction,
  SetPieceOccupant,
  ZoneSetPieceView,
} from "@/domain/map/view/set-piece-view"
import type { Pool } from "@/domain/pool"

/**
 * The **engine→view mapping**, decided once (Dungeon Visual Overhaul §D3). One
 * builder per surface data-source turns a zone + its occupants into a finished
 * {@link ZoneSetPieceView} the kit's engine-free set-piece card renders. Every
 * builder derives `owned` from the viewer's `ownedCharacterIds` **array** (0..n
 * gold) and `engagementGroup` from the shared {@link groupTokensByEngagement}
 * partition — **only for multi-member clusters** (the partition returns Free
 * combatants as singletons, and a singleton is not a melee). `party`/`hop` are
 * P3 channels (the range lens + gold keyline) — carried in the shape, left
 * unpopulated here.
 */

type IdentitySource = Pick<
  MapZone,
  "name" | "description" | "size" | "motif" | "mood"
>

const identity = (
  source: IdentitySource
): Pick<
  ZoneSetPieceView,
  "name" | "description" | "size" | "motif" | "mood"
> => ({
  name: source.name,
  description: source.description,
  size: source.size,
  motif: source.motif,
  mood: source.mood,
})

const factionOfSide = (side: CombatSide): SetPieceFaction =>
  side === "players" ? "party" : "hostile"

/** The occupancy teaser (§D3): "Combat · P v H" when both sides stand here,
 *  "N hostiles" / "N here" otherwise, "" when empty. */
function occupancySummary(occupants: SetPieceOccupant[]): string {
  if (occupants.length === 0) return ""
  const party = occupants.filter((o) => o.faction === "party").length
  const hostile = occupants.filter((o) => o.faction === "hostile").length
  if (party > 0 && hostile > 0) return `Combat · ${party} v ${hostile}`
  if (hostile > 0) return `${hostile} hostile${hostile === 1 ? "" : "s"}`
  return `${party} here`
}

/**
 * The melee-cluster id per token — `undefined` for singletons, a shared number
 * for each **multi-member** cluster (§D3). A boolean couldn't tell two disjoint
 * melees in one zone apart; the partition's Free singletons must ring nothing.
 */
function engagementGroups<T extends { id: string; engagement?: Engagement }>(
  tokens: T[]
): Map<string, number> {
  const byId = new Map<string, number>()
  let clusterId = 0
  for (const group of groupTokensByEngagement(tokens)) {
    if (group.length <= 1) continue
    const id = clusterId++
    for (const token of group) byId.set(token.id, id)
  }
  return byId
}

const withOwned = (owned: readonly string[]) => new Set(owned)

/** A revealed party token on an explore/edit surface (the display subset of a
 *  roster entry). */
export type PartyTokenInput = {
  characterId: string
  name: string
  portraitUrl: string | null
  hp?: Pool
  sp?: Pool
}

/** A revealed party token (explore surfaces) → occupant. Party faction, no
 *  acting mark; HP/SP bars from its pools. */
function partyOccupant(
  token: PartyTokenInput,
  owned: Set<string>,
  engagementGroup?: number
): SetPieceOccupant {
  return {
    key: token.characterId,
    name: token.name,
    initials: initials(token.name),
    portraitUrl: token.portraitUrl,
    faction: "party",
    owned: owned.has(token.characterId),
    engagementGroup,
    hp: token.hp,
    sp: token.sp,
  }
}

/** A combatant (DM combat / watch combat) → occupant. Faction from side, the
 *  acting token ringed, HP/SP iff they survived redaction. */
function combatOccupant(
  combatant: {
    id: string
    name: string
    side: CombatSide
    portraitUrl: string | null
    hp: Pool | null
    sp: Pool | null
    acting: boolean
  },
  owned: Set<string>,
  engagementGroup?: number
): SetPieceOccupant {
  return {
    key: combatant.id,
    name: combatant.name,
    initials: initials(combatant.name),
    portraitUrl: combatant.portraitUrl,
    faction: factionOfSide(combatant.side),
    owned: owned.has(combatant.id),
    acting: combatant.acting,
    engagementGroup,
    hp: combatant.hp ?? undefined,
    sp: combatant.sp ?? undefined,
  }
}

/** Map party tokens to occupants (no acting mark, no engagement clustering) —
 *  the edit-mode board feeds these into {@link editorZoneView} so occupancy reads
 *  at every tier, not just as a Closeup overlay. */
export function partyOccupants(
  tokens: PartyTokenInput[],
  ownedCharacterIds: readonly string[] = []
): SetPieceOccupant[] {
  const owned = withOwned(ownedCharacterIds)
  return tokens.map((token) => partyOccupant(token, owned))
}

/** The map editor's card — identity plus any `occupants` the surface supplies
 *  (empty for a template; the run console's Edit mode passes the live party so
 *  the pips/summary/roster reflect occupancy across all tiers). */
export function editorZoneView(
  zone: MapZone,
  occupants: SetPieceOccupant[] = []
): ZoneSetPieceView {
  return {
    ...identity(zone),
    reveal: "revealed",
    party: false,
    hop: null,
    occupants,
    summary: occupancySummary(occupants),
    hasDmNotes: zone.dmNotes.trim().length > 0,
  }
}

/** The DM run console's exploration card — party tokens, reveal-aware. */
export function exploreZoneView(input: {
  zone: MapZone
  revealed: boolean
  tokens: {
    characterId: string
    name: string
    portraitUrl: string | null
    hp?: Pool
    sp?: Pool
  }[]
  ownedCharacterIds?: readonly string[]
}): ZoneSetPieceView {
  const owned = withOwned(input.ownedCharacterIds ?? [])
  const occupants = input.tokens.map((token) => partyOccupant(token, owned))
  return {
    ...identity(input.zone),
    reveal: input.revealed ? "revealed" : "unmapped",
    party: false,
    hop: null,
    occupants,
    summary: occupancySummary(occupants),
    hasDmNotes: input.zone.dmNotes.trim().length > 0,
  }
}

/** The DM combat battlefield's card — combatants from the console roster, disjoint
 *  melee clusters, acting ring. */
export function combatZoneView(input: {
  zone: MapZone
  revealed: boolean
  rows: RailRow[]
  ownedCharacterIds?: readonly string[]
}): ZoneSetPieceView {
  const owned = withOwned(input.ownedCharacterIds ?? [])
  const groups = engagementGroups(input.rows)
  const occupants = input.rows.map((row) =>
    combatOccupant(
      {
        id: row.id,
        name: row.name,
        side: row.side,
        portraitUrl: row.portraitUrl,
        hp: row.hp,
        sp: row.sp,
        acting: row.isCurrent,
      },
      owned,
      groups.get(row.id)
    )
  )
  return {
    ...identity(input.zone),
    reveal: input.revealed ? "revealed" : "unmapped",
    party: false,
    hop: null,
    occupants,
    summary: occupancySummary(occupants),
    hasDmNotes: input.zone.dmNotes.trim().length > 0,
  }
}

/** The player fog view's exploration card — revealed party tokens; dm-notes
 *  never leaks (the redacted snapshot withholds it). */
export function watchExploreZoneView(input: {
  zone: DungeonSnapshotZone
  ownedCharacterIds?: readonly string[]
}): ZoneSetPieceView {
  const owned = withOwned(input.ownedCharacterIds ?? [])
  const groups = engagementGroups(
    input.zone.tokens.map((token: DungeonSnapshotToken) => ({
      id: token.characterId,
      engagement: token.engagement,
    }))
  )
  const occupants = input.zone.tokens.map((token) =>
    partyOccupant(
      { ...token, hp: token.hp, sp: token.sp },
      owned,
      groups.get(token.characterId)
    )
  )
  return {
    ...identity(input.zone),
    reveal: "revealed",
    party: false,
    hop: null,
    occupants,
    summary: occupancySummary(occupants),
  }
}

/** The player fog view's combat card — the fogged fight's redacted combatants
 *  (the C3 join), joined onto this board zone by `zoneId`. */
export function watchCombatZoneView(input: {
  zone: DungeonSnapshotZone
  combatants: WatchCombatant[]
  ownedCharacterIds?: readonly string[]
}): ZoneSetPieceView {
  const owned = withOwned(input.ownedCharacterIds ?? [])
  const groups = engagementGroups(input.combatants)
  const occupants = input.combatants.map((combatant) =>
    combatOccupant(
      {
        id: combatant.id,
        name: combatant.name,
        side: combatant.side,
        portraitUrl: combatant.portraitUrl,
        hp: combatant.hp,
        sp: combatant.sp,
        acting: combatant.isCurrent,
      },
      owned,
      groups.get(combatant.id)
    )
  )
  return {
    ...identity(input.zone),
    reveal: "revealed",
    party: false,
    hop: null,
    occupants,
    summary: occupancySummary(occupants),
  }
}
