import { z } from "zod/v4"

/**
 * The **Exhaustion** component (D27) — a durable *level* (0–6), **not** a spend-pool
 * (F5), so it is deliberately separate from {@link import("./resources.schema").Resources}
 * and is **never cleared by the combat-end sweep** (D8/D27) — that sweep only touches
 * the combat-overlay layer, and a durable component sits outside it.
 *
 * Its *effects* derive from the rulebook Exhaustion table at resolve time (the
 * stored level is truth, the table is data — D27). The table 1–6 descriptions are
 * still placeholders (rulebook `2.5` unshipped, D14); when they ship, the level's
 * stat effects would fold into `resolve`'s `BonusPool` as one more source — no
 * effect-fold is wired today because there are no real effects to encode.
 *
 * `level` defaults to `0` (unexhausted) so a pre-component row still loads (D3).
 */
export const MAX_EXHAUSTION_LEVEL = 6

export const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const
export type ExhaustionLevel = (typeof EXHAUSTION_LEVELS)[number]

export const exhaustionSchema = z.object({
  level: z.number().int().min(0).max(MAX_EXHAUSTION_LEVEL).default(0),
})

export type Exhaustion = z.infer<typeof exhaustionSchema>
