/** The slice of a loaded NPC this selector reads (structural — `LoadedCampaignNpc` satisfies it). */
export type NpcStubInputs = {
  arcana: string | null
  lineageKey: string | null
  entity: { narrative: unknown }
}

/**
 * The **stub badge** selector (tech-design §0): a quick-minted NPC is a stub —
 * a name and nothing else — until any of its three authored facets appears:
 * an Arcana, a Lineage, or Identity/Origins prose (the entity's `narrative`
 * component). Derived, never stored.
 */
export function isStubNpc(npc: NpcStubInputs): boolean {
  return (
    npc.arcana === null &&
    npc.lineageKey === null &&
    npc.entity.narrative === null
  )
}
