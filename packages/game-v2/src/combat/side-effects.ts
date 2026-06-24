import {
  SIDE_EFFECT_KEYS,
  type SideEffectKey,
} from "@workspace/game-v2/kernel/vocab/side-effects"

/**
 * The canonical Side Effect catalog (ported as-is from v1): the player-facing
 * name + description for each {@link SideEffectKey}. The SkillCard renders the
 * `name` in a Badge and the `description` in its tooltip.
 *
 * **Engine-owned, deliberately NOT a `GameData` port** — it is closed-union
 * reference content keyed over {@link SIDE_EFFECT_KEYS}, like
 * `mechanics/zone-enchantment.ts`'s definitions, not a varying authored catalog.
 *
 * Ailment-applying entries describe the rule for *applying* the Ailment from a
 * side effect; they intentionally do not repeat what the Ailment itself does
 * (that text lives with the Ailment entry).
 */
export interface SideEffect {
  key: SideEffectKey
  name: string
  description: string
}

const ailmentDescription = (ailment: string) =>
  `Compare your Luck with the target's Luck. If yours is higher, ${ailment} is inflicted.`

const autoAilmentDescription = (ailment: string) =>
  `${ailment} is inflicted automatically; no Luck comparison.`

const SIDE_EFFECTS_BY_KEY: Record<SideEffectKey, SideEffect> = {
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
  burn: { key: "burn", name: "Burn", description: ailmentDescription("Burn") },
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
  fear: { key: "fear", name: "Fear", description: ailmentDescription("Fear") },
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
  rage: { key: "rage", name: "Rage", description: ailmentDescription("Rage") },
  brainwash: {
    key: "brainwash",
    name: "Brainwash",
    description: ailmentDescription("Brainwash"),
  },
  forget: {
    key: "forget",
    name: "Forget",
    description: ailmentDescription("Forget"),
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
  "auto-forget": {
    key: "auto-forget",
    name: "Auto-Forget",
    description: autoAilmentDescription("Forget"),
  },
  "insta-kill-light": {
    key: "insta-kill-light",
    name: "Insta-Kill (Light)",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target drops to 0 Hit Points. If the target is weak to Light, the Luck comparison is skipped. Targets of equal or higher level are immune.",
  },
  "insta-kill-dark": {
    key: "insta-kill-dark",
    name: "Insta-Kill (Dark)",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target drops to 0 Hit Points. If the target is weak to Dark, the Luck comparison is skipped. Targets of equal or higher level are immune.",
  },
  sukunda: {
    key: "sukunda",
    name: "Sukunda",
    description:
      "Compare your Luck with the target's Luck. If your Luck is higher, the target's Hit/Evasion is lowered for 3 turns.",
  },
  "no-cure": {
    key: "no-cure",
    name: "No-Cure",
    description:
      "If this damage causes a Technical, the target is not cured of its Ailment.",
  },
}

/** Every canonical Side Effect, in {@link SIDE_EFFECT_KEYS} order. */
export const SIDE_EFFECTS: readonly SideEffect[] = SIDE_EFFECT_KEYS.map(
  (key) => SIDE_EFFECTS_BY_KEY[key]
)

/**
 * The canonical Side Effect for `key`. **Total** over the closed
 * {@link SideEffectKey} union — every key has an entry by construction (pinned by
 * `side-effects.test.ts`), so there is no miss case (mirrors `getEnchantment`).
 */
export function getSideEffect(key: SideEffectKey): SideEffect {
  return SIDE_EFFECTS_BY_KEY[key]
}
