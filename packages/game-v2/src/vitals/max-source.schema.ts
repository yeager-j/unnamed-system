import { z } from "zod/v4"

/**
 * **Value provenance** for a resolved maximum (D5/D34): *how* the ceiling is
 * computed, not *what kind* of entity carries it. `derived` (a PC's pools scale
 * from path + level + bonuses) vs `flat` (an enemy's authored ceiling). Plain
 * serializable data — a function wouldn't persist — so the union is the right
 * form. Shared by {@link import("./vitals.schema").Vitals} (maxHP) and
 * {@link import("./skill-pool.schema").SkillPool} (maxSP).
 */
export const maxSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("derived") }),
  z.object({ kind: z.literal("flat"), value: z.number().int() }),
])

export type MaxSource = z.infer<typeof maxSourceSchema>
