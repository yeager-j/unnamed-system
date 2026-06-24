import { z } from "zod/v4"

/**
 * The **Vitals** component (D34/D37) — an entity's HP capability. Presence makes
 * an entity `Targetable`. `base` is the entity's intrinsic base maxHP: `0` for a
 * PC (whose maxHP comes from the `Level`/`Path` formula layer) and the authored
 * maxHP for an enemy. `resolve` folds `base` → path/level layer (if present) →
 * HP bonuses into the effective `maxHP`, uniformly for every entity (D37 — no
 * `max: MaxSource` source fork).
 *
 * `damage` (D9/D10) is the **signed** depletion field: `currentHP = max(0, maxHP −
 * damage)`. The bottom floor protects 0; there is **no top cap**, so a negative
 * `damage` floats current HP above `maxHP` (Usury's over-max loan) while `maxHP`
 * stays honest for %-of-max / threshold rules. Storage is unbounded — each
 * *operation* (`vitals/operations.ts`) owns its own clamp. Defaults to `0` (full
 * HP) so a pre-PR3 `{ base }` blob still loads (D3, additive migration).
 */
export const vitalsSchema = z.object({
  base: z.number().int(),
  damage: z.number().int().default(0),
})

export type Vitals = z.infer<typeof vitalsSchema>
