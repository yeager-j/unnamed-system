import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { combatantName } from "@workspace/game/engine/encounter/console-view"
import { fallenCombatantIds } from "@workspace/game/engine/encounter/fallen"
import {
  resolveCombatantEngagement,
  type CombatantEngagement,
} from "@workspace/game/engine/encounter/resolve-engagement"
import { adjacentZones } from "@workspace/game/engine/encounter/zone-graph"
import { type AttributeScores } from "@workspace/game/foundation/archetypes/schema"
import { type HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import { type BattleConditions } from "@workspace/game/foundation/character/state"
import {
  type Affinity,
  type AffinityDamageType,
} from "@workspace/game/foundation/combat/affinity"
import { type Counters } from "@workspace/game/foundation/combat/counters"
import type {
  Combatant,
  CombatSession,
  CombatSide,
  ConditionDurations,
  Engagement,
  Zone,
} from "@workspace/game/foundation/encounter/session"

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
 * a lean slice, so a loaded hydrated character is directly assignable, plus
 * `className`: the active Archetype's **resolved display name**, injected at the
 * assembly boundary (UNN-354) so {@link combatantDetail} reads a plain field
 * instead of looking the Archetype up in the catalog. `skills` carries the PC's
 * hydrated Skill cards so the drawer can render them (UNN-367) — derived with the
 * encounter's `partyComposition` context at the boundary, so the
 * `perPartyLineage` Attack-Roll scalers (Magic Circle / Ailment Boost) show their
 * encounter-scaled values. The client payload still skips the inventory/child
 * rows the console never renders.
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
  | "skills"
  // The vitals-class optimistic token the DM's HP/SP pools writes condition on
  // (UNN-309) — the only version the combat console touches.
  | "vitalsVersion"
> & {
  /** The active Archetype's display name (or `null` when none), resolved at the
   *  boundary so the drawer needn't reach into the Archetype catalog. */
  className: string | null
}

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
  /** Named counters (Lumina, …), sparse — drives the rail's Illuminated badge. */
  counters: Counters
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
  /** Named counters (Lumina, …), sparse — absent key ⇒ 0. */
  counters: Counters
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
        /** The PC's hydrated Skill cards, derived with the encounter's
         *  `partyComposition` so the `perPartyLineage` Attack-Roll scalers show
         *  their scaled values (UNN-367). The drawer renders them as {@link
         *  SkillRow}s — the PC peer of the enemy arm's {@link Statblock} skills. */
        skills: PcCombatantDetail["skills"]
      }
    | {
        kind: "enemy"
        id: string
        name: string
        side: CombatSide
        hp: Pool
        /** The enemy's resolved {@link Statblock} (attributes, affinity chart,
         *  hydrated skills, abilities, level) — the same model the catalog browse
         *  statblock renders. The session overlay (working HP, ailments,
         *  position) layers on top; working HP stays on {@link hp}. */
        statblock: Statblock
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
    counters: combatant.counters,
  }
}

/** An inline enemy carries current/max on its stat block; a catalog enemy
 *  carries working HP inline on the ref, each value defaulting to the
 *  definition's `maxHP` until first adjusted (UNN-309). Exported so the player
 *  snapshot projection reuses the same catalog-working-HP-default rule rather
 *  than duplicating it (UNN-322/324). */
export function enemyHp(
  combatant: Combatant,
  enemyStatblockById: Record<string, Statblock>
): Pool {
  const ref = combatant.ref
  if (ref.kind === "enemy") {
    return { current: ref.statBlock.currentHP, max: ref.statBlock.maxHP }
  }
  // Stryker disable next-line ConditionalExpression: equivalent — the `enemy` branch already returned and enemyHp is only ever called for an enemy/catalog-enemy ref, so a catalog-enemy is the only kind that reaches here.
  if (ref.kind === "catalog-enemy") {
    const definitionMax = enemyStatblockById[ref.enemyKey]?.maxHP ?? 0
    return {
      current: ref.currentHP ?? definitionMax,
      max: ref.maxHP ?? definitionMax,
    }
  }
  // Stryker disable next-line ObjectLiteral: equivalent — unreachable: enemyHp is only called for enemy / catalog-enemy refs (a PC's pools come from pcPool).
  return { current: 0, max: 0 }
}

const ZERO_ATTRIBUTES: AttributeScores = {
  strength: 0,
  magic: 0,
  agility: 0,
  luck: 0,
}

/** A minimal {@link Statblock} for a provisional inline enemy (or a catalog ref
 *  whose definition can't be resolved): flat Attributes + working HP only, with
 *  no level, affinity chart, structured skills, or abilities yet (UNN-299).
 *  Working HP rides on the {@link CombatantDetail}'s `hp` pool, not here. */
function inlineEnemyStatblock(
  name: string,
  attributes: AttributeScores = ZERO_ATTRIBUTES
): Statblock {
  return {
    source: "enemy",
    name,
    level: null,
    attributes,
    maxHP: 0,
    affinities: null,
    skills: [],
    talents: [],
    weaponAttackRoll: null,
    abilities: null,
  }
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
  enemyStatblockById: Record<string, Statblock>,
  fallenIds: Set<string>,
  currentActorId: string | null,
  zones: CombatSession["zones"]
): RailRow {
  const ref = combatant.ref
  const isPc = ref.kind === "pc"
  // Stryker disable next-line ConditionalExpression: equivalent — an enemy ref has no characterId, so pcDetailById[undefined] is undefined either way; pcDetail is read only when isPc.
  const pcDetail = ref.kind === "pc" ? pcDetailById[ref.characterId] : undefined

  return {
    id: combatant.id,
    name: combatantName(combatant, pcDetailById, enemyStatblockById),
    side: combatant.side,
    isPc,
    isCurrent: combatant.id === currentActorId,
    hasActed: combatant.hasActedThisRound,
    isFallen: fallenIds.has(combatant.id),
    isDowned: isDowned(combatant),
    hp: isPc ? pcPool(pcDetail, "hp") : enemyHp(combatant, enemyStatblockById),
    // Stryker disable next-line StringLiteral: equivalent — pcPool returns the SP pool for any non-"hp" kind.
    sp: isPc ? pcPool(pcDetail, "sp") : null,
    portraitUrl: pcDetail?.portraitUrl ?? null,
    engagement: combatant.engagement,
    zoneName: zones[combatant.zoneId]?.name ?? null,
    reactionAvailable: combatant.reactionAvailable,
    counters: combatant.counters,
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
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): RosterView {
  const fallenIds = fallenCombatantIds(
    session,
    pcCurrentHpById(pcDetailById),
    enemyStatblockById
  )
  const rows = session.combatants.map((combatant) =>
    railRow(
      combatant,
      pcDetailById,
      enemyStatblockById,
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
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): CombatantDetail | null {
  const combatant = session.combatants.find((c) => c.id === combatantId)
  if (!combatant) return null

  const ref = combatant.ref
  const name = combatantName(combatant, pcDetailById, enemyStatblockById)
  const overlay = combatantOverlay(combatant)
  const position = combatantPosition(session, combatant)
  const engagement = resolveCombatantEngagement(
    session,
    combatant,
    pcDetailById,
    enemyStatblockById
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
      className: detail?.className ?? null,
      pronouns: detail?.pronouns ?? null,
      portraitUrl: detail?.portraitUrl ?? null,
      hp: pcPool(detail, "hp"),
      // Stryker disable next-line StringLiteral: equivalent — pcPool returns the SP pool for any non-"hp" kind.
      sp: pcPool(detail, "sp"),
      attributes: detail?.attributes ?? {
        strength: 0,
        magic: 0,
        agility: 0,
        luck: 0,
      },
      affinities: detail?.affinityChart ?? {},
      skills: detail?.skills ?? [],
    }
  }

  if (ref.kind === "catalog-enemy") {
    return {
      ...overlay,
      position,
      engagement,
      kind: "enemy",
      id: combatant.id,
      name,
      side: combatant.side,
      hp: enemyHp(combatant, enemyStatblockById),
      statblock: enemyStatblockById[ref.enemyKey] ?? inlineEnemyStatblock(name),
    }
  }

  // inline enemy stat block (UNN-299 provisional: flat Attributes + working HP
  // only — no level, affinity chart, structured skills, or abilities yet)
  return {
    ...overlay,
    position,
    engagement,
    kind: "enemy",
    id: combatant.id,
    name,
    side: combatant.side,
    hp: enemyHp(combatant, enemyStatblockById),
    statblock: inlineEnemyStatblock(name, ref.statBlock.attributes),
  }
}
