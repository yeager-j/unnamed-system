import { slotKind, type SlotOccupancy } from "./slot-kind"

/**
 * The "The day" progress fold (handoff sidebar footer): a story or dungeon
 * slot is one unit (done ⇔ its beat/claim is resolved); a downtime slot is
 * one unit **per placed character** (done per recorded entry, capped at the
 * roster — always against the *current* roster, D1's roster-drift
 * acceptance). Pure; {@link dayEndReadiness} in `day-end.ts` reads the same
 * facts into the day-end warning's cue.
 */

/**
 * The facts a day's progress and readiness derive from — one shape, two
 * folds (`dayProgress`, `dayEndReadiness`).
 */
export interface DaySlotFacts {
  slotIds: readonly string[]
  occupancy: SlotOccupancy
  /** Slot ids whose scheduled beat / dungeon claim carries `resolvedAt`. */
  resolvedSlotIds: ReadonlySet<string>
  rosterSize: number
  /** Distinct characters with a recorded entry, per slot id. */
  recordedBySlot: ReadonlyMap<string, number>
}

export interface DayProgress {
  done: number
  total: number
}

export function dayProgress(input: DaySlotFacts): DayProgress {
  let done = 0
  let total = 0
  for (const slotId of input.slotIds) {
    if (slotKind(slotId, input.occupancy) !== "downtime") {
      total += 1
      if (input.resolvedSlotIds.has(slotId)) done += 1
      continue
    }
    total += input.rosterSize
    done += Math.min(input.recordedBySlot.get(slotId) ?? 0, input.rosterSize)
  }
  return { done, total }
}
