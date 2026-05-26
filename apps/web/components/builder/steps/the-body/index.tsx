import type { PathChoice } from "@/lib/game/character"

import { ArchetypeGrid } from "./archetype-grid"
import { PathBar } from "./path-bar"

/**
 * Movement 1 — Corpus (UNN-215). The mechanical character: pick the HP/SP
 * Path, then the Origin Archetype from the 3×4 grid that sorts to surface
 * Lineages that fit the Path. Both writes go through the existing
 * optimistic-toggle dispatch pipeline (UNN-180); this component is a thin
 * composer that hands `pathChoice` down to the grid so the sort updates in
 * lockstep with the picker.
 */
export function TheBodyStep({
  characterId,
  pathChoice,
  originArchetypeKey,
  identityVersion,
}: {
  characterId: string
  pathChoice: PathChoice
  originArchetypeKey: string | null
  identityVersion: number
}) {
  return (
    <div className="flex flex-col gap-10">
      <PathBar
        characterId={characterId}
        pathChoice={pathChoice}
        identityVersion={identityVersion}
      />
      <ArchetypeGrid
        characterId={characterId}
        pathChoice={pathChoice}
        originArchetypeKey={originArchetypeKey}
        identityVersion={identityVersion}
      />
    </div>
  )
}
