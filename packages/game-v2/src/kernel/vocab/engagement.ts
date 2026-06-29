import { z } from "zod/v4"

import { participantIdSchema } from "../participant-id.schema"

/**
 * **Engagement** vocabulary — whether a participant is `free` or melee-`engaged`
 * (locked with specific combatants by id). v1's discriminated union verbatim.
 *
 * Homed in `kernel/vocab` (joining `ENCHANTMENT_TYPES`, SD3) because it is the one
 * genuinely **dual-homed** spatial/combat shape: the spatial reducer *writes* it
 * onto its occupancy token (`MapToken.engagement`), and combat *reads* it through
 * the instance read-bag. Decide-a-distinction-once (Code Style #9) — the shape is
 * decided here, at the lowest boundary both importers reach down to, mirroring v1's
 * neutral `foundation/combat/engagement.ts` home. It records *who* a combatant is
 * locked with, never *where* it stands (that is the orthogonal `Position`, which
 * stays combat-side in `encounter/instance.ts`).
 *
 * The symmetric, same-zone invariant is the spatial engagement-graph's job, not
 * combat's. Imports `participantIdSchema` from its kernel sibling directly (not the
 * `kernel` barrel) to keep the vocab module cycle-free.
 */
export const engagementSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("free") }),
  z.object({
    status: z.literal("engaged"),
    targetCombatantIds: z.array(participantIdSchema).min(1),
  }),
])

export type Engagement = z.infer<typeof engagementSchema>
