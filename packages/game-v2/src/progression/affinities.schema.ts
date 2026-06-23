import { z } from "zod/v4"

import { AFFINITIES } from "@workspace/game-v2/kernel/vocab"

const affinity = z.enum(AFFINITIES)

/**
 * An authored Affinity chart — only the chartable damage types (Almighty can't
 * be resisted), each optional (absent ⇒ Neutral). Mirrors a v1 Archetype's chart.
 */
export const partialAffinityChartSchema = z.object({
  slash: affinity.optional(),
  pierce: affinity.optional(),
  strike: affinity.optional(),
  fire: affinity.optional(),
  ice: affinity.optional(),
  wind: affinity.optional(),
  elec: affinity.optional(),
  soul: affinity.optional(),
  mind: affinity.optional(),
  light: affinity.optional(),
  dark: affinity.optional(),
})

/**
 * The **Affinities** component (D34) — the base of an entity's Affinity chart,
 * carrying its own `source` (D5): `derived` (from the active Archetype, resolved)
 * or `flat` (an enemy's authored chart). Stands alone, not bundled in a profile.
 */
export const affinitiesSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("derived") }),
    z.object({ kind: z.literal("flat"), chart: partialAffinityChartSchema }),
  ]),
})

export type Affinities = z.infer<typeof affinitiesSchema>
