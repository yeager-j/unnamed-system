import {
  defaultPages,
  type MapGeometry,
} from "@workspace/game-v2/spatial/geometry.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"

/**
 * The two Map-Instance mints (UNN-540 — re-homed from v1's `session-factory.ts`):
 * the blank Instance an encounter/dungeon is born with, and the delve-start
 * geometry snapshot. Combat's **birth co-mint** (participant tokens laid onto a
 * base Instance) stays in `encounter/reduce-encounter.ts` (`comintMapInstance`) —
 * it needs a `Session`, which spatial never sees (SD2).
 */

/** A fresh, empty Map-Instance — no geometry, occupancy, enchantment, or reveal.
 *  The shape the create actions mint before setup/delve-start; also the co-mint
 *  default for a mapless / standalone encounter. */
export function emptyMapInstance(): MapInstanceState {
  return {
    geometry: { pages: defaultPages(), zones: {}, connections: {} },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    lastMovedTokenKey: null,
  }
}

/**
 * Mints a fresh {@link MapInstanceState} from an authored Map's {@link MapGeometry}
 * — the **delve-start snapshot** (UNN-464 Decision 7). The Instance takes a copy
 * of the template geometry (so later My Maps edits never reach this run — snapshot
 * isolation) plus empty runtime: no occupancy, no Enchantment, nothing revealed
 * yet. PC tokens are placed in the same `delve-start` transaction; the
 * `move → reveal` rule then reveals Zones as the party explores. Deps-free (the
 * geometry already carries stable ids), so a plain function, not a curried factory.
 */
export function mapInstanceFromGeometry(
  geometry: MapGeometry
): MapInstanceState {
  return {
    ...emptyMapInstance(),
    geometry: structuredClone(geometry),
  }
}
