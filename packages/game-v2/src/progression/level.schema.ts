import { z } from "zod/v4"

/**
 * The **Level** component — a combatant's level (1–30). Unlike the PC-only
 * {@link import("./path.schema").Path}, this is **universal across combatants**:
 * an enemy carries a Level too, because the Insta-Kill rule compares the caster's
 * and target's levels (a target is immune when its Level ≥ the caster's). It also
 * feeds the dice maxima and the HP/SP path formula.
 *
 * Split out of the old `Progression` component (which bundled `level` with the
 * PC-only `pathChoice`): every entity carrying a Level uses it, but only PCs have a
 * path — so the two have different presence domains and belong apart.
 */
export const levelSchema = z.object({
  value: z.number().int().min(1).max(30),
})

export type Level = z.infer<typeof levelSchema>
