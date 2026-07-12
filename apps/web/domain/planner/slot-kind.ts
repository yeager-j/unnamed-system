/**
 * The slot-kind derivation (tech-design §0's one-stored-fact rule, D3/D9): a
 * slot's kind is never stored — a scheduled beat makes it **story**, a dungeon
 * claim will make it **dungeon** (phase 4 adds that arm to
 * {@link SlotOccupancy}), and otherwise it **is** downtime, the default/empty
 * state. One decision point; everything downstream (runner body, pill meta,
 * set-aside suppression) reads the derived kind.
 */

export type SlotKind = "story" | "downtime"

/** What currently claims slots — the story-beat set today, dungeon claims in phase 4. */
export interface SlotOccupancy {
  storyBeatSlotIds: ReadonlySet<string>
}

export function slotKind(slotId: string, occupancy: SlotOccupancy): SlotKind {
  return occupancy.storyBeatSlotIds.has(slotId) ? "story" : "downtime"
}

/**
 * Whether a recorded downtime entry is **set aside** (D3): its slot currently
 * holds a scheduled beat (or, later, a dungeon claim), so the entry is
 * suppressed — in the runner and on timelines — by this same predicate.
 * Derived state: deferring the beat un-suppresses for free, nothing is
 * written. World updates (`slotId` null) are never set aside.
 */
export function isSetAside(
  update: { slotId: string | null },
  occupancy: SlotOccupancy
): boolean {
  return (
    update.slotId !== null && slotKind(update.slotId, occupancy) === "story"
  )
}
