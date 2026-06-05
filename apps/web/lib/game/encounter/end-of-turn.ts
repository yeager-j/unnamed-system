import {
  BATTLE_CONDITION_AXIS_KEYS,
  type BattleConditionAxisKey,
  type BattleConditionFlagKey,
} from "@/lib/game/character"

import type { Combatant } from "./session"

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

const HELD_FLAGS = ["charged", "concentrating"] as const

/** Computes the {@link EndOfTurnReminders} for a combatant — a pure projection
 *  over its battle-condition overlay. */
export function endOfTurnReminders(combatant: Combatant): EndOfTurnReminders {
  const heldFlags = HELD_FLAGS.filter(
    (flag) => combatant.battleConditions[flag]
  )

  const activeDurations = BATTLE_CONDITION_AXIS_KEYS.flatMap((axis) => {
    const turns = combatant.conditionDurations[axis]
    return turns && turns > 0 ? [{ axis, turns }] : []
  })

  return { heldFlags, activeDurations }
}
