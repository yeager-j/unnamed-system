import { resolveEntity, resolveTalentRoster } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import {
  buildRosterGlance,
  type RosterGlanceView,
} from "@/domain/planner/view/glance"

import { loadLiveEntityRowsByIds } from "./load-entity"

/**
 * The Day Runner roster's **batch glance read** (UNN-576, D10's read
 * boundary): one batch row load → assemble → v2 resolve → the pure glance
 * builder, keyed by entity id — the `load-party-vitals.ts` pattern; never N×
 * per-character loads. **Live** rows only: the roster ids are current placed
 * PCs, so a tombstone reads as absent.
 *
 * A row that fails the load seam is skipped with a logged error — the glance
 * degrades to absent, the runner still renders.
 */
export async function loadRosterGlance(
  entityIds: readonly string[]
): Promise<Map<string, RosterGlanceView>> {
  if (entityIds.length === 0) return new Map()
  const rows = await loadLiveEntityRowsByIds(entityIds)

  const glances = new Map<string, RosterGlanceView>()
  for (const row of rows) {
    const loaded = loadEntityRow(row)
    if (!loaded.ok) {
      console.error(
        `[loadRosterGlance] entity ${row.id} failed component load`,
        loaded.error
      )
      continue
    }
    const resolved = resolveEntity(loaded.value)
    glances.set(
      row.id,
      buildRosterGlance({
        virtues: resolved.components.virtues,
        talentRoster: resolveTalentRoster(resolved),
      })
    )
  }
  return glances
}
