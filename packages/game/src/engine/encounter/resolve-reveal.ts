import type {
  MapInstanceState,
  RevealState,
} from "@workspace/game/foundation/encounter/map-instance"
import type { MapConnection } from "@workspace/game/foundation/map/geometry"

/**
 * The fog state of a connection from the **players'** point of view (UNN-464):
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
 * delve), as opposed to a standalone encounter whose whole map is always visible.
 * A delve reveals at least its party's starting Zone on start, so a non-empty
 * `revealedZoneIds` is the structural signal; a standalone encounter never
 * populates reveal (it defaults empty), so its watch shows the full map. The
 * encounter player snapshot uses this to fog-redact only when combat runs on a
 * delve Instance — see {@link import("./player-snapshot").projectPlayerSnapshot}.
 */
export function isFogActive(reveal: RevealState): boolean {
  return reveal.revealedZoneIds.length > 0
}

/**
 * A connection's effective locked state: its authored `locked` flag *unless* the
 * DM has unlocked it at runtime. A locked connection shows as a known-exit but
 * blocks movement until unlocked (PRD FR-5).
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
 * The fog state of one connection (the three-state derivation contract). A
 * `hidden` connection is `stripped` until the DM reveals it
 * (`revealedConnectionIds`); a visible connection is `revealed` when both
 * endpoints are revealed, a `known-exit` when one is, and `stripped` when neither
 * is (an exit isn't surfaced until the party reaches one of its Zones).
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
 * per-connection fog state + effective-locked flag. Consumed by the DM console
 * (to badge what players currently see) now, and the M3 player snapshot (to strip
 * `stripped` elements server-side) later. Pure derivation over geometry + the
 * runtime reveal overlay — no stored "known exit" state.
 */
export function resolveRevealView(instance: MapInstanceState): {
  revealedZoneIds: string[]
  connections: ConnectionRevealView[]
} {
  return {
    revealedZoneIds: [...instance.reveal.revealedZoneIds],
    connections: Object.values(instance.geometry.connections).map(
      (connection) => ({
        connection,
        state: connectionFogState(connection, instance.reveal),
        locked: isConnectionLocked(connection, instance.reveal),
      })
    ),
  }
}
