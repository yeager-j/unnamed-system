import type { MapZoneMood, MapZoneMotif } from "@workspace/game-v2/spatial"

import type { Pool } from "@/domain/pool"

import type { ZoneSize } from "./footprints"

/**
 * The **view vocabulary** the tiered set-piece card renders (Dungeon Visual
 * Overhaul §D3). It lives in `domain/map/view/` — not the engine (which assigns
 * `size`/`motif`/`mood` no mechanical meaning) and not the kit (which is
 * engine-free and imports these types *downward*). `ZoneMotif`/`ZoneMood`
 * **alias** the engine enums exactly as {@link ZoneSize} aliases `MapZoneSize`,
 * so there is no parallel union to keep in correspondence.
 *
 * The card is decided once and rendered by five node wrappers (template editor,
 * DM explore, DM combat, watch explore, watch combat); each hands the kit a
 * finished {@link ZoneSetPieceView} built by the `domain/dungeon/view` builders.
 */

/** The 10 authored zone motifs, re-exported for domain readers + the kit. */
export type ZoneMotif = MapZoneMotif
/** The 3 authored zone moods, re-exported for domain readers + the kit. */
export type ZoneMood = MapZoneMood

/** A token's allegiance on the card — the display collapse of the engine's
 *  combat sides + exploration party membership. Drives the tint channel. */
export type SetPieceFaction = "party" | "hostile" | "neutral"

/**
 * One occupant of a zone — the single source for every tier's rendering: the
 * Marquee pips, the Stage avatar chips, and the Closeup token grid all read this
 * one shape. `owned` is the viewer's stake (gold treatment; **0..n** per zone —
 * a viewer may own several party tokens). `engagementGroup` is a melee-cluster id
 * assigned **only to multi-member clusters** (§D3) — the connected-cluster
 * partition returns Free combatants as singletons, and a singleton is not a melee.
 */
export interface SetPieceOccupant {
  /** Stable React key (the character/participant id). */
  key: string
  name: string
  initials: string
  portraitUrl: string | null
  faction: SetPieceFaction
  /** Belongs to the signed-in viewer — the gold self-tint (0..n per zone). */
  owned: boolean
  /** Combat: the token whose turn it is — the white acting ring (distinct from gold). */
  acting?: boolean
  /** Combat melee-cluster id; present only for multi-member clusters (§D3). */
  engagementGroup?: number
  /** Current/max HP for the Closeup bar; absent ⇒ redacted (no bar, never `0/0`). */
  hp?: Pool
  /** Current/max SP for the Closeup bar; party members only. */
  sp?: Pool
}

/** The range-lens badge for a zone (§D5) — `null` ⇒ unreachable, no badge.
 *  Populated only from P3's range lens; P1b leaves it `null`. */
export interface ZoneSetPieceHop {
  label: string
  origin: boolean
}

/**
 * A zone as the tiered card renders it. Identity fields (`size`/`motif`/`mood`)
 * default render-side (`?? "M"` / no glyph / no wash). `reveal` is `"revealed"`
 * on every watch payload (unrevealed zones are structurally absent there) and on
 * templates; only the DM explore board passes `"unmapped"`.
 */
export interface ZoneSetPieceView {
  name: string
  description: string
  size?: ZoneSize
  motif?: ZoneMotif
  mood?: ZoneMood
  reveal: "revealed" | "unmapped"
  /** The party stands here — the gold keyline channel (styled in P3). */
  party: boolean
  /** Range-lens badge (§D5); `null` until P3 populates it. */
  hop: ZoneSetPieceHop | null
  occupants: SetPieceOccupant[]
  /** The occupancy teaser line ("2 hostiles", "Combat · 4 v 4", ""). */
  summary: string
  /** The zone carries DM notes — the Stage note glyph, DM surfaces only. */
  hasDmNotes?: boolean
}
