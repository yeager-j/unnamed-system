import { z } from "zod/v4"

/**
 * The **Level** component — a combatant's level (1–30) and banked Victories.
 * Unlike the PC-only {@link import("./path.schema").Path}, this is **universal
 * across combatants**: an enemy carries a Level too, because the Insta-Kill rule
 * compares the caster's and target's levels (a target is immune when its Level ≥
 * the caster's). It also feeds the dice maxima and the HP/SP path formula.
 *
 * `victories` (rulebook 1.6) rides along: level-up reads and writes `value` and
 * `victories` atomically (the one-system granularity signal, O1/D8 — the same
 * call that merged Virtue ranks with the Spark log, E1). Victories aren't
 * PC-only — a durable companion NPC banks them like a PC — and they derive
 * nothing, so the presence-domain concern that split `Path` out doesn't apply.
 * The default keeps rows and catalog entries minted before the field existed
 * loading (D3); enemies simply sit at 0.
 *
 * Split out of the old `Progression` component (which bundled `level` with the
 * PC-only `pathChoice`): every entity carrying a Level uses it, but only PCs have a
 * path — so the two have different presence domains and belong apart.
 */
export const levelSchema = z.object({
  value: z.number().int().min(1).max(30),
  victories: z.number().int().min(0).default(0),
})

export type Level = z.infer<typeof levelSchema>
