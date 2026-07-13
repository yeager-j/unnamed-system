/**
 * Bond progress derivation (tech-design D8, PRD FR-14). Progress toward the
 * next bond tier is **derived, never stored**: the count of distinct
 * `(PC, day)` pairs among Collaborator-category updates concerning the NPC
 * authored after `bondTierChangedAt` (the query applies the timestamp window;
 * this fold applies the one-per-PC-per-day cap). Editing, deleting, or
 * re-tagging a counted update recomputes for free — no compensating writes.
 */

/** Collaborator activities per tier before the "deepen?" confirm surfaces (flat, v1). */
export const BOND_THRESHOLD = 3

/** The top bond tier — 1:1 with the four Archetype tiers (Paragon). */
export const MAX_BOND_TIER = 4

/** One counted Collaborator activity: which NPC it concerns, by which PC, on which day. */
export interface BondActivityTuple {
  npcId: string
  pcId: string
  day: number
}

export interface BondEligibility {
  npcId: string
  currentTier: number
  nextTier: number
  /** Distinct (PC, day) pairs since the tier last changed, capped per the D8 rule. */
  progress: number
  /** Progress crossed {@link BOND_THRESHOLD} and the bond isn't maxed — surface the confirm. */
  eligible: boolean
}

/**
 * Folds the counted activity tuples into per-NPC bond eligibility. Only
 * Lineage-holding NPCs participate (bond machinery activates with a Lineage);
 * a same-day pile-on by one PC counts once, while distinct PCs the same
 * evening count once **each**.
 */
export function bondEligibility(
  npcs: readonly {
    entityId: string
    bondTier: number
    lineageKey: string | null
  }[],
  tuples: readonly BondActivityTuple[]
): BondEligibility[] {
  const pcDaysByNpc = new Map<string, Set<string>>()
  for (const tuple of tuples) {
    const pcDays = pcDaysByNpc.get(tuple.npcId) ?? new Set<string>()
    pcDays.add(`${tuple.pcId}:${tuple.day}`)
    pcDaysByNpc.set(tuple.npcId, pcDays)
  }
  return npcs
    .filter((npc) => npc.lineageKey !== null)
    .map((npc) => {
      const progress = pcDaysByNpc.get(npc.entityId)?.size ?? 0
      return {
        npcId: npc.entityId,
        currentTier: npc.bondTier,
        nextTier: Math.min(npc.bondTier + 1, MAX_BOND_TIER),
        progress,
        eligible: progress >= BOND_THRESHOLD && npc.bondTier < MAX_BOND_TIER,
      }
    })
}
