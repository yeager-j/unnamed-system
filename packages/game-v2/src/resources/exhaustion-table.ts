import {
  EXHAUSTION_LEVELS,
  MAX_EXHAUSTION_LEVEL,
  type ExhaustionLevel,
} from "@workspace/game-v2/resources/exhaustion.schema"
import type { ResolvedExhaustion } from "@workspace/game-v2/resources/resolved"

/**
 * The Exhaustion effect table (rulebook `2.5 Resting & Exhaustion`), re-homed from
 * v1's `combat/exhaustion.ts`. Level 0 is the unexhausted baseline; 1–6 are the
 * escalating tiers. The canonical 1–6 effect text is **still pending** in the
 * rulebook, so those descriptions are non-empty placeholders to be replaced when
 * the rules ship (D14/D27). The stored level is truth; this table is the data
 * `resolve` looks up.
 */
const EXHAUSTION_TABLE: Record<ExhaustionLevel, ResolvedExhaustion> = {
  0: { level: 0, description: "No effects." },
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
}

export const EXHAUSTION_TABLE_ENTRIES: readonly ResolvedExhaustion[] =
  EXHAUSTION_LEVELS.map((level) => EXHAUSTION_TABLE[level])

/**
 * Resolves a stored Exhaustion level to its table entry. Values outside 0–6 are
 * clamped (and truncated) into the table so a malformed or future-extended level
 * still resolves to a renderable entry, mirroring v1's `getExhaustionLevel`.
 */
export function getExhaustionLevel(level: number): ResolvedExhaustion {
  const clamped = Math.max(
    0,
    Math.min(MAX_EXHAUSTION_LEVEL, Math.trunc(level))
  ) as ExhaustionLevel
  return EXHAUSTION_TABLE[clamped]
}
