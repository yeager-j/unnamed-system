import { resolveEntity } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { hpPool, spPool, type Pool } from "@/domain/pool"
import { db, type WriteExecutor } from "@/lib/db/client"
import { loadLiveEntityRowsByIds } from "@/lib/db/queries/load-entity"

/** A party token's current + max pools, the shape the dungeon roster + fog
 *  snapshot draw each health/skill bar from. Unlike the display surfaces, a
 *  token always draws a bar, so absence zero-fills rather than resolving to
 *  `null`. */
interface TokenVitals {
  hp: Pool
  sp: Pool
}

/**
 * Resolves the current HP/SP pools for a set of `entity` ids (UNN-562 — the v2
 * successor of the per-PC v1 hydration fan-out the dungeon roster + fog snapshot
 * used). Batch-reads the rows, assembles + `resolveEntity`s each
 * once, and returns a map keyed by id; a row that fails the load seam is a
 * data-integrity fault and is skipped (a caller that draws a token for it falls
 * back to a zero pool). Order-independent — callers key by id.
 *
 * **Live-only (R1 — UNN-571):** the ids are dungeon Instance occupancy, so this
 * reads through {@link loadLiveEntityRowsByIds} — a soft-deleted token draws no
 * vitals bar rather than lingering on the delve roster.
 */
export async function loadPartyVitalsByIds(
  ids: readonly string[],
  executor: WriteExecutor = db
): Promise<Map<string, TokenVitals>> {
  if (ids.length === 0) return new Map()

  const rows = await loadLiveEntityRowsByIds(ids, executor)
  const vitalsById = new Map<string, TokenVitals>()

  for (const row of rows) {
    const loaded = loadEntityRow(row)
    if (!loaded.ok) {
      console.error(
        `[loadPartyVitalsByIds] entity ${row.id} failed the load seam`,
        loaded.error
      )
      continue
    }
    const { vitals, skillPool } = resolveEntity(loaded.value).components
    vitalsById.set(row.id, {
      hp: hpPool(vitals) ?? { current: 0, max: 0 },
      sp: spPool(skillPool) ?? { current: 0, max: 0 },
    })
  }

  return vitalsById
}
