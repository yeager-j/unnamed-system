import type {
  MapInstanceState,
  Zone,
} from "@workspace/game/foundation/encounter/map-instance"

/**
 * The zones bordering `zoneId`, resolved to {@link Zone} objects (UNN-313's
 * adjacency is stored as ids; this is the one place that walks it). Undefined-safe:
 * an adjacency entry pointing at a removed zone is skipped. Shared by the
 * battlefield layout (UNN-314, `resolve-zone-layout.ts`) and the move control's
 * target list (UNN-315) so the graph is read one way. A zone is never adjacent to
 * itself (UNN-313 forbids self-loops), so `zoneId` never appears in the result.
 */
export function adjacentZones(
  instance: MapInstanceState,
  zoneId: string
): Zone[] {
  // Stryker disable next-line ArrayDeclaration: equivalent — when `zoneId` has no adjacency entry, a junk fallback element resolves through `instance.zones[id]` to undefined and is filtered out, yielding the same empty result as `[]`.
  return (instance.adjacency[zoneId] ?? []).flatMap((id) => {
    const zone = instance.zones[id]
    return zone ? [zone] : []
  })
}
