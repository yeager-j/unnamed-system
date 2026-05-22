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
  "burn",
  "freeze",
  "shock",
  "dizzy",
  "insta-kill-light",
  "sukunda",
] as const

const ailmentDescription = (ailment: string) =>
  `Compare your Luck with the target's Luck. If yours is higher, ${ailment} is inflicted.`

export type SideEffectKey = (typeof SIDE_EFFECT_KEYS)[number]

export const sideEffectSchema = z.object({
  key: z.enum(SIDE_EFFECT_KEYS),
  name: z.string().min(1),
  description: z.string().min(1),
})

export type SideEffect = z.infer<typeof sideEffectSchema>

function validate(sideEffect: SideEffect): SideEffect {
  sideEffectSchema.parse(sideEffect)
  return sideEffect
}

const SIDE_EFFECTS_BY_KEY = {
  critical: validate({
    key: "critical",
    name: "Critical",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, damage dealt is doubled and the target receives the Downed Ailment.",
  }),
  burn: validate({
    key: "burn",
    name: "Burn",
    description: ailmentDescription("Burn"),
  }),
  freeze: validate({
    key: "freeze",
    name: "Freeze",
    description: ailmentDescription("Freeze"),
  }),
  shock: validate({
    key: "shock",
    name: "Shock",
    description: ailmentDescription("Shock"),
  }),
  dizzy: validate({
    key: "dizzy",
    name: "Dizzy",
    description: ailmentDescription("Dizzy"),
  }),
  "insta-kill-light": validate({
    key: "insta-kill-light",
    name: "Insta-Kill (Light)",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target drops to 0 Hit Points. If the target is weak to Light, the Luck comparison is skipped. Targets of equal or higher level are immune.",
  }),
  sukunda: validate({
    key: "sukunda",
    name: "Sukunda",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target's Hit/Evasion is lowered for 3 turns.",
  }),
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
