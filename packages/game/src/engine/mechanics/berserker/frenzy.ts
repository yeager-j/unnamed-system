import type {
  MechanicDefinition,
  MechanicEffect,
} from "@workspace/game/engine/mechanics/types"
import {
  FRENZY_PAIN_MAX,
  frenzyStateSchema,
  type FrenzyState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * Berserker — Frenzy. A 0–5 **Pain Meter** plus a **Frenzy Mode** flag
 * (rulebook `Skills/Mechanics/Frenzy.md`). Pain builds as the Berserker takes
 * damage (tracked manually, like Valor — the app never auto-applies it); with
 * at least 1 Pain they enter Frenzy Mode and add **1d4 per Pain to each of
 * their Physical damage rolls**. Pain ticks down 1 at the end of each of their
 * turns, exiting Frenzy at 0.
 *
 * Only the Physical damage bonus is engine-visible — it emits a single
 * {@link import("@workspace/game/foundation/combat/effects").DamageEffect}
 * the resolver folds into the Skill card. The other Frenzy-Mode benefits
 * (per-Skill riders, LOOK AT ME!, the Fallen save) are narrative and surfaced
 * on the widget, not modelled as data.
 */

/** The d4-per-Pain Physical damage bonus dealt while in Frenzy Mode. */
export const FRENZY_DAMAGE_DIE = 4

/**
 * Adjusts the Pain Meter, clamped to 0–{@link FRENZY_PAIN_MAX}. Reaching 0
 * forces Frenzy Mode off (rulebook: "exiting Frenzy Mode when you hit 0") —
 * the same transition the end-of-turn decrement uses. Pure; the owner-mode
 * stepper composes it through {@link applyMechanicStateForCharacter}.
 */
export function adjustPain(state: FrenzyState, delta: number): FrenzyState {
  const pain = Math.max(0, Math.min(FRENZY_PAIN_MAX, state.pain + delta))
  return { ...state, pain, frenzyMode: pain === 0 ? false : state.frenzyMode }
}

/**
 * Sets Frenzy Mode. Entering requires at least 1 Pain ("if you have at least 1
 * Pain, you can enter into Frenzy Mode"); exiting is always allowed. Pure.
 */
export function setFrenzyMode(state: FrenzyState, on: boolean): FrenzyState {
  return { ...state, frenzyMode: on && state.pain > 0 }
}

export const frenzy: MechanicDefinition<FrenzyState> = {
  kind: "frenzy",
  displayName: "Frenzy",
  tagline:
    "Build a 0–5 Pain Meter as you take damage, then enter Frenzy Mode to turn it into raw power.",
  description: `You channel your pain and release it in an explosive burst of anger. You have a Pain Meter (max ${FRENZY_PAIN_MAX}) that increases as you take damage. When you've had enough, you can consume the built-up Pain and enter into Frenzy Mode. Your Pain Meter resets to 0 when combat ends.

***Pain Meter.*** When you take damage (HP costs are not damage), you gain 1 Pain. If that damage Downed you, you gain an additional 1 Pain. If that damage was more than 25% of your max HP, you gain an additional 1 Pain (all of these sources stack). If you recover HP, your Pain is reset to 0 (also exits Frenzy Mode).

***Frenzy Mode.*** During your turn, if you have at least 1 Pain, you can enter into Frenzy Mode (this does not require an action). While in Frenzy Mode, your Skills have additional effects and you add **\`1d4\`** to each of your Physical damage rolls per Pain. You cannot gain Pain while in Frenzy Mode. If you would become Fallen while in Frenzy Mode, make a saving throw. On a success, drop to 1 HP instead. You lose 1 Pain at the end of each of your turns, exiting Frenzy Mode when you hit 0.

***LOOK AT ME!*** In addition to normal opportunity attack rules, if an enemy you are Engaged with targets a creature other than you for an attack, you can use your Reaction to make an opportunity attack against them.`,
  schema: frenzyStateSchema,
  initialState: () => ({ kind: "frenzy", pain: 0, frenzyMode: false }),
  effects(state): MechanicEffect[] {
    if (!state.frenzyMode || state.pain === 0) return []
    return [
      {
        type: "damage",
        when: { deliveries: ["physical"] },
        dice: { count: state.pain, sides: FRENZY_DAMAGE_DIE },
        source: `Frenzy (Pain ${state.pain})`,
      },
    ]
  },
  resetOn: "encounter",
}
