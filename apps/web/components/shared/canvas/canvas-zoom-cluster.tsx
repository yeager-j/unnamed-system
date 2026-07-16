"use client"

import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useReactFlow, useViewport } from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { prefersReducedMotion } from "@/components/shared/canvas/reduced-motion"

/**
 * The zoom-out / fit-view / zoom-in cluster shared by every React Flow bar — the
 * dungeon turn-loop / setup / combat bars and the Map editor toolbar. Reads the
 * viewport off {@link useReactFlow} / {@link useViewport} internally, so a bar
 * drops its ~47-line block for one element. Renders three `Tooltip`s; the caller
 * supplies the surrounding `TooltipProvider` and any flanking `Separator` (whose
 * margin differs per bar, so it stays at the call site).
 */
export function CanvasZoomCluster() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const duration = prefersReducedMotion() ? 0 : 250

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom out"
              onClick={() => void zoomOut({ duration })}
            />
          }
        >
          <MagnifyingGlassMinusIcon />
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              className="min-w-14 tabular-nums"
              aria-label="Fit view"
              onClick={() => void fitView({ duration, padding: 0.2 })}
            />
          }
        >
          {Math.round(zoom * 100)}%
        </TooltipTrigger>
        <TooltipContent>Fit view</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom in"
              onClick={() => void zoomIn({ duration })}
            />
          }
        >
          <MagnifyingGlassPlusIcon />
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>
    </>
  )
}
