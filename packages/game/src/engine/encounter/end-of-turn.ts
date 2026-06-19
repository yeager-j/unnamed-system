import { type GameData } from "@workspace/game/engine/ports"
import {
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  type BattleConditionAxisKey,
  type BattleConditionFlagKey,
} from "@workspace/game/foundation/character/state"
import {
  AILMENT_KEYS,
  type AilmentKey,
} from "@workspace/game/foundation/combat/ailments"
import type {
  Combatant,
  CombatantRef,
  CombatSession,
} from "@workspace/game/foundation/encounter/session"
import { type ActiveMechanic } from "@workspace/game/foundation/mechanics/schema"

/**
 * The content the end-of-turn review surfaces for the combatant whose turn just
 * ended (UNN-310) — *content only*; the modal that renders it and the
 * obligations plumbing are UNN-317.
 *
 * - `heldFlags` — Charged / Concentrating that are still set. Each is a
 *   **non-blocking** "held" reminder ("carries to next attack — clear it when
 *   spent"): these flags never auto-consume or auto-clear (UNN-294 policy), so
 *   the review only *reminds*; it writes nothing and does not clear the flag.
 * - `activeDurations` — axes with a positive remaining countdown, in canonical
 *   axis order, the "Durations" review row UNN-317 will render.
 */
export interface EndOfTurnReminders {
  heldFlags: BattleConditionFlagKey[]
  activeDurations: { axis: BattleConditionAxisKey; turns: number }[]
}

/** Computes the {@link EndOfTurnReminders} for a combatant — a pure projection
 *  over its battle-condition overlay. */
export function endOfTurnReminders(combatant: Combatant): EndOfTurnReminders {
  const heldFlags = BATTLE_CONDITION_FLAG_KEYS.filter(
    (flag) => combatant.battleConditions[flag]
  )

  const activeDurations = BATTLE_CONDITION_AXIS_KEYS.flatMap((axis) => {
    const turns = combatant.conditionDurations[axis]
    // Stryker disable next-line LogicalOperator,ConditionalExpression,EqualityOperator: equivalent — these mutants only diverge for a negative `turns`, but a duration countdown is never negative (it is deleted at 0 by reduceTurnEvent); the leading `turns &&` already excludes undefined and 0.
    return turns && turns > 0 ? [{ axis, turns }] : []
  })

  return { heldFlags, activeDurations }
}

/**
 * A single Ailment's end-of-turn HP delta (rulebook 3.7), **rounded down**: Burn
 * deals 10% of max HP, Sleep recovers 10% of max HP, everything else is 0.
 * Despair (−5% max SP) is intentionally absent — it never resolves to an HP
 * change, and SP is never auto-applied (enemies carry no SP; a PC's is a
 * reminder). Floors at the integer-percentage precedent in `skills/utils.ts`.
 */
export function ailmentHpDelta(ailment: AilmentKey, maxHP: number): number {
  const tenPercent = Math.floor((maxHP * 10) / 100)
  if (ailment === "burn") return -tenPercent
  if (ailment === "sleep") return tenPercent
  return 0
}

/**
 * One non-Downed Ailment the end-of-turn review surfaces for the just-acted
 * combatant. Every entry carries a saving-throw prompt (the DM rolls `1d20 + Lu`
 * and clears it on a pass); `apply` is the ready-to-dispatch
 * {@link import("./reduce/enemy-vitals").reduceEnemyVitalsEvent} HP write for an
 * **enemy** carrying Burn/Sleep, and `null` otherwise — a PC (vitals on the
 * character row, applied via the pools panel), Despair (no SP to drain on an
 * enemy), a non-HP ailment, or a zero delta.
 */
export interface EndOfTurnAilment {
  ailment: AilmentKey
  apply: { field: "currentHP"; value: number; delta: number } | null
}

/**
 * The full end-of-turn obligations for the combatant whose turn just ended
 * (UNN-317): a per-Ailment list (each a saving-throw prompt, some an enemy HP
 * Apply), plus the duration-tick and held-flag FYIs from
 * {@link endOfTurnReminders}. The DM panel renders these after "End turn" and
 * before drafting the next actor.
 */
export interface EndOfTurnObligations {
  ailments: EndOfTurnAilment[]
  activeDurations: { axis: BattleConditionAxisKey; turns: number }[]
  heldFlags: BattleConditionFlagKey[]
  /**
   * Set when the just-acted combatant is a Berserker **in Frenzy Mode**: the DM
   * is reminded to decrement their Pain (1 per turn; Frenzy exits at 0,
   * rulebook `Frenzy.md`). `pain` is the value *before* the decrement, so the
   * modal can spell out "now N → N−1". Pain lives on the character row, not the
   * session, so it's looked up from `pcMechanicByCharacterId` rather than the
   * combatant overlay. `null` when the actor is not a Berserker in Frenzy.
   */
  frenzy: { pain: number } | null
}

/** The working HP an enemy combatant Apply targets — inline enemies carry it on
 *  their stat block, catalog enemies inline on the ref (defaulting to the
 *  definition's max). `null` for a PC: its vitals never travel as a session
 *  event, so there is nothing to Apply. */
function enemyWorkingHP(
  ref: CombatantRef,
  getEnemy: GameData["getEnemy"]
): { maxHP: number; currentHP: number } | null {
  if (ref.kind === "enemy") {
    return { maxHP: ref.statBlock.maxHP, currentHP: ref.statBlock.currentHP }
  }
  // Stryker disable next-line ConditionalExpression: equivalent — a `pc` ref reaching here carries no `maxHP`/`currentHP`/`enemyKey`, so treating it as a catalog-enemy resolves to `{ maxHP: 0, currentHP: 0 }`, which yields a 0 ailment delta and thus `apply: null` — identical to the `null` the pc path returns.
  if (ref.kind === "catalog-enemy") {
    const maxHP = ref.maxHP ?? getEnemy(ref.enemyKey)?.maxHP ?? 0
    return { maxHP, currentHP: ref.currentHP ?? maxHP }
  }
  return null
}

/** The enemy HP {@link EndOfTurnAilment.apply} for one Ailment, or `null` when it
 *  has no auto-applicable HP effect on this actor. */
function resolveAilmentApply(
  ailment: AilmentKey,
  hp: { maxHP: number; currentHP: number } | null
): EndOfTurnAilment["apply"] {
  if (hp === null) return null
  const delta = ailmentHpDelta(ailment, hp.maxHP)
  if (delta === 0) return null
  const value = Math.max(0, Math.min(hp.maxHP, hp.currentHP + delta))
  return { field: "currentHP", value, delta }
}

/**
 * Computes the {@link EndOfTurnObligations} for the actor whose turn just ended,
 * read from the **post-`endTurn`** session (durations are already ticked by
 * `reduceTurnEvent`). Curried deps-first ({@link createGameEngine} binds
 * `getEnemy` for the catalog-enemy max fallback). Downed is excluded — it clears
 * at the *start* of the actor's next turn, not via a saving throw. An unknown
 * `actorId`, or a combatant with no ailments and no ticked durations, yields an
 * empty result.
 */
export function endOfTurnObligations(lookups: Pick<GameData, "getEnemy">) {
  return (
    session: CombatSession,
    actorId: string,
    pcMechanicByCharacterId: Record<string, ActiveMechanic | null> = {}
  ): EndOfTurnObligations => {
    const actor = session.combatants.find(
      (combatant) => combatant.id === actorId
    )
    if (actor === undefined) {
      return { ailments: [], activeDurations: [], heldFlags: [], frenzy: null }
    }

    const hp = enemyWorkingHP(actor.ref, lookups.getEnemy)
    const ailments = actor.ailments
      .filter(
        (key): key is AilmentKey =>
          key !== "downed" && (AILMENT_KEYS as readonly string[]).includes(key)
      )
      .map((ailment) => ({ ailment, apply: resolveAilmentApply(ailment, hp) }))

    const { activeDurations, heldFlags } = endOfTurnReminders(actor)
    const frenzy = resolveFrenzyReminder(actor.ref, pcMechanicByCharacterId)
    return { ailments, activeDurations, heldFlags, frenzy }
  }
}

/** The Frenzy decrement reminder for a PC actor — `{ pain }` when their active
 *  mechanic is Frenzy *in Frenzy Mode*, `null` otherwise (enemy, non-Berserker,
 *  or a Berserker not currently in Frenzy). */
function resolveFrenzyReminder(
  ref: CombatantRef,
  pcMechanicByCharacterId: Record<string, ActiveMechanic | null>
): { pain: number } | null {
  // Stryker disable next-line ConditionalExpression: equivalent — a non-pc ref has no `characterId`, so the lookup below misses (`pcMechanicByCharacterId[undefined]` → undefined) and the next guard returns null anyway; the kind check is a type narrow, not a behavioral gate.
  if (ref.kind !== "pc") return null
  const mechanic = pcMechanicByCharacterId[ref.characterId]
  if (mechanic?.state.kind !== "frenzy") return null
  if (!mechanic.state.frenzyMode) return null
  return { pain: mechanic.state.pain }
}
