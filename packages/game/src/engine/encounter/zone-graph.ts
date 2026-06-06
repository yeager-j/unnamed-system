import type {
  CombatSession,
  Zone,
} from "@workspace/game/foundation/encounter/session"

/**
 * The zones bordering `zoneId`, resolved to {@link Zone} objects (UNN-313's
 * adjacency is stored as ids; this is the one place that walks it). Undefined-safe:
 * an adjacency entry pointing at a removed zone is skipped. Shared by the
 * battlefield layout (UNN-314, `resolve-zone-layout.ts`) and the move control's
 * target list (UNN-315) so the graph is read one way. A zone is never adjacent to
 * itself (UNN-313 forbids self-loops), so `zoneId` never appears in the result.
 */
export function adjacentZones(session: CombatSession, zoneId: string): Zone[] {
  return (session.adjacency[zoneId] ?? []).flatMap((id) => {
    const zone = session.zones[id]
    return zone ? [zone] : []
  })
}
