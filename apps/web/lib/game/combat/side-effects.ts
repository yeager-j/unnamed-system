import { z } from "zod/v4"

/**
 * Canonical Side Effects that an Attack Roll tier may apply (rulebook 3.3
 * "Side Effects"). Stored in one place and referenced by key from Skills and
 * weapon intrinsic attacks; the SkillCard renders the `name` in a Badge and
 * the `description` in its tooltip.
 *
 * Auto- variations are tracked as their own keys (e.g. `auto-critical`) rather
 * than flagged on the base entry — the rulebook treats them as distinct
 * outcomes with no Attribute comparison.
 *
 * Ailment-applying entries describe the rule for *applying* the Ailment from a
 * side effect; they intentionally do not repeat what the Ailment itself does
 * (that text lives with the Ailment entry in `./ailments`).
 */
export const SIDE_EFFECT_KEYS = [
  "critical",
  "auto-critical",
  "burn",
  "freeze",
  "shock",
  "dizzy",
  "fear",
  "sleep",
  "confuse",
  "despair",
  "rage",
  "brainwash",
  "auto-fear",
  "auto-sleep",
  "auto-confuse",
  "auto-despair",
  "auto-rage",
  "auto-brainwash",
  "insta-kill-light",
  "sukunda",
] as const

const ailmentDescription = (ailment: string) =>
  `Compare your Luck with the target's Luck. If yours is higher, ${ailment} is inflicted.`

const autoAilmentDescription = (ailment: string) =>
  `${ailment} is inflicted automatically; no Luck comparison.`

export type SideEffectKey = (typeof SIDE_EFFECT_KEYS)[number]

export const sideEffectSchema = z.object({
  key: z.enum(SIDE_EFFECT_KEYS),
  name: z.string().min(1),
  description: z.string().min(1),
})

export type SideEffect = z.infer<typeof sideEffectSchema>

const SIDE_EFFECTS_BY_KEY = {
  critical: {
    key: "critical",
    name: "Critical",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, damage dealt is doubled and the target receives the Downed Ailment.",
  },
  "auto-critical": {
    key: "auto-critical",
    name: "Auto-Critical",
    description:
      "Damage dealt is doubled and the target receives the Downed Ailment; no Luck comparison.",
  },
  burn: {
    key: "burn",
    name: "Burn",
    description: ailmentDescription("Burn"),
  },
  freeze: {
    key: "freeze",
    name: "Freeze",
    description: ailmentDescription("Freeze"),
  },
  shock: {
    key: "shock",
    name: "Shock",
    description: ailmentDescription("Shock"),
  },
  dizzy: {
    key: "dizzy",
    name: "Dizzy",
    description: ailmentDescription("Dizzy"),
  },
  fear: {
    key: "fear",
    name: "Fear",
    description: ailmentDescription("Fear"),
  },
  sleep: {
    key: "sleep",
    name: "Sleep",
    description: ailmentDescription("Sleep"),
  },
  confuse: {
    key: "confuse",
    name: "Confuse",
    description: ailmentDescription("Confuse"),
  },
  despair: {
    key: "despair",
    name: "Despair",
    description: ailmentDescription("Despair"),
  },
  rage: {
    key: "rage",
    name: "Rage",
    description: ailmentDescription("Rage"),
  },
  brainwash: {
    key: "brainwash",
    name: "Brainwash",
    description: ailmentDescription("Brainwash"),
  },
  "auto-fear": {
    key: "auto-fear",
    name: "Auto-Fear",
    description: autoAilmentDescription("Fear"),
  },
  "auto-sleep": {
    key: "auto-sleep",
    name: "Auto-Sleep",
    description: autoAilmentDescription("Sleep"),
  },
  "auto-confuse": {
    key: "auto-confuse",
    name: "Auto-Confuse",
    description: autoAilmentDescription("Confuse"),
  },
  "auto-despair": {
    key: "auto-despair",
    name: "Auto-Despair",
    description: autoAilmentDescription("Despair"),
  },
  "auto-rage": {
    key: "auto-rage",
    name: "Auto-Rage",
    description: autoAilmentDescription("Rage"),
  },
  "auto-brainwash": {
    key: "auto-brainwash",
    name: "Auto-Brainwash",
    description: autoAilmentDescription("Brainwash"),
  },
  "insta-kill-light": {
    key: "insta-kill-light",
    name: "Insta-Kill (Light)",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target drops to 0 Hit Points. If the target is weak to Light, the Luck comparison is skipped. Targets of equal or higher level are immune.",
  },
  sukunda: {
    key: "sukunda",
    name: "Sukunda",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target's Hit/Evasion is lowered for 3 turns.",
  },
} as const satisfies Record<SideEffectKey, SideEffect>

export const SIDE_EFFECTS: readonly SideEffect[] =
  Object.values(SIDE_EFFECTS_BY_KEY)

/**
 * Looks up a canonical Side Effect by its slug key. Returns `undefined` when
 * no Side Effect matches.
 */
export function getSideEffect(key: string): SideEffect | undefined {
  return (SIDE_EFFECTS_BY_KEY as Record<string, SideEffect>)[key]
}
