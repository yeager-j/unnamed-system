/**
 * Attack vocabulary, re-declared in v2 (D32). The closed string-union tuples the
 * Attack Roll mechanic (rulebook 3.3) keys off — shared by the combat resolvers
 * and, later, the Item/Skill shapes that embed an attack. Kept **zod-free**:
 * consuming schemas (`combat/attack.schema.ts`) build their own `z.enum` from
 * these tuples; the zod shapes (`rangeSchema`/`attackRollSchema`/…) live in the
 * `combat` domain, not here.
 */

/**
 * Damage delivery printed in parentheses after the damage type, e.g. the
 * "(Magical)" in "Fire (Magical)".
 */
export const DELIVERIES = ["physical", "magical"] as const

export type Delivery = (typeof DELIVERIES)[number]

/**
 * The attribute added to an Attack Roll. `"st-or-ma"` is the documented
 * either-or variant used by a handful of Skills and weapons.
 */
export const ATTACK_ATTRIBUTES = ["st", "ma", "ag", "lu", "st-or-ma"] as const

export type AttackAttribute = (typeof ATTACK_ATTRIBUTES)[number]

/**
 * Display names for each {@link AttackAttribute}, used by the resolver as the
 * first source in an Attack Roll's labelled breakdown. `"st-or-ma"` keeps both
 * names so the breakdown stays honest about which is in play. Lives with the
 * vocab rather than in the UI label store (`apps/web/lib/ui/labels.ts`) because
 * the game **engine** — not a UI surface — is the only consumer: it is the
 * roll-breakdown *source label* the resolver emits as `sources[0]`.
 */
export const ATTACK_ATTRIBUTE_LABELS = {
  st: "Strength",
  ma: "Magic",
  ag: "Agility",
  lu: "Luck",
  "st-or-ma": "Strength or Magic",
} as const satisfies Record<AttackAttribute, string>

/**
 * Short labels for an Attribute as it appears **inside a damage formula** (`"1d8 +
 * Ma"`) — distinct from {@link ATTACK_ATTRIBUTE_LABELS}, which are the full names
 * the Attack-Roll breakdown uses. The damage-formula renderer substitutes these
 * for an un-hydrated `attribute` term.
 */
export const ATTACK_ATTRIBUTE_ABBREVIATIONS = {
  st: "St",
  ma: "Ma",
  ag: "Ag",
  lu: "Lu",
  "st-or-ma": "St or Ma",
} as const satisfies Record<AttackAttribute, string>

/**
 * Known Range values. Attacks outside this set carry an explicit string via the
 * `rangeSchema` escape hatch (`combat/attack.schema.ts`) so unusual ranges never
 * block transcription.
 */
export const RANGES = [
  "engaged",
  "all-engaged",
  "same-zone",
  "adjacent-zone",
  "same-or-adjacent-zone",
  "all",
] as const

export type Range = (typeof RANGES)[number]
