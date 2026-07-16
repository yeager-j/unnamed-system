"use client"

import { Panel } from "@xyflow/react"
import type { ReactNode } from "react"

import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The bottom-centered floating toolbar shell shared by every canvas
 * (UNN-461/464/467) — a React Flow {@link Panel} pinned bottom-center wrapping a
 * tooltip scope and the `bg-popover` bordered bar. Lives **inside** the flow so its
 * children (zoom cluster, turn controls, authoring tools) can drive the viewport.
 * Pass `className` for a per-bar tweak (e.g. the Setup bar's `flex-wrap`).
 */
export function CanvasBottomBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Panel position="bottom-center" className="mb-4">
      <TooltipProvider delay={300}>
        <div
          className={cn(
            "flex items-center gap-1 rounded-xl border bg-card/80 p-3 shadow-lg backdrop-blur-xl",
            className
          )}
        >
          {children}
        </div>
      </TooltipProvider>
    </Panel>
  )
}
