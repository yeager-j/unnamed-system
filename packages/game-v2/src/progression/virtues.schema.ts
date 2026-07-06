import { z } from "zod/v4"

/**
 * The Virtue rank ceiling (rulebook 1.2) — re-declared in v2 (D32), matching v1's
 * `MAX_VIRTUE_RANK`. A Virtue ranks up from 0 to at most this value.
 */
export const MAX_VIRTUE_RANK = 7

const virtueRankSchema = z.number().int().min(0).max(MAX_VIRTUE_RANK)

/**
 * The **Virtues** component (CH17) — the four Virtue ranks (Expression / Empathy /
 * Wisdom / Focus), rulebook progression state that drives Spark and the sheet's
 * Virtue display. Durable; **progression** version class (collapsing v1's split
 * between builder allocation and sheet rank-up — one component takes one class).
 *
 * The rank-up / allocation *transitions* (`rankUpVirtue`, the creation validators)
 * land in E1/UNN-544; S0 mints only the stored shape so the entity table and the
 * conformance test have it at table creation.
 */
export const virtuesSchema = z.object({
  expression: virtueRankSchema,
  empathy: virtueRankSchema,
  wisdom: virtueRankSchema,
  focus: virtueRankSchema,
})

export type Virtues = z.infer<typeof virtuesSchema>
