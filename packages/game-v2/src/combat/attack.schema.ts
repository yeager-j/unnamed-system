import { z } from "zod/v4"

import { damageFormulaSchema } from "@workspace/game-v2/combat/formula"
import {
  ATTACK_ATTRIBUTES,
  RANGES,
} from "@workspace/game-v2/kernel/vocab/attack"
import { SIDE_EFFECT_KEYS } from "@workspace/game-v2/kernel/vocab/side-effects"

/**
 * The Attack Roll shape (rulebook 3.3) — ported as-is from v1
 * (`foundation/combat/attack.ts`). Identical for Skills and weapons: roll a d20,
 * add an Attribute, compare to a table of bands. The `combat` domain owns these
 * zod shapes; the closed string-union tuples they build their `z.enum`s from live
 * in `kernel/vocab/{attack,side-effects}`. The Item/Skill shapes (PR5) embed
 * these verbatim.
 */

/**
 * Attack range — a known value (one of {@link RANGES}) or an explicit free-form
 * string for ranges the closed set doesn't cover.
 */
export const rangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), value: z.enum(RANGES) }),
  z.object({ kind: z.literal("explicit"), value: z.string().min(1) }),
])

/**
 * One row of the Attack Roll table. `band` is free-form (`"1-10"`, `"16+"`,
 * `"11-15"`…) because the rulebook does not fix the boundaries. `sideEffects` is
 * **ordered** (a single band can carry several — e.g. Sukunda *and* Critical) and
 * each entry keys into the canonical Side Effect set. `formula` is optional and
 * **structured** ({@link damageFormulaSchema} — an ordered list of additive terms,
 * not a string): damage-Skill tiers author one, Ailment-Skill tiers carry side
 * effects only.
 */
export const attackTierSchema = z.object({
  band: z.string().min(1),
  formula: damageFormulaSchema.optional(),
  sideEffects: z.array(z.enum(SIDE_EFFECT_KEYS)),
})

export const attackRollSchema = z.object({
  attribute: z.enum(ATTACK_ATTRIBUTES),
  tiers: z.array(attackTierSchema),
})

export type AttackRange = z.infer<typeof rangeSchema>
export type AttackTier = z.infer<typeof attackTierSchema>
export type AttackRoll = z.infer<typeof attackRollSchema>
