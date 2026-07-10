import type { ArchetypeEntry } from "@workspace/game-v2/archetypes/display"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { resolveArchetypeRoster } from "@/lib/game-engine-v2"

export interface ArchetypesTabView {
  activeEntry: ArchetypeEntry | null
}

/** Selects the active roster entry for the sheet's Archetypes tab. */
export function buildArchetypesTabView(
  resolved: ResolvedEntity
): ArchetypesTabView {
  return {
    activeEntry:
      resolveArchetypeRoster(resolved).find((entry) => entry.isActive) ?? null,
  }
}
