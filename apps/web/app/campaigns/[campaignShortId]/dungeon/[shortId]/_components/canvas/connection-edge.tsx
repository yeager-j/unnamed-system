"use client"

import { BaseEdge, useStore, type Edge, type EdgeProps } from "@xyflow/react"

import type { ConnectionFogState } from "@workspace/game-v2/spatial"

import { useNotchHighlight } from "@/components/shared/canvas/hovered-connection-context"
import { straightPath } from "@/components/shared/canvas/threshold-geometry-path"
import { ThresholdNotchPair } from "@/components/shared/canvas/threshold-notch-pair"
import { useThresholdAnchors } from "@/components/shared/canvas/use-threshold-anchors"
import { thresholdStateOf } from "@/domain/map/view/threshold-state"

export type DungeonConnectionEdgeData = {
  fog: ConnectionFogState
  locked: boolean
  /** The authored secret flag (`MapConnection.hidden`) — separate from `fog` so
   *  the DM canvas can split "players can't see it" into *secret* vs *undiscovered*.
   *  Optional: the player fog canvas only ever draws revealed connections, so it
   *  omits it (and the secret styling never applies there). */
  hidden?: boolean
  /** The two endpoint zone names — the notches label the doorway ("⇢ The Nave"). */
  fromName: string
  toName: string
}
export type DungeonConnectionEdge = Edge<
  DungeonConnectionEdgeData,
  "dungeonConnection"
>

/**
 * A connection on the run console + player watch (UNN-464/633) — the play counterpart
 * of the template {@link import("@/components/shared/canvas/connection-edge").ConnectionEdge},
 * sharing its **rim-threshold** skin: the edge stays a React Flow edge with a
 * transparent interaction path (no line is ever drawn — AC 1), and the visible mark is
 * the paired notch on the two facing walls ({@link ThresholdNotchPair}). Read-only here
 * (the DM doesn't draw connections in Play mode), so it carries no edit toolbar and is
 * `selectable: false` — but it stays focusable, so keyboard + pairing glow work.
 *
 * The three DM-facing states map through {@link thresholdStateOf} without color:
 * **revealed** → open notch, **secret** (`hidden`, still unrevealed) → dashed jambs,
 * **undiscovered** → dotted jambs at reduced opacity. A locked connection adds the
 * padlock glyph. Player-side, structural redaction leaves only revealed connections,
 * so a stub opening into darkness renders separately from the watch zone node.
 */
export function DungeonConnectionEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<DungeonConnectionEdge>) {
  const anchors = useThresholdAnchors(source, target)
  const zoom = useStore((s) => s.transform[2])
  const highlighted = useNotchHighlight(id)

  if (!anchors) return null

  const state = thresholdStateOf({
    fog: data?.fog ?? "revealed",
    hidden: data?.hidden ?? false,
    locked: data?.locked ?? false,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={straightPath(anchors)}
        interactionWidth={Math.max(20, Math.round(44 / zoom))}
        style={{ stroke: "transparent", strokeWidth: 1 }}
      />
      <ThresholdNotchPair
        anchors={anchors}
        state={state}
        highlighted={highlighted}
        names={
          data ? { source: data.fromName, target: data.toName } : undefined
        }
      />
    </>
  )
}
