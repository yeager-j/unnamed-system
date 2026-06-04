import { getArchetype } from "@/lib/game/archetypes"
import type { AttributeScores, HydratedCharacter } from "@/lib/game/character"
import type { Affinity, AffinityDamageType } from "@/lib/game/combat"
import { getEnemy } from "@/lib/game/enemies"

import { combatantName } from "./console-view"
import { fallenCombatantIds } from "./fallen"
import type {
  Combatant,
  CombatSession,
  CombatSide,
  Engagement,
} from "./session"

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
  zoneId: string
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

/** The per-combatant detail the drawer header + read-only sections render. PC
 *  and enemy variants differ only in what their vitals source can supply (a PC
 *  has SP + identity; an enemy may lack a level and an affinity chart). */
export type CombatantDetail =
  | {
      kind: "pc"
      id: string
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
    }

function isDowned(combatant: Combatant): boolean {
  return combatant.ailments.includes("downed")
}

/** A catalog enemy's current HP is unknown until working HP lands, so its bar
 *  reads full (`current === max`); an inline enemy carries real current/max. */
function enemyHp(combatant: Combatant): Pool {
  const ref = combatant.ref
  if (ref.kind === "enemy") {
    return { current: ref.statBlock.currentHP, max: ref.statBlock.maxHP }
  }
  // catalog-enemy
  const max =
    ref.kind === "catalog-enemy" ? (getEnemy(ref.enemyKey)?.maxHP ?? 0) : 0
  return { current: max, max }
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
  currentActorId: string | null
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
    zoneId: combatant.zoneId,
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
    railRow(combatant, pcDetailById, fallenIds, session.currentActorId)
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

  if (ref.kind === "pc") {
    const detail = pcDetailById[ref.characterId]
    return {
      kind: "pc",
      id: combatant.id,
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
    }
  }

  // inline enemy stat block (UNN-299 provisional: no level, no affinity chart)
  return {
    kind: "enemy",
    id: combatant.id,
    name,
    side: combatant.side,
    level: null,
    hp: enemyHp(combatant),
    attributes: ref.statBlock.attributes,
    affinities: null,
  }
}
