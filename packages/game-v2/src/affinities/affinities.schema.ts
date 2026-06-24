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
 * The **Affinities** component (D34/D37) — an entity's **base** Affinity chart: a
 * PC carries `{}` (all-neutral; its chart comes from the `Archetypes` layer), an
 * enemy carries its authored chart. `resolve` folds `base` → archetype override
 * (if present) → candidate effects (by precedence) → result, uniformly for every
 * entity — no `source: derived | flat` (D37). Stands alone, not bundled in a profile.
 */
export const affinitiesSchema = z.object({
  base: partialAffinityChartSchema,
})

export type Affinities = z.infer<typeof affinitiesSchema>
