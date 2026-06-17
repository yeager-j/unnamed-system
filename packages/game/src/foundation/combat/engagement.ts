import { z } from "zod/v4"

/**
 * A combatant's **engagement** — `free`, or `engaged` (melee-locked) with
 * specific combatants by id. Records *who* a combatant is locked with, never
 * *where* it stands (position is the orthogonal `zoneId` on the same occupancy
 * token). Engagement is symmetric and same-zone (A engaged with B ⟺ B engaged
 * with A, both co-located); the {@link import("@workspace/game/engine") engagement-graph}
 * primitives keep that invariant.
 *
 * A **neutral primitive** (foundation/combat, beside `enchantment`/`ailments`):
 * the spatial cutover (UNN-459) homes engagement on the Map Instance occupancy
 * token (`MapToken.engagement`), while the encounter-setup payload
 * (`CombatantSetup.engagement`) still carries it to seed that token — so it is
 * genuinely shared between `map-instance.ts` and `session.ts`, and lives here
 * rather than being cross-imported between those siblings.
 */
export const engagementSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("free") }),
  z.object({
    status: z.literal("engaged"),
    targetCombatantIds: z.array(z.string()).min(1),
  }),
])
export type Engagement = z.infer<typeof engagementSchema>
