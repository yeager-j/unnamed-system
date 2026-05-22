import { z } from "zod/v4"

/**
 * The twelve Ailments (rulebook 3.7). Downed is included and is the only
 * Ailment that can coexist with another. `key` is a slug; `description` is the
 * player-facing effect text shown on the sheet. Combat resolution (Technicals,
 * saving throws) is intentionally not modelled — the app tracks, it does not
 * resolve.
 */
export const AILMENT_KEYS = [
  "downed",
  "burn",
  "freeze",
  "shock",
  "dizzy",
  "forget",
  "sleep",
  "confuse",
  "fear",
  "despair",
  "rage",
  "brainwash",
] as const

export type AilmentKey = (typeof AILMENT_KEYS)[number]

export const ailmentSchema = z.object({
  key: z.enum(AILMENT_KEYS),
  name: z.string().min(1),
  description: z.string().min(1),
})

export type Ailment = z.infer<typeof ailmentSchema>

const AILMENTS_BY_KEY = {
  downed: {
    key: "downed",
    name: "Downed",
    description:
      "Cannot move, take Actions, or use Reactions. Clears at the start of the character's very next turn. Can coexist with another Ailment.",
  },
  burn: {
    key: "burn",
    name: "Burn",
    description: "Loses 10% of max HP at the end of each turn.",
  },
  freeze: {
    key: "freeze",
    name: "Freeze",
    description:
      "Cannot take any Actions. Slash, Pierce, and Strike Affinities become Neutral unless already Weak.",
  },
  shock: {
    key: "shock",
    name: "Shock",
    description:
      "Cannot take any Actions. When dealing or receiving Physical damage, roll 1d4; on a 4 the afflicted character is cured and the other combatant becomes Shocked instead.",
  },
  dizzy: {
    key: "dizzy",
    name: "Dizzy",
    description: "-10 to Attack Rolls.",
  },
  forget: {
    key: "forget",
    name: "Forget",
    description: "Cannot use Skills that cost HP or SP.",
  },
  sleep: {
    key: "sleep",
    name: "Sleep",
    description:
      "Cannot take any Actions. Recovers 10% of max HP at the end of each turn. Cured immediately upon taking damage.",
  },
  confuse: {
    key: "confuse",
    name: "Confuse",
    description:
      "No Reactions. Roll 1d4 at the start of each turn: 1 attack a random ally, 2 consume a random item, 3 do nothing, 4 act normally.",
  },
  fear: {
    key: "fear",
    name: "Fear",
    description:
      "Must use the Move Action each turn to move as far as possible from the source of Fear.",
  },
  despair: {
    key: "despair",
    name: "Despair",
    description:
      "Loses 5% of max SP at the end of each turn. If still afflicted at the end of the 3rd turn, HP drops to 0.",
  },
  rage: {
    key: "rage",
    name: "Rage",
    description:
      "Attack increased; Defense and Hit/Evasion decreased. Must attack the closest enemy each turn.",
  },
  brainwash: {
    key: "brainwash",
    name: "Brainwash",
    description:
      "Must act against allies and on the side of enemies; alternatively, the DM takes control of the character.",
  },
} as const satisfies Record<AilmentKey, Ailment>

export const AILMENTS: readonly Ailment[] = Object.values(AILMENTS_BY_KEY)

/**
 * Looks up a canonical Ailment by its slug key. Returns `undefined` when no
 * Ailment matches.
 */
export function getAilment(key: string): Ailment | undefined {
  return (AILMENTS_BY_KEY as Record<string, Ailment>)[key]
}
