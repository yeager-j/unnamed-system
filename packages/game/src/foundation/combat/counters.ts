import { z } from "zod/v4"

/**
 * Encounter **counters** — named, stacking tallies a DM keeps on a combatant
 * (rulebook Mechanics). The first is **Lumina** (Healer/Warlock's Path of Dawn):
 * an enemy that took Light damage gains a Lumina counter, and an enemy holding
 * any Lumina is **Illuminated** (cannot turn invisible, lights up its Zone). The
 * max Lumina equals the caster's Luck, but that cap is per-caster and **not
 * enforced** — the app tallies whatever the DM records, mirroring how
 * `ailmentsSchema` stays permissive.
 *
 * Adding a future counter (a mark, a stack) is a one-line addition to
 * {@link COUNTER_KEYS} plus a display label — the event, reducer, and UI are all
 * generic over the key.
 */
export const COUNTER_KEYS = ["lumina"] as const

export type CounterKey = (typeof COUNTER_KEYS)[number]

/**
 * A combatant's live counters — a sparse `counter-key → positive count` map
 * (absent key ⇒ 0). Structurally the same shape as `conditionDurations`: only
 * positive tallies are stored, so a counter driven to 0 drops its key entirely.
 */
export const countersSchema = z.partialRecord(
  z.enum(COUNTER_KEYS),
  z.number().int().positive()
)
export type Counters = z.infer<typeof countersSchema>
