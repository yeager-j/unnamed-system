"use client"

import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  SwordIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Panel, useReactFlow, useViewport } from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useDungeonSetupCanvas } from "./dungeon-setup-canvas-context"

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * The encounter **Setup** phase's bottom Panel (UNN-467): **Cancel** (returns to
 * exploration, no state change) · **Begin encounter (N)** (gated on ≥1 placed
 * enemy; opens the advantage / first-side dialog) · the shared zoom cluster. State
 * comes from {@link useDungeonSetupCanvas}.
 */
export function SetupBar() {
  const { beginCount, canBegin, onBegin, onCancel, disabled } =
    useDungeonSetupCanvas()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const duration = prefersReducedMotion() ? 0 : 250

  return (
    <Panel position="bottom-center" className="mb-4">
      <TooltipProvider delay={300}>
        <div className="flex flex-wrap items-center gap-1 rounded-none border bg-popover p-3 shadow-lg">
          <span className="px-2 font-heading text-sm font-medium">
            Set up encounter
          </span>

          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={disabled}
          >
            <XIcon />
            Cancel
          </Button>
          <Button size="sm" onClick={onBegin} disabled={!canBegin || disabled}>
            <SwordIcon weight="fill" />
            Begin encounter ({beginCount})
          </Button>

          <Separator orientation="vertical" className="mx-1" />

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
        </div>
      </TooltipProvider>
    </Panel>
  )
}
