"use client"

import type { Node, NodeProps } from "@xyflow/react"

/**
 * A generation **stub** on the DM exploration board (UNN-590, D8) — the dashed
 * ghost of a room that doesn't exist yet, hanging off its parent Zone along the
 * stub's bearing. P3a renders the frontier; the click-to-expand gesture is
 * P3b's, so the node is deliberately inert (not selectable, not draggable, no
 * toolbar, no handles). DM-only by construction: the watch never sees this node
 * — players get the stub as an ordinary exit silhouette in the snapshot (D10).
 *
 * Visual grammar rhymes with the `unmapped` ThresholdNotch (dashed, muted,
 * void-filled): same "leads somewhere uncharted" voice, one register louder so
 * the DM can find the expandable frontier at a glance.
 */
export type StubGhostData = {
  stubId: string
  parentZoneName: string
}
export type StubGhostNode = Node<StubGhostData, "stubGhost">

/** Ghost card size — smaller than any real footprint; render-only. */
export const GHOST_SIZE = { w: 96, h: 72 }

export function DungeonStubGhostNode({ data }: NodeProps<StubGhostNode>) {
  return (
    <div
      role="img"
      aria-label={`Unexplored passage off ${data.parentZoneName}`}
      className="flex h-full w-full items-center justify-center border border-dashed border-muted-foreground/50 bg-transparent opacity-60"
      style={{ width: GHOST_SIZE.w, height: GHOST_SIZE.h }}
    >
      <span className="text-[10px] tracking-widest text-muted-foreground uppercase select-none">
        ?
      </span>
    </div>
  )
}
