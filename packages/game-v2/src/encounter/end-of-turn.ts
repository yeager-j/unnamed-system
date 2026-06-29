import type { ResolvedActiveMechanic } from "@workspace/game-v2/mechanics/resolved"
import type { ResolvedVitals } from "@workspace/game-v2/vitals/resolved"

import type { ParticipantId } from "./ids"
import type { ParticipantView, ResolvedSession } from "./participant-view"
import {
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  type AilmentKey,
  type BattleConditionAxisKey,
  type BattleConditionFlagKey,
} from "./vocab"

/**
 * The end-of-turn review obligations for the participant whose turn just ended
 * (CD9/CD10) — **display-only producers**: the engine computes them but never
 * auto-applies them, exactly v1's parity-tracker scope. The DM reads them after
 * "End turn" and before drafting the next actor.
 */

/** A Battle-Condition duration still ticking — the axis and its turns remaining. */
export interface ActiveDuration {
  axis: BattleConditionAxisKey
  turns: number
}

/**
 * The held-flag + active-duration FYIs surfaced for a participant.
 *
 * - `heldFlags` — Charged / Concentrating still set, in canonical flag order. Each
 *   is a **non-blocking** reminder ("carries to next attack — clear it when
 *   spent"); these flags never auto-consume, so the review only *reminds*.
 * - `activeDurations` — axes with a positive remaining countdown, in canonical
 *   axis order.
 */
export interface EndOfTurnReminders {
  heldFlags: BattleConditionFlagKey[]
  activeDurations: ActiveDuration[]
}

/** Computes the {@link EndOfTurnReminders} for a participant — a pure projection
 *  over its battle-condition overlay (read off the merged view). */
export function endOfTurnReminders(
  participantView: ParticipantView
): EndOfTurnReminders {
  const { battleConditions, conditionDurations } = participantView.components

  const heldFlags = BATTLE_CONDITION_FLAG_KEYS.filter(
    (flag) => battleConditions[flag]
  )

  const activeDurations = BATTLE_CONDITION_AXIS_KEYS.flatMap((axis) => {
    const turns = conditionDurations[axis]
    return turns && turns > 0 ? [{ axis, turns }] : []
  })

  return { heldFlags, activeDurations }
}

/**
 * A single Ailment's end-of-turn HP delta (rulebook 3.7), **rounded down**: Burn
 * deals 10% of max HP, Sleep recovers 10% of max HP, everything else is 0. Despair
 * (−5% max SP) is intentionally absent — it never resolves to an HP change, and SP
 * is never auto-applied.
 */
export function ailmentHpDelta(ailment: AilmentKey, maxHP: number): number {
  const tenPercent = Math.floor((maxHP * 10) / 100)
  if (ailment === "burn") return -tenPercent
  if (ailment === "sleep") return tenPercent
  return 0
}

/**
 * The **uniform HP intent** the DM applies for an Ailment carrying an HP effect
 * (CD9, SUPERSEDE). `delta` is the signed change the write-router dispatches
 * (UNN-520) — it routes to the right storage home, so this producer is blind to
 * durable-vs-ephemeral; `value` is the engine-clamped preview the modal shows
 * (`clamp(currentHP + delta, 0, maxHP)`).
 */
export interface AilmentHpApply {
  delta: number
  value: number
}

/**
 * One non-Downed Ailment the end-of-turn review surfaces for the just-acted
 * participant. `apply` is the {@link AilmentHpApply} for Burn/Sleep on **any**
 * vitals-bearing participant — PC or enemy alike (the v1 "null for a PC" kind-gate
 * is gone; the write-router owns storage). It is `null` for a participant that
 * resolves no Vitals capability, for Despair (drains SP, never HP), for a non-HP
 * ailment, and for a zero delta.
 */
export interface EndOfTurnAilment {
  ailment: AilmentKey
  apply: AilmentHpApply | null
}

/**
 * The full end-of-turn obligations for the actor whose turn just ended: a
 * per-Ailment list (each Burn/Sleep an HP intent), the duration-tick + held-flag
 * FYIs from {@link endOfTurnReminders}, and a `frenzy` reminder. Read from the
 * **post-`endTurn`** session (durations already ticked by the turn reducer).
 */
export interface EndOfTurnObligations {
  ailments: EndOfTurnAilment[]
  activeDurations: ActiveDuration[]
  heldFlags: BattleConditionFlagKey[]
  /**
   * Set when the just-acted participant has an **active Frenzy mechanic in Frenzy
   * Mode**: the DM is reminded to decrement their Pain (1 per turn; Frenzy exits
   * at 0, rulebook `Frenzy.md`). `pain` is the value *before* the decrement, so
   * the modal can spell out "now N → N−1". `null` otherwise.
   */
  frenzy: { pain: number } | null
}

/** The HP {@link AilmentHpApply} for one Ailment, or `null` when it has no HP
 *  effect on this participant (no Vitals capability, or a zero delta). */
function resolveAilmentApply(
  ailment: AilmentKey,
  vitals: ResolvedVitals | undefined
): AilmentHpApply | null {
  if (vitals === undefined) return null
  const delta = ailmentHpDelta(ailment, vitals.maxHP)
  if (delta === 0) return null
  const value = Math.max(0, Math.min(vitals.maxHP, vitals.currentHP + delta))
  return { delta, value }
}

/** The Frenzy decrement reminder for the actor — `{ pain }` when its **active**
 *  mechanic is Frenzy *in Frenzy Mode*, `null` otherwise. The capability gate is
 *  the resolved `activeMechanics` read-unit itself: a non-Berserker actor (or a
 *  Berserker not in Frenzy) surfaces no active Frenzy mechanic, so v1's
 *  `ref.kind !== "pc"` gate dissolves. */
function frenzyReminder(
  active: readonly ResolvedActiveMechanic[]
): { pain: number } | null {
  const frenzy = active.find((mechanic) => mechanic.state.kind === "frenzy")
  if (frenzy?.state.kind !== "frenzy") return null
  if (!frenzy.state.frenzyMode) return null
  return { pain: frenzy.state.pain }
}

/**
 * Computes the {@link EndOfTurnObligations} for the actor whose turn just ended,
 * over the resolved-encounter view (UNN-525) — a pure function of the actor's
 * {@link ParticipantView}: resolved `vitals` (the ailment-delta maxHP), the overlay
 * battle-conditions, and the resolved `activeMechanics` read-unit (the Frenzy
 * reminder). Downed is excluded — it clears at the *start* of the actor's next turn,
 * not via a saving throw. An unknown `actorId` (no view for the actor) yields a
 * fully empty result (even when another participant has obligations).
 */
export function endOfTurnObligations(
  view: ResolvedSession,
  actorId: ParticipantId
): EndOfTurnObligations {
  const participantView = view.get(actorId)
  if (participantView === undefined) {
    return { ailments: [], activeDurations: [], heldFlags: [], frenzy: null }
  }

  const vitals = participantView.components.vitals
  const ailments = participantView.components.ailments
    .filter((ailment) => ailment !== "downed")
    .map((ailment) => ({
      ailment,
      apply: resolveAilmentApply(ailment, vitals),
    }))

  const { activeDurations, heldFlags } = endOfTurnReminders(participantView)
  const frenzy = frenzyReminder(
    participantView.components.activeMechanics ?? []
  )
  return { ailments, activeDurations, heldFlags, frenzy }
}
