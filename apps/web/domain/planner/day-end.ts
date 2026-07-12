import { type DaySlotFacts } from "./day-progress"
import { slotKind } from "./slot-kind"

/**
 * The **day-end readiness** cue (tech-design §0, PRD FR-5): "End the day"
 * stays muted until every story/dungeon slot is resolved ∧ every downtime
 * slot has an entry per placed character, then brightens. When the DM ends
 * an unready day, these counts feed the warning's copy (Cancel / Resolve All
 * / Defer Unresolved). Pure selector over the same {@link DaySlotFacts} as
 * `dayProgress` — the authoritative recount happens server-side inside the
 * `endDay` transaction; this one only drives the UI.
 */

export interface DayEndReadiness {
  ready: boolean
  /** Story slots whose beat lacks `resolvedAt`. */
  unresolvedStorySlots: number
  /** Dungeon slots whose claim lacks `resolvedAt`. */
  unresolvedDungeonSlots: number
  /** Missing (downtime slot × placed character) entries, roster-capped. */
  missingEntries: number
}

export function dayEndReadiness(input: DaySlotFacts): DayEndReadiness {
  let unresolvedStorySlots = 0
  let unresolvedDungeonSlots = 0
  let missingEntries = 0
  for (const slotId of input.slotIds) {
    const kind = slotKind(slotId, input.occupancy)
    if (kind === "downtime") {
      const recorded = Math.min(
        input.recordedBySlot.get(slotId) ?? 0,
        input.rosterSize
      )
      missingEntries += input.rosterSize - recorded
      continue
    }
    if (input.resolvedSlotIds.has(slotId)) continue
    if (kind === "story") unresolvedStorySlots += 1
    else unresolvedDungeonSlots += 1
  }
  return {
    ready:
      unresolvedStorySlots === 0 &&
      unresolvedDungeonSlots === 0 &&
      missingEntries === 0,
    unresolvedStorySlots,
    unresolvedDungeonSlots,
    missingEntries,
  }
}
