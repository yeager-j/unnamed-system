"use client"

import { Panel } from "@xyflow/react"
import type { ReactNode } from "react"

/**
 * The top-centered "nothing here yet" notice shared by the canvases — a small
 * `bg-popover` bordered {@link Panel} for the empty-board state (no zones on the DM
 * canvas; nothing explored yet on the player fog map).
 */
export function CanvasEmptyNotice({ children }: { children: ReactNode }) {
  return (
    <Panel
      position="top-center"
      className="rounded-none border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-sm"
    >
      {children}
    </Panel>
  )
}
