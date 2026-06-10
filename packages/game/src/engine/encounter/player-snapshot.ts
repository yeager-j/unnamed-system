import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { combatantName } from "@workspace/game/engine/encounter/console-view"
import {
  enemyHp,
  type PcCombatantDetail,
  type Pool,
} from "@workspace/game/engine/encounter/roster-view"
import { type AttributeScores } from "@workspace/game/foundation/archetypes/schema"
import { type BattleConditions } from "@workspace/game/foundation/character/state"
import { type Counters } from "@workspace/game/foundation/combat/counters"
import type {
  Combatant,
  CombatSession,
  CombatSide,
  Zone,
} from "@workspace/game/foundation/encounter/session"
import type { EncounterStatus } from "@workspace/game/foundation/encounter/status"

/**
 * The **player watch view's** wire payload (UNN-322) and its server-side
 * **visibility model** (UNN-324). A pure projection of a {@link CombatSession}
 * down to exactly what a signed-out spectator may see: turn order, the current
 * actor, the zone map, and per-combatant HP/SP + the overlay (ailments, battle
 * conditions). It is the redacted peer of the DM's {@link
 * import("./roster-view").buildRosterView} — the DM reads the full session
 * directly; the player only ever receives this.
 *
 * **Redaction is structural.** A PC is fully visible (HP/SP/attributes); an
 * enemy's {@link PlayerVisibleCombatant} arm has **no `attributes` or
 * `affinities` keys at all** — the projection never writes them, so they are
 * absent from the JSON a player's browser receives (not present as `null`). The
 * compiler enforces this: were the enemy arm to gain an affinities field, the
 * absence would type-check as missing. This is why an enemy's Affinity chart is
 * kept structured (ADR Decision 7) — so it can be cleanly withheld here.
 */

/** One combatant as the player sees it. The PC arm carries full vitals +
 *  attributes; the enemy arm carries HP/SP only — **never** attributes or
 *  affinities (UNN-324). The shared base is everything safe for either side. */
interface PlayerCombatantBase {
  id: string
  name: string
  side: CombatSide
  zoneId: string
  hasActed: boolean
  isCurrent: boolean
  ailments: string[]
  battleConditions: BattleConditions
  /** Named counters (Lumina, …). Public — an Illuminated enemy lights up its Zone
   *  (rulebook Path of Dawn), so this is observable, not redacted enemy data. */
  counters: Counters
  /** The display names of the combatants this one is melee-locked with — empty
   *  when Free. Engagement is observable battlefield state (not hidden enemy
   *  data), so it is shown for both sides; target ids are resolved to names here
   *  so the card stays a dumb renderer. */
  engagedWith: string[]
}

export type PlayerVisibleCombatant =
  | (PlayerCombatantBase & {
      kind: "pc"
      hp: Pool
      sp: Pool
      attributes: AttributeScores
    })
  | (PlayerCombatantBase & {
      kind: "enemy"
      hp: Pool
      /** `null` for catalog enemies (the definition declares no SP); a `Pool`
       *  for an inline stat block that carries one. */
      sp: Pool | null
    })

/** The current actor as the watch header renders it, or `null` before anyone is
 *  drafted / between rounds. */
export interface PlayerCurrentActor {
  id: string
  name: string
  side: CombatSide
}

/**
 * The full redacted snapshot the watch page and the polling hook consume. Thin
 * and JSON-serializable end to end: `combatants` is in session (turn) order and
 * `zones` is the ordered zone list the map groups by.
 */
export interface EncounterSnapshot {
  status: EncounterStatus
  name: string
  /** The owning campaign's public `shortId`, for the watch view's back link. */
  campaignShortId: string
  /**
   * The encounter row's optimistic version token at projection time (UNN-371).
   * The watch hook compares it against realtime ping versions to decide
   * whether a refetch is needed — the same advisory number the invalidation
   * ping already publishes on the public channel, so it leaks nothing new.
   */
  version: number
  round: number
  currentActor: PlayerCurrentActor | null
  combatants: PlayerVisibleCombatant[]
  zones: Zone[]
}

/** A PC's current/max SP off its hydrated detail; `{0,0}` when the detail is
 *  missing (mirrors the rail's defensive defaults). */
function pcPool(
  detail: PcCombatantDetail | undefined,
  kind: "hp" | "sp"
): Pool {
  if (!detail) return { current: 0, max: 0 }
  return kind === "hp"
    ? { current: detail.currentHP, max: detail.maxHP }
    : { current: detail.currentSP, max: detail.maxSP }
}

/** An inline enemy's SP off its stat block; `null` for a catalog enemy (no SP)
 *  or a PC ref (unreachable here). */
function enemySp(combatant: Combatant): Pool | null {
  const ref = combatant.ref
  if (ref.kind === "enemy") {
    return { current: ref.statBlock.currentSP, max: ref.statBlock.maxSP }
  }
  return null
}

function projectCombatant(
  combatant: Combatant,
  currentActorId: string | null,
  nameById: Map<string, string>,
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): PlayerVisibleCombatant {
  const engagedWith =
    combatant.engagement.status === "engaged"
      ? combatant.engagement.targetCombatantIds.map(
          (id) => nameById.get(id) ?? id
        )
      : []

  const base: PlayerCombatantBase = {
    id: combatant.id,
    name: nameById.get(combatant.id) ?? combatant.id,
    side: combatant.side,
    zoneId: combatant.zoneId,
    hasActed: combatant.hasActedThisRound,
    isCurrent: combatant.id === currentActorId,
    ailments: combatant.ailments,
    battleConditions: combatant.battleConditions,
    counters: combatant.counters,
    engagedWith,
  }

  if (combatant.ref.kind === "pc") {
    const detail = pcDetailById[combatant.ref.characterId]
    return {
      ...base,
      kind: "pc",
      hp: pcPool(detail, "hp"),
      // Stryker disable next-line StringLiteral: equivalent — pcPool returns the SP pool for any non-"hp" kind, so mutating the "sp" literal selects the same branch.
      sp: pcPool(detail, "sp"),
      attributes: detail?.attributes ?? {
        strength: 0,
        magic: 0,
        agility: 0,
        luck: 0,
      },
    }
  }

  return {
    ...base,
    kind: "enemy",
    hp: enemyHp(combatant, enemyStatblockById),
    sp: enemySp(combatant),
  }
}

/**
 * Projects an encounter to its {@link EncounterSnapshot}. Pure: the impure shell
 * ({@link import("@/lib/db/queries/load-encounter-snapshot").getEncounterSnapshot})
 * loads the row and hydrates the PCs into `pcDetailById` (keyed by `characterId`,
 * exactly the console `live` branch's map) before calling this. Names resolve
 * through {@link combatantName} ({@link PcCombatantDetail} is structurally a
 * console-view `PcInfo`); enemy data is redacted by construction — see the
 * module doc.
 */
export function projectPlayerSnapshot(
  encounter: {
    name: string
    status: EncounterStatus
    campaignShortId: string
    version: number
    session: CombatSession
  },
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): EncounterSnapshot {
  const { session } = encounter
  const nameById = new Map(
    session.combatants.map((combatant) => [
      combatant.id,
      combatantName(combatant, pcDetailById, enemyStatblockById),
    ])
  )
  const actor = session.combatants.find(
    (combatant) => combatant.id === session.currentActorId
  )

  return {
    status: encounter.status,
    name: encounter.name,
    campaignShortId: encounter.campaignShortId,
    version: encounter.version,
    round: session.round,
    currentActor: actor
      ? {
          id: actor.id,
          name: nameById.get(actor.id) ?? actor.id,
          side: actor.side,
        }
      : null,
    combatants: session.combatants.map((combatant) =>
      projectCombatant(
        combatant,
        session.currentActorId,
        nameById,
        pcDetailById,
        enemyStatblockById
      )
    ),
    zones: Object.values(session.zones),
  }
}
