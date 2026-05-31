import { ArchetypeGrid } from "./archetype-grid"
import { PathBar } from "./path-bar"

/**
 * Movement 1 — Corpus (UNN-215). The mechanical character: pick the HP/SP
 * Path, then the Origin Archetype from the 3×4 grid that sorts to surface
 * Lineages that fit the Path. Both writes go through the existing
 * optimistic-toggle dispatch pipeline (UNN-180); each sub-control reads the
 * slice of the draft it cares about from `useBuilderDraft()` (UNN-252).
 */
export function CorpusStep() {
  return (
    <div className="flex flex-col gap-10">
      <PathBar />
      <ArchetypeGrid />
    </div>
  )
}
