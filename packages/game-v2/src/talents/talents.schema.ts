import { z } from "zod/v4"

/**
 * A direct, entity-authored Talent **reference** — the shape stored on the `talents`
 * component (background- + downtime-gained Talents). Just the slug key; the display
 * name lives in the engine-owned {@link import("./catalog") catalog} (CH10), and the
 * active-Archetype Talents are derived at read time by {@link import("./resolve")
 * resolveTalents}, not stored.
 */
export const talentSchema = z.object({
  key: z.string().min(1),
})

export const talentsSchema = z.array(talentSchema)

export type TalentRef = z.infer<typeof talentSchema>
export type Talents = z.infer<typeof talentsSchema>
