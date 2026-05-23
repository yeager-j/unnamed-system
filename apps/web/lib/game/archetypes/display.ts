import type { HydratedCharacter } from "../hydrated-character"
import {
  buildArchetypeEntries,
  groupByLineage,
  type ArchetypeEntry,
  type LineageGroup,
} from "./entries"

export interface ArchetypeDisplay {
  activeEntry: ArchetypeEntry | null
  lineageGroups: LineageGroup[]
  unlockedCount: number
}

/**
 * Shapes the data the {@link Archetypes} tab needs: the active Archetype
 * entry (if one is set), every unlocked entry grouped by Lineage in canonical
 * order, and the total unlocked count. Pure — wraps the existing
 * {@link buildArchetypeEntries} / {@link groupByLineage} pair so the tab
 * orchestrator stays focused on layout.
 */
export function getArchetypeDisplay(
  character: HydratedCharacter
): ArchetypeDisplay {
  const entries = buildArchetypeEntries(character)
  return {
    activeEntry: entries.find((entry) => entry.isActive) ?? null,
    lineageGroups: groupByLineage(entries),
    unlockedCount: entries.length,
  }
}
