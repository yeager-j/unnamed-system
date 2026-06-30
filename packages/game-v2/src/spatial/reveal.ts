import type { MapConnection } from "./geometry.schema"
import type { MapInstanceState, RevealState } from "./map-instance.schema"

/**
 * The **fog / reveal derivation** over the runtime {@link RevealState} overlay and
 * the authored connection `hidden`/`locked` flags (ADR §2.7; re-homed from v1
 * `engine/encounter/resolve-reveal.ts`, PRESERVE). Pure read selectors — the reveal
 * slice of `reduceMapInstance` writes the overlay; nothing here is stored. The
 * three-state {@link connectionFogState} is the `editGeometry` slice's reconciliation
 * partner and the source the S6 fog-clamping player projector strips `stripped`
 * elements by.
 *
 * Stays in `spatial/` (it reads only spatial state); the redaction projector that
 * *consumes* it lives consumer-side in `visibility/` (`visibility → spatial` is
 * allowed; the reverse is the sealed seam).
 */

/**
 * The fog state of a connection from the **players'** point of view:
 *
 * - `revealed` — both endpoint Zones are revealed; the edge is fully in context.
 * - `known-exit` — exactly one endpoint is revealed; players see *that* an exit
 *   exists (the silhouette) and whether it's locked, but the far Zone stays
 *   unnamed/stripped until they reach it.
 * - `stripped` — not surfaced: a `hidden` connection the DM hasn't revealed, or a
 *   connection neither of whose endpoints has been discovered yet.
 */
export type ConnectionFogState = "revealed" | "known-exit" | "stripped"

/** Whether `zoneId` is currently revealed to players. */
export function isZoneRevealed(reveal: RevealState, zoneId: string): boolean {
  return reveal.revealedZoneIds.includes(zoneId)
}

/**
 * Whether an Instance is **fog-gated** — governed by exploration reveal state (a
 * delve), as opposed to a standalone encounter whose whole map is always visible. A
 * delve reveals at least its party's starting Zone, so a non-empty `revealedZoneIds`
 * is the structural signal; a standalone encounter never populates reveal (it
 * defaults empty), so its watch shows the full map. The S6 spatial projector uses
 * this to run the fog-clamping arm only on a delve Instance (SD10).
 */
export function isFogActive(reveal: RevealState): boolean {
  return reveal.revealedZoneIds.length > 0
}

/**
 * A connection's effective locked state: its authored `locked` flag *unless* the DM
 * has unlocked it at runtime. A locked connection shows as a known-exit but blocks
 * movement until unlocked.
 */
export function isConnectionLocked(
  connection: MapConnection,
  reveal: RevealState
): boolean {
  return (
    connection.locked && !reveal.unlockedConnectionIds.includes(connection.id)
  )
}

/**
 * The fog state of one connection (the three-state derivation contract). A `hidden`
 * connection is `stripped` until the DM reveals it (`revealedConnectionIds`); a
 * visible connection is `revealed` when both endpoints are revealed, a `known-exit`
 * when one is, and `stripped` when neither is (an exit isn't surfaced until the party
 * reaches one of its Zones).
 */
export function connectionFogState(
  connection: MapConnection,
  reveal: RevealState
): ConnectionFogState {
  const visible =
    !connection.hidden || reveal.revealedConnectionIds.includes(connection.id)
  if (!visible) return "stripped"

  const fromRevealed = reveal.revealedZoneIds.includes(connection.fromZoneId)
  const toRevealed = reveal.revealedZoneIds.includes(connection.toZoneId)
  if (fromRevealed && toRevealed) return "revealed"
  if (fromRevealed || toRevealed) return "known-exit"
  return "stripped"
}

/** A connection paired with its derived fog view, for the canvas + projection. */
export interface ConnectionRevealView {
  connection: MapConnection
  state: ConnectionFogState
  locked: boolean
}

/**
 * The whole reveal view of an Instance: the set of revealed Zone ids and a
 * per-connection fog state + effective-locked flag. Consumed by the DM console (to
 * badge what players currently see) and the player snapshot (to strip `stripped`
 * elements server-side). Pure derivation over geometry + the runtime reveal overlay —
 * no stored "known exit" state.
 */
export function resolveRevealView(mapInstance: MapInstanceState): {
  revealedZoneIds: string[]
  connections: ConnectionRevealView[]
} {
  return {
    revealedZoneIds: [...mapInstance.reveal.revealedZoneIds],
    connections: Object.values(mapInstance.geometry.connections).map(
      (connection) => ({
        connection,
        state: connectionFogState(connection, mapInstance.reveal),
        locked: isConnectionLocked(connection, mapInstance.reveal),
      })
    ),
  }
}
