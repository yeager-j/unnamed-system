import { getArchetype } from "@/lib/game/archetypes"
import type {
  AttributeScores,
  BattleConditions,
  HydratedCharacter,
  HydratedSkill,
} from "@/lib/game/character"
import type { Affinity, AffinityDamageType } from "@/lib/game/combat"
import { getEnemy, hydrateEnemySkills } from "@/lib/game/enemies"

import { combatantName } from "./console-view"
import { fallenCombatantIds } from "./fallen"
import {
  resolveCombatantEngagement,
  type CombatantEngagement,
} from "./resolve-engagement"
import type {
  Combatant,
  CombatSession,
  CombatSide,
  ConditionDurations,
  Engagement,
  Zone,
} from "./session"
import { adjacentZones } from "./zone-graph"

/**
 * The display projection the combatant **rail** and **detail drawer** render
 * from (UNN-345) — a pure view over a {@link CombatSession}, the rail/drawer
 * peer of {@link import("./console-view").buildConsoleView}. Runs client-side on
 * the optimistic session so acted / acting / Downed update instantly.
 *
 * Per-combatant data comes from two homes (ADR Decision 1): a **PC**'s identity,
 * vitals, attributes, and affinity chart live on its character row — the page
 * injects them as {@link PcCombatantDetail} (a narrowed {@link HydratedCharacter})
 * keyed by `characterId`; an **enemy**'s come from its inline stat block or, for a
 * catalog enemy, the hardcoded {@link getEnemy} definition.
 *
 * **Known gap — catalog-enemy working HP.** A `catalog-enemy` combatant carries
 * no current-HP field yet (the combatant schema has none; the ADR defers working
 * HP to a later catalog-HP ticket). Until then a catalog enemy renders its
 * **maxHP as a full bar** (`current === max`); inline enemies carry real
 * current/max on the stat block. The DM HP-adjust control (UNN-309) is blocked on
 * the same gap.
 */

/**
 * Exactly the {@link HydratedCharacter} fields the rail + drawer read off a PC —
 * a lean slice, so a loaded hydrated character is directly assignable (no
 * mapper) yet the client payload skips the skills/inventory/child rows the
 * console never renders.
 */
export type PcCombatantDetail = Pick<
  HydratedCharacter,
  | "id"
  | "name"
  | "pronouns"
  | "portraitUrl"
  | "level"
  | "currentHP"
  | "maxHP"
  | "currentSP"
  | "maxSP"
  | "attributes"
  | "affinityChart"
  | "activeArchetypeKey"
  // The vitals-class optimistic token the DM's HP/SP pools writes condition on
  // (UNN-309) — the only version the combat console touches.
  | "vitalsVersion"
>

/** A current/max pool, the shape both vitals bars render. */
export interface Pool {
  current: number
  max: number
}

/** A sparse affinity chart (absent damage type ⇒ Neutral) — the shape the
 *  read-only affinity grid consumes for both PCs (full) and catalog enemies
 *  (sparse). `null` for an inline enemy, whose provisional stat block has no
 *  affinity data yet (UNN-299). */
export type AffinityChart = Partial<Record<AffinityDamageType, Affinity>>

/** One combatant as a rail row. `sp` is `null` for enemies (the 5e stat blocks
 *  have no SP resource); `portraitUrl` is a PC's portrait (or `null` ⇒ the
 *  caller's gradient fallback) and always `null` for enemies. */
export interface RailRow {
  id: string
  name: string
  side: CombatSide
  /** Drives the token (PC ⇒ portrait/gradient, enemy ⇒ side-color initials) and
   *  the SP bar — keyed to ref *kind*, not side, so a charmed PC keeps both. */
  isPc: boolean
  isCurrent: boolean
  hasActed: boolean
  isFallen: boolean
  isDowned: boolean
  hp: Pool
  sp: Pool | null
  portraitUrl: string | null
  engagement: Engagement
  /** The combatant's zone *display name* (resolved from `session.zones`), or
   *  `null` when unplaced / unzoned — the rail renders the name, never the raw
   *  zone id. */
  zoneName: string | null
  reactionAvailable: boolean
}

/** The grouped rail: combatants split by side (session order preserved), plus
 *  the enemies-group "N/M Downed" rollup counts. */
export interface RosterView {
  players: RailRow[]
  enemies: RailRow[]
  enemyCount: number
  downedEnemyCount: number
}

/** A combatant's per-turn action economy (UNN-310) — non-enforcing tracking the
 *  DM eyeballs; reset to all-available at the start of a normal turn. */
export interface ActionEconomy {
  move: boolean
  standard: boolean
  reaction: boolean
}

/**
 * The editable session-overlay state both drawer arms render (UNN-310), read
 * straight off the combatant — identical for PCs and enemies (ADR Decision 1).
 * `conditionDurations` is sparse (absent axis ⇒ no active countdown).
 */
export interface CombatantOverlay {
  ailments: string[]
  battleConditions: BattleConditions
  conditionDurations: ConditionDurations
  actionEconomy: ActionEconomy
}

/**
 * A combatant's position for the drawer's move control (UNN-315): the zone it
 * occupies (`null` when unplaced or its `zoneId` is stale) and the zones it may
 * move to — the **adjacent** zones when placed (rulebook §3.5), or **all** zones
 * when unplaced (the initial-placement affordance for a mid-combat joiner).
 * `current` is never in `targets` (no self-loops — UNN-313).
 */
export interface CombatantPosition {
  current: Zone | null
  targets: Zone[]
}

/** The per-combatant detail the drawer header + sections render. PC and enemy
 *  variants differ only in what their vitals source can supply (a PC has SP +
 *  identity; an enemy may lack a level and an affinity chart); the editable
 *  {@link CombatantOverlay}, the {@link CombatantPosition} (`null` only when the
 *  encounter has no zones), and the {@link CombatantEngagement} are common to
 *  both. */
export type CombatantDetail = CombatantOverlay & {
  position: CombatantPosition | null
  engagement: CombatantEngagement
} & (
    | {
        kind: "pc"
        id: string
        /** The character-row id the pools actions write (≠ the combatant id). */
        characterId: string
        /** Vitals-class token for the DM's pools writes (UNN-309). */
        vitalsVersion: number
        name: string
        side: CombatSide
        level: number
        className: string | null
        pronouns: string | null
        portraitUrl: string | null
        hp: Pool
        sp: Pool
        attributes: AttributeScores
        affinities: AffinityChart
      }
    | {
        kind: "enemy"
        id: string
        name: string
        side: CombatSide
        level: number | null
        hp: Pool
        attributes: AttributeScores
        affinities: AffinityChart | null
        /** The catalog enemy's hydrated skills and its freeform `abilities`
         *  Markdown (both empty/`null` for an inline enemy). Hydrated against the
         *  enemy's flat Attributes (see {@link hydrateEnemySkills}) so the drawer
         *  reuses the shared `SkillCard` — same Attack Roll readout a character
         *  gets, with the cost row suppressed (enemies pay no Skill costs). */
        skills: HydratedSkill[]
        abilities: string | null
      }
  )

function isDowned(combatant: Combatant): boolean {
  return combatant.ailments.includes("downed")
}

/**
 * The combatant's position for the drawer move control (UNN-315). `null` when the
 * encounter defines no zones (theater of mind — nothing to move between). When
 * placed, `targets` are the adjacent zones (Travel, §3.5); when unplaced, every
 * zone (place a mid-combat joiner). See {@link CombatantPosition}.
 */
function combatantPosition(
  session: CombatSession,
  combatant: Combatant
): CombatantPosition | null {
  if (Object.keys(session.zones).length === 0) return null
  const current = session.zones[combatant.zoneId] ?? null
  const targets = current
    ? adjacentZones(session, current.id)
    : Object.values(session.zones)
  return { current, targets }
}

/** Projects the editable overlay off a combatant — the shared slice both drawer
 *  arms carry. */
function combatantOverlay(combatant: Combatant): CombatantOverlay {
  return {
    ailments: combatant.ailments,
    battleConditions: combatant.battleConditions,
    conditionDurations: combatant.conditionDurations,
    actionEconomy: {
      move: combatant.moveAvailable,
      standard: combatant.standardAvailable,
      reaction: combatant.reactionAvailable,
    },
  }
}

/** An inline enemy carries current/max on its stat block; a catalog enemy
 *  carries working HP inline on the ref, each value defaulting to the
 *  definition's `maxHP` until first adjusted (UNN-309). Exported so the player
 *  snapshot projection reuses the same catalog-working-HP-default rule rather
 *  than duplicating it (UNN-322/324). */
export function enemyHp(combatant: Combatant): Pool {
  const ref = combatant.ref
  if (ref.kind === "enemy") {
    return { current: ref.statBlock.currentHP, max: ref.statBlock.maxHP }
  }
  if (ref.kind === "catalog-enemy") {
    const definitionMax = getEnemy(ref.enemyKey)?.maxHP ?? 0
    return {
      current: ref.currentHP ?? definitionMax,
      max: ref.maxHP ?? definitionMax,
    }
  }
  return { current: 0, max: 0 }
}

function pcPool(
  detail: PcCombatantDetail | undefined,
  kind: "hp" | "sp"
): Pool {
  if (!detail) return { current: 0, max: 0 }
  return kind === "hp"
    ? { current: detail.currentHP, max: detail.maxHP }
    : { current: detail.currentSP, max: detail.maxSP }
}

function railRow(
  combatant: Combatant,
  pcDetailById: Record<string, PcCombatantDetail>,
  fallenIds: Set<string>,
  currentActorId: string | null,
  zones: CombatSession["zones"]
): RailRow {
  const ref = combatant.ref
  const isPc = ref.kind === "pc"
  const pcDetail = ref.kind === "pc" ? pcDetailById[ref.characterId] : undefined

  return {
    id: combatant.id,
    name: combatantName(combatant, pcDetailById),
    side: combatant.side,
    isPc,
    isCurrent: combatant.id === currentActorId,
    hasActed: combatant.hasActedThisRound,
    isFallen: fallenIds.has(combatant.id),
    isDowned: isDowned(combatant),
    hp: isPc ? pcPool(pcDetail, "hp") : enemyHp(combatant),
    sp: isPc ? pcPool(pcDetail, "sp") : null,
    portraitUrl: pcDetail?.portraitUrl ?? null,
    engagement: combatant.engagement,
    zoneName: zones[combatant.zoneId]?.name ?? null,
    reactionAvailable: combatant.reactionAvailable,
  }
}

/** PC current HP keyed by `characterId`, the input {@link fallenCombatantIds}
 *  takes (it can't read a PC's vitals off the session). */
function pcCurrentHpById(
  pcDetailById: Record<string, PcCombatantDetail>
): Record<string, number> {
  return Object.fromEntries(
    Object.values(pcDetailById).map((detail) => [detail.id, detail.currentHP])
  )
}

/**
 * Groups the session's combatants into the rail view: players and enemies in
 * session order, plus the enemies-group Downed rollup. Pure — recomputed on
 * every optimistic session change.
 */
export function buildRosterView(
  session: CombatSession,
  pcDetailById: Record<string, PcCombatantDetail>
): RosterView {
  const fallenIds = fallenCombatantIds(session, pcCurrentHpById(pcDetailById))
  const rows = session.combatants.map((combatant) =>
    railRow(
      combatant,
      pcDetailById,
      fallenIds,
      session.currentActorId,
      session.zones
    )
  )
  const enemies = rows.filter((row) => row.side === "enemies")

  return {
    players: rows.filter((row) => row.side === "players"),
    enemies,
    enemyCount: enemies.length,
    downedEnemyCount: enemies.filter((row) => row.isDowned).length,
  }
}

/**
 * The detail for one combatant (the drawer's data), or `null` when the id is
 * unknown. A PC resolves its class name through {@link getArchetype}; an enemy
 * draws level/attributes/affinities from its catalog definition (or just
 * attributes + current/max HP from an inline stat block).
 */
export function combatantDetail(
  session: CombatSession,
  combatantId: string,
  pcDetailById: Record<string, PcCombatantDetail>
): CombatantDetail | null {
  const combatant = session.combatants.find((c) => c.id === combatantId)
  if (!combatant) return null

  const ref = combatant.ref
  const name = combatantName(combatant, pcDetailById)
  const overlay = combatantOverlay(combatant)
  const position = combatantPosition(session, combatant)
  const engagement = resolveCombatantEngagement(
    session,
    combatant,
    pcDetailById
  )

  if (ref.kind === "pc") {
    const detail = pcDetailById[ref.characterId]
    return {
      ...overlay,
      position,
      engagement,
      kind: "pc",
      id: combatant.id,
      characterId: ref.characterId,
      vitalsVersion: detail?.vitalsVersion ?? 0,
      name,
      side: combatant.side,
      level: detail?.level ?? 1,
      className: detail?.activeArchetypeKey
        ? (getArchetype(detail.activeArchetypeKey)?.name ?? null)
        : null,
      pronouns: detail?.pronouns ?? null,
      portraitUrl: detail?.portraitUrl ?? null,
      hp: pcPool(detail, "hp"),
      sp: pcPool(detail, "sp"),
      attributes: detail?.attributes ?? {
        strength: 0,
        magic: 0,
        agility: 0,
        luck: 0,
      },
      affinities: detail?.affinityChart ?? {},
    }
  }

  if (ref.kind === "catalog-enemy") {
    const def = getEnemy(ref.enemyKey)
    return {
      ...overlay,
      position,
      engagement,
      kind: "enemy",
      id: combatant.id,
      name,
      side: combatant.side,
      level: def?.level ?? null,
      hp: enemyHp(combatant),
      attributes: def?.attributes ?? {
        strength: 0,
        magic: 0,
        agility: 0,
        luck: 0,
      },
      affinities: def?.affinities ?? null,
      skills: def ? hydrateEnemySkills(def) : [],
      abilities: def?.abilities ?? null,
    }
  }

  // inline enemy stat block (UNN-299 provisional: no level, no affinity chart,
  // no structured skills/abilities)
  return {
    ...overlay,
    position,
    engagement,
    kind: "enemy",
    id: combatant.id,
    name,
    side: combatant.side,
    level: null,
    hp: enemyHp(combatant),
    attributes: ref.statBlock.attributes,
    affinities: null,
    skills: [],
    abilities: null,
  }
}
