import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"

/**
 * Chronicle default-visibility (D9/PRD FR-2, pinned by UNN-576's AC ahead of
 * the phase-7 surface): **Idle entries are muted and filtered out by
 * default** — "did nothing substantial" is honest record-keeping, not
 * timeline content. Everything else (world updates, categorized downtime)
 * shows. The Chronicle's filter toggle simply stops calling this.
 */
export function isShownByDefaultInChronicle(update: {
  category: UpdateCategory | null
}): boolean {
  return update.category !== "idle"
}
