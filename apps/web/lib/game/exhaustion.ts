import { z } from "zod/v4"

/**
 * The seven Exhaustion levels (rulebook `2.5 Resting & Exhaustion`): 0 is the
 * unexhausted baseline and 1–6 are the escalating tiers a character can
 * accrue. The canonical effect text for each tier is shown in the tooltip of
 * the Exhaustion badge on the Combat State block.
 *
 * The rulebook's Exhaustion table is still pending (`> [!todo] Exhaustion
 * Table`), so the 1–6 descriptions here are placeholders — kept non-empty so
 * the tooltip has something to render — and should be replaced with the
 * canonical wording once the rules ship.
 */
export const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const

export type ExhaustionLevel = (typeof EXHAUSTION_LEVELS)[number]

export const MAX_EXHAUSTION_LEVEL = 6

export const exhaustionLevelSchema = z.object({
  level: z.number().int().min(0).max(MAX_EXHAUSTION_LEVEL),
  description: z.string().min(1),
})

export type ExhaustionLevelEntry = z.infer<typeof exhaustionLevelSchema>

const EXHAUSTION_LEVELS_BY_LEVEL = {
  0: {
    level: 0,
    description: "No effects.",
  },
  1: {
    level: 1,
    description: "Placeholder — Exhaustion table pending in the rulebook.",
  },
  2: {
    level: 2,
    description: "Placeholder — Exhaustion table pending in the rulebook.",
  },
  3: {
    level: 3,
    description: "Placeholder — Exhaustion table pending in the rulebook.",
  },
  4: {
    level: 4,
    description: "Placeholder — Exhaustion table pending in the rulebook.",
  },
  5: {
    level: 5,
    description: "Placeholder — Exhaustion table pending in the rulebook.",
  },
  6: {
    level: 6,
    description: "Placeholder — Exhaustion table pending in the rulebook.",
  },
} as const satisfies Record<ExhaustionLevel, ExhaustionLevelEntry>

export const EXHAUSTION_LEVEL_ENTRIES: readonly ExhaustionLevelEntry[] =
  Object.values(EXHAUSTION_LEVELS_BY_LEVEL)

/**
 * Looks up a canonical Exhaustion level entry. Values outside 0–6 are clamped
 * into the table so the sheet can still render a tooltip for malformed or
 * future-extended persisted data.
 */
export function getExhaustionLevel(level: number): ExhaustionLevelEntry {
  const clamped = Math.max(
    0,
    Math.min(MAX_EXHAUSTION_LEVEL, Math.trunc(level))
  ) as ExhaustionLevel
  return EXHAUSTION_LEVELS_BY_LEVEL[clamped]
}
