/**
 * Side Effect vocabulary, re-declared in v2 (D32). The closed set of Side Effect
 * keys an Attack Roll tier may apply (rulebook 3.3 "Side Effects"), referenced by
 * key from `attackTierSchema` and, later, the Skill/weapon shapes. Kept zod-free;
 * the per-key name + description content lives in `combat/side-effects.ts` (an
 * engine-owned table, not a catalog port), mirroring the Ailments split.
 *
 * Auto- variations are tracked as their own keys (e.g. `auto-critical`) rather
 * than flagged on the base entry — the rulebook treats them as distinct outcomes
 * with no Attribute comparison.
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
  "no-cure",
] as const

export type SideEffectKey = (typeof SIDE_EFFECT_KEYS)[number]
