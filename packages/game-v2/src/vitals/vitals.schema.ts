import { z } from "zod/v4"

/**
 * The **Vitals** component (D34/D37) — an entity's HP capability. Presence makes
 * an entity `Targetable`. `base` is the entity's intrinsic base maxHP: `0` for a
 * PC (whose maxHP comes from the `Progression` path/level layer) and the authored
 * maxHP for an enemy. `resolve` folds `base` → progression layer (if present) →
 * HP bonuses into the effective `maxHP`, uniformly for every entity (D37 — no
 * `max: MaxSource` source fork).
 *
 * PR2 (UNN-500) ships only `base` — the derivation base. The depletion field
 * (`damage`, signed; `currentHP = max(0, maxHP − damage)`) and its operations are
 * PR3 (UNN-501); they extend this shape additively.
 */
export const vitalsSchema = z.object({
  base: z.number().int(),
})

export type Vitals = z.infer<typeof vitalsSchema>
