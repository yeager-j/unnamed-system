import { z } from "zod/v4"

/**
 * A direct, entity-authored Talent reference. v2 intentionally has no engine-side
 * Talent catalog/port; display labels live in the app label layer.
 */
export const talentSchema = z.object({
  key: z.string().min(1),
})

export const talentsSchema = z.array(talentSchema)

export type Talent = z.infer<typeof talentSchema>
export type Talents = z.infer<typeof talentsSchema>
