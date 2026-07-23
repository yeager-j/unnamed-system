import { defineCanon, type Canon } from "@workspace/headcanon"

import type { MapCanonValue } from "@/domain/map/commit/protocol"
import { mapAxis } from "@/lib/db/axes"
import type { MapRow } from "@/lib/db/schema/map"

export function toMapCanon(
  map: Pick<MapRow, "id" | "name" | "geometry" | "version">
): Canon<MapCanonValue> {
  return defineCanon({
    value: { name: map.name, geometry: map.geometry },
    revisions: { [mapAxis(map.id)]: map.version },
  })
}
