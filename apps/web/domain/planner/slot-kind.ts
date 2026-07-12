/**
 * The slot-kind derivation (tech-design §0's one-stored-fact rule, D3/D9): a
 * slot's kind is never stored — a scheduled beat makes it **story**, a dungeon
 * claim makes it **dungeon**, and otherwise it **is** downtime, the
 * default/empty state. One decision point; everything downstream (runner
 * body, pill meta, set-aside suppression) reads the derived kind. A slot
 * never holds both a beat and a claim — the write boundary's mutual-exclusion
 * check under a slot lock guarantees it — so the arm order here is not a
 * precedence rule.
 */

export type SlotKind = "story" | "dungeon" | "downtime"

/** What currently claims slots — scheduled beats and dungeon claims. */
export interface SlotOccupancy {
  storyBeatSlotIds: ReadonlySet<string>
  dungeonClaimSlotIds: ReadonlySet<string>
}

export function slotKind(slotId: string, occupancy: SlotOccupancy): SlotKind {
  if (occupancy.storyBeatSlotIds.has(slotId)) return "story"
  if (occupancy.dungeonClaimSlotIds.has(slotId)) return "dungeon"
  return "downtime"
}

/**
 * Whether a recorded downtime entry is **set aside** (D3/D9): its slot
 * currently holds a scheduled beat or a dungeon claim, so the entry is
 * suppressed — in the runner and on timelines — by this same predicate.
 * Derived state: deferring the beat (or removing the claim) un-suppresses
 * for free, nothing is written. World updates (`slotId` null) are never set
 * aside.
 */
export function isSetAside(
  update: { slotId: string | null },
  occupancy: SlotOccupancy
): boolean {
  return (
    update.slotId !== null && slotKind(update.slotId, occupancy) !== "downtime"
  )
}
