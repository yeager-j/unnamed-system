import { z } from "zod/v4"

/**
 * Canonical Side Effect keys that an Attack Roll tier may apply (rulebook 3.3
 * "Side Effects"). Referenced by key from Skills and weapon intrinsic attacks;
 * the catalog entries (name + description) live in the data layer alongside the
 * `getSideEffect` lookup, mirroring the Ailments split.
 *
 * Auto- variations are tracked as their own keys (e.g. `auto-critical`) rather
 * than flagged on the base entry — the rulebook treats them as distinct
 * outcomes with no Attribute comparison.
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
  "forget",
  "auto-fear",
  "auto-sleep",
  "auto-confuse",
  "auto-despair",
  "auto-rage",
  "auto-brainwash",
  "auto-forget",
  "insta-kill-light",
  "insta-kill-dark",
  "sukunda",
] as const

export type SideEffectKey = (typeof SIDE_EFFECT_KEYS)[number]

export const sideEffectSchema = z.object({
  key: z.enum(SIDE_EFFECT_KEYS),
  name: z.string().min(1),
  description: z.string().min(1),
})

export type SideEffect = z.infer<typeof sideEffectSchema>
