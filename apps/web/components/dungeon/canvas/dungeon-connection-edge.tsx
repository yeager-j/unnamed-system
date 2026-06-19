"use client"

import {
  BaseEdge,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
} from "@xyflow/react"

import type { ConnectionFogState } from "@workspace/game/engine"

import { EdgeFlagBadge } from "@/components/shared/canvas/edge-flag-badge"
import { useFloatingEdgePath } from "@/components/shared/canvas/use-floating-edge-path"

export type DungeonConnectionEdgeData = {
  fog: ConnectionFogState
  locked: boolean
  /** The authored secret flag (`MapConnection.hidden`) — separate from `fog` so
   *  the DM canvas can split "players can't see it" into *secret* vs *undiscovered*.
   *  Optional: the player fog canvas only ever draws revealed connections, so it
   *  omits it (and the secret/undiscovered styling never applies there). */
  hidden?: boolean
}
export type DungeonConnectionEdge = Edge<
  DungeonConnectionEdgeData,
  "dungeonConnection"
>

/**
 * A connection on the run console (UNN-464) — the play counterpart of the
 * template `ConnectionEdge`, sharing its **floating** routing
 * ({@link useFloatingEdgePath}) so edges leave each Zone on the facing border
 * instead of looping out of a fixed handle. Read-only here (the DM doesn't draw
 * connections in Play mode), so it carries no edit toolbar — it just encodes,
 * **without color**, three DM-facing states:
 * - **revealed** — players see it: a solid edge.
 * - **secret** — a deliberately-hidden passage (`hidden`, still unrevealed):
 *   dashed + faded with an eye-off "Hidden" glyph.
 * - **undiscovered** — an ordinary connection players just haven't reached (it
 *   auto-surfaces as a silhouette once an endpoint is revealed): finer dotted +
 *   fainter with a "footprints" glyph, so it doesn't read as a secret.
 * A locked connection thickens and adds a lock glyph. Reveal/unlock is driven from
 * the Zone details sheet.
 */
export function DungeonConnectionEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<DungeonConnectionEdge>) {
  const geometry = useFloatingEdgePath(source, target)
  if (!geometry) return null

  const fog = data?.fog ?? "revealed"
  const locked = data?.locked ?? false
  const playersSee = fog !== "stripped"
  const secret = !playersSee && (data?.hidden ?? false)
  const undiscovered = !playersSee && !(data?.hidden ?? false)
  const { path, labelX, labelY } = geometry

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        aria-label={`Connection${secret ? " — hidden from players (secret)" : undiscovered ? " — not yet revealed" : ""}${locked ? " — locked" : ""}`}
        style={{
          strokeWidth: locked ? 2.5 : 1.5,
          strokeDasharray: playersSee ? undefined : secret ? "2 5" : "1 4",
          strokeLinecap: playersSee ? undefined : "round",
          stroke: "var(--muted-foreground)",
          opacity: playersSee ? 1 : secret ? 0.55 : 0.35,
        }}
      />

      {(!playersSee || locked) && (
        <EdgeLabelRenderer>
          <EdgeFlagBadge
            labelX={labelX}
            labelY={labelY}
            hidden={secret}
            unrevealed={undiscovered}
            locked={locked}
          />
        </EdgeLabelRenderer>
      )}
    </>
  )
}
