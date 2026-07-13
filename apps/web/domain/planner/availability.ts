import type { Lineage } from "@workspace/game-v2/kernel/vocab"

/** The inputs {@link availabilityFold} unions into a narrative gate (D8). */
export interface AvailabilityInputs {
  /** The character's Origin Lineage (`null` when they have no origin). */
  originLineage: Lineage | null
  /** The campaign's story tier, 1–4; callers pass 1 when the clock hasn't started. */
  storyTier: number
  /** The Lineage-holding NPCs' bond lanes (lineage-less NPCs are not passed). */
  npcs: readonly { lineageKey: Lineage; bondTier: number }[]
}

/**
 * Folds a campaign's narrative state into the `narrativeGate` map
 * `buildLineageAtlas` consumes: Lineage → highest open tier. Availability is
 * the **union of two lanes** (D8 — best lane wins, never `min`): every
 * NPC-held Lineage opens party-wide at that NPC's bond tier, and the
 * character's own Origin Lineage opens at the story tier (or its bond lane,
 * whichever is higher). Zero entries are omitted — the engine reads an absent
 * entry as 0 (fully locked, save the origin's Initiate floor).
 */
export function availabilityFold(
  inputs: AvailabilityInputs
): ReadonlyMap<Lineage, number> {
  const gate = new Map<Lineage, number>()
  for (const npc of inputs.npcs) {
    const best = Math.max(gate.get(npc.lineageKey) ?? 0, npc.bondTier)
    if (best > 0) gate.set(npc.lineageKey, best)
  }
  if (inputs.originLineage !== null) {
    const best = Math.max(gate.get(inputs.originLineage) ?? 0, inputs.storyTier)
    if (best > 0) gate.set(inputs.originLineage, best)
  }
  return gate
}
