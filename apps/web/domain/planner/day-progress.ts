import { slotKind, type SlotOccupancy } from "./slot-kind"

/**
 * The "The day" progress fold (handoff sidebar footer; §0 day-end readiness'
 * little sibling): a story slot is one unit (done ⇔ its beat is resolved); a
 * downtime slot is one unit **per placed character** (done per recorded
 * entry, capped at the roster — always against the *current* roster, D1's
 * roster-drift acceptance). Pure; the day-end warning's full readiness cue
 * builds on the same facts in phase 4.
 */

export interface DayProgress {
  done: number
  total: number
}

export function dayProgress(input: {
  slotIds: readonly string[]
  occupancy: SlotOccupancy
  /** Slot ids whose scheduled beat carries `resolvedAt`. */
  resolvedBeatSlotIds: ReadonlySet<string>
  rosterSize: number
  /** Distinct characters with a recorded entry, per slot id. */
  recordedBySlot: ReadonlyMap<string, number>
}): DayProgress {
  let done = 0
  let total = 0
  for (const slotId of input.slotIds) {
    if (slotKind(slotId, input.occupancy) === "story") {
      total += 1
      if (input.resolvedBeatSlotIds.has(slotId)) done += 1
      continue
    }
    total += input.rosterSize
    done += Math.min(input.recordedBySlot.get(slotId) ?? 0, input.rosterSize)
  }
  return { done, total }
}
