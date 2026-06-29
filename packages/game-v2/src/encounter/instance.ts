import { z } from "zod/v4"

import { participantIdSchema } from "./ids"

/**
 * The two **instance-lifecycle** components (CD13; parent D28), pulled forward
 * from the deferred spatial layer because combat reads them. They carry a **third
 * lifecycle, `instance`** (delve-scoped), beside durable and overlay: their
 * authoritative home is the Map-Instance occupancy token, written **only** by the
 * spatial reducer (combat never writes them), and they survive the end-of-combat
 * overlay sweep but die with the delve — a lifecycle the durable/overlay split
 * cannot express (v1's `pruneCombat` keeps survivor zoneIds while freeing
 * engagement).
 *
 * Like the overlay bundle, they live in a sibling **type grouping**
 * ({@link EncounterInstanceComponents}) rooted in `encounter/`, **never** the kernel
 * `ComponentRegistry` — that registry would force a durable load-seam entry and
 * couple an exploration-shared concern to the durable schema. The loader (UNN-516)
 * projects the occupancy token into these components and injects them into a
 * participant's merged participant-view **after** `resolve` runs (never fold inputs).
 *
 * This ticket ships only the **read shapes**; the spatial write reducer that
 * mutates them stays deferred to the spatial ADR.
 */

/**
 * **Position** — the zone a participant occupies. `{ zoneId }` is the **minimum**
 * combat needs (the zone-enchantment read); it pins no coordinate/geometry model.
 */
export const positionSchema = z.object({
  zoneId: z.string(),
})

export type Position = z.infer<typeof positionSchema>

/**
 * **Engagement** — whether a participant is `free` or melee-`engaged` (locked
 * with specific combatants by id). v1's discriminated union verbatim — symmetric
 * and same-zone; the symmetry invariant is the spatial engagement-graph's job, not
 * combat's. Records *who* a combatant is locked with, never *where* it stands
 * (that is the orthogonal {@link Position}).
 */
export const engagementSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("free") }),
  z.object({
    status: z.literal("engaged"),
    targetCombatantIds: z.array(participantIdSchema).min(1),
  }),
])

export type Engagement = z.infer<typeof engagementSchema>

/**
 * The instance-lifecycle component grouping — the sibling of
 * {@link import("./overlay").OverlayComponents} (the design's `InstanceRegistry`,
 * CD13/CD14). A plain type grouping, explicitly **not** a runtime registry and
 * **not** the kernel `ComponentRegistry`.
 */
export interface EncounterInstanceComponents {
  position: Position
  engagement: Engagement
}

/**
 * The instance component keys. `as const satisfies` proves every entry is a real
 * instance key; {@link import("./disjointness")} proves the array is complete and
 * disjoint from the overlay + kernel registries (the 3-way assertion, CD14) so the
 * loader's merged read and the overlay sweep can never shadow each other.
 */
export const INSTANCE_KEYS = [
  "position",
  "engagement",
] as const satisfies readonly (keyof EncounterInstanceComponents)[]
