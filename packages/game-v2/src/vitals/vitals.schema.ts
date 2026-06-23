import { z } from "zod/v4"

import { maxSourceSchema } from "@workspace/game-v2/vitals/max-source.schema"

/**
 * The **Vitals** component (D34) — an entity's HP capability. Presence makes an
 * entity `Targetable`. `max` is the ceiling's {@link import("./max-source.schema").MaxSource}
 * (derived for a PC, flat for an enemy); `resolve` turns it into the effective
 * `maxHP`.
 *
 * PR2 (UNN-500) ships only `max` — the derivation base. The depletion field
 * (`damage`, signed; `currentHP = max(0, maxHP − damage)`) and its operations are
 * PR3 (UNN-501); they extend this shape additively.
 */
export const vitalsSchema = z.object({
  max: maxSourceSchema,
})

export type Vitals = z.infer<typeof vitalsSchema>
