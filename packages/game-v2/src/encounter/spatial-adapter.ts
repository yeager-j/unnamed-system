import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import {
  activeEnchantment,
  engagementOf,
  zoneOf,
} from "@workspace/game-v2/spatial/selectors"

import type { EncounterInstanceComponents } from "./instance"
import type { SpatialReads } from "./spatial-reads"

/**
 * The **combat-side `SpatialReads` adapter** + the instance read-bag projection
 * (spatial ADR §2.6/§2.9; SD8 — the subtlest correctness point in the layer). Spatial
 * exports raw selectors over its own state and names **neither** the port **nor** any
 * `encounter/` type; this module — on the combat side, where importing `spatial/` is
 * the legitimate seam direction — wraps those selectors into the port and projects the
 * occupancy token into the `position`/`engagement` instance components. Binding the
 * adapter here (rather than having spatial implement the port) is what keeps the
 * dependency one-way; collapsing the hop would re-break SD2 and fail depcheck.
 */

/**
 * Binds a {@link SpatialReads} adapter over a Map-Instance: the parameterless
 * `activeEnchantment` singleton and the `zoneOf` lookup, both closing over `instance`.
 * The shape the combat resolver receives injected (the one engine-modeled combat →
 * spatial read, feeding the zone-enchantment effect into `resolve`). A mapless
 * encounter binds this over an empty Instance — `zoneOf → undefined`,
 * `activeEnchantment → null` — reproducing the mapless stub exactly.
 */
export function spatialReadsFor(mapInstance: MapInstanceState): SpatialReads {
  return {
    zoneOf: (participantId) => zoneOf(mapInstance, participantId),
    activeEnchantment: () => activeEnchantment(mapInstance),
  } satisfies SpatialReads
}

/**
 * The **instance read-bag projection** (SD8): the token → component map
 * `assembleParticipantView`'s third argument consumes. An occupied participant
 * projects to `{ position: { zoneId }, engagement }` — the bare `zoneId` wrapped into
 * the `Position` component combat-side (spatial never names `Position`), and the
 * kernel `Engagement` value flowing straight through (no `encounter/` import in
 * spatial, no duplication). An **unplaced** participant projects to `{}`, so its view
 * carries no instance keys and `engagedWith` is structurally `[]` (CD17).
 */
export function mapInstanceComponentsFor(
  mapInstance: MapInstanceState
): (participantId: ParticipantId) => Partial<EncounterInstanceComponents> {
  return (participantId) => {
    const zoneId = zoneOf(mapInstance, participantId)
    if (zoneId === undefined) return {}
    return {
      position: { zoneId },
      engagement: engagementOf(mapInstance, participantId),
    }
  }
}
