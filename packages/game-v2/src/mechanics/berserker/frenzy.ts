import { z } from "zod/v4"

import type {
  MechanicDefinition,
  MechanicEffect,
} from "@workspace/game-v2/mechanics/definition"

/**
 * Berserker — Frenzy. A 0–5 Pain Meter plus a Frenzy Mode flag (rulebook
 * `Frenzy.md`). Pain builds as the Berserker takes damage (tracked manually);
 * with at least 1 Pain they enter Frenzy Mode and add 1d4 per Pain to each
 * Physical damage roll. Pain ticks down at end of turn, exiting Frenzy at 0.
 *
 * Only the Physical damage bonus is engine-visible — it emits a single damage
 * {@link MechanicEffect} the PR7 damage resolver folds into the Skill card. The
 * other Frenzy benefits are narrative.
 */
export const FRENZY_PAIN_MAX = 5

/** The d4-per-Pain Physical damage bonus dealt while in Frenzy Mode. */
export const FRENZY_DAMAGE_DIE = 4

export const frenzyStateSchema = z.object({
  kind: z.literal("frenzy"),
  pain: z.number().int().min(0).max(FRENZY_PAIN_MAX),
  frenzyMode: z.boolean(),
})
export type FrenzyState = z.infer<typeof frenzyStateSchema>

/**
 * Adjusts the Pain Meter, clamped to 0–{@link FRENZY_PAIN_MAX}. Reaching 0 forces
 * Frenzy Mode off (the same transition the end-of-turn decrement uses). Pure.
 */
export function adjustPain(state: FrenzyState, delta: number): FrenzyState {
  const pain = Math.max(0, Math.min(FRENZY_PAIN_MAX, state.pain + delta))
  return { ...state, pain, frenzyMode: pain === 0 ? false : state.frenzyMode }
}

/**
 * Sets Frenzy Mode. Entering requires at least 1 Pain; exiting is always allowed.
 * Pure.
 */
export function setFrenzyMode(state: FrenzyState, on: boolean): FrenzyState {
  return { ...state, frenzyMode: on && state.pain > 0 }
}

/** The serializable write descriptors (CD19) over the two pure transitions. */
export const frenzyTransitionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("adjustPain"), delta: z.number().int() }),
  z.object({ op: z.literal("setFrenzyMode"), value: z.boolean() }),
])
export type FrenzyTransition = z.infer<typeof frenzyTransitionSchema>

export const frenzy: MechanicDefinition<FrenzyState, FrenzyTransition> = {
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
  transitions: {
    schema: frenzyTransitionSchema,
    apply: (state, transition) =>
      transition.op === "adjustPain"
        ? adjustPain(state, transition.delta)
        : setFrenzyMode(state, transition.value),
  },
  resetOn: "encounter",
}
