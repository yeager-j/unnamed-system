"use client"

import {
  CornersOutIcon,
  CursorIcon,
  GraphIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapPinPlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Panel, useReactFlow } from "@xyflow/react"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import type { ToolMode } from "./tool-mode"

const MODES: { mode: ToolMode; label: string; icon: ReactNode }[] = [
  { mode: "select", label: "Select / Pan", icon: <CursorIcon /> },
  { mode: "addZone", label: "Add zone", icon: <MapPinPlusIcon /> },
  { mode: "connect", label: "Connect zones", icon: <GraphIcon /> },
]

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * The bottom-centered floating tool palette (UNN-461) — FigJam-style. A segmented
 * control switches the canvas tool (**Select/Pan** ▸ **Add zone** ▸ **Connect**),
 * then zoom-out / zoom-in / fit-view. Reduced-motion callers get instant
 * (un-animated) viewport changes (PRD a11y).
 */
export function CanvasToolbar({
  mode,
  onModeChange,
}: {
  mode: ToolMode
  onModeChange: (mode: ToolMode) => void
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const duration = prefersReducedMotion() ? 0 : 250

  return (
    <Panel position="bottom-center" className="mb-4">
      <TooltipProvider delay={300}>
        <div className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg">
          <ButtonGroup>
            {MODES.map(({ mode: value, label, icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon"
                      variant={mode === value ? "secondary" : "ghost"}
                      aria-pressed={mode === value}
                      aria-label={label}
                      onClick={() => onModeChange(value)}
                    />
                  }
                >
                  {icon}
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </ButtonGroup>

          <Separator orientation="vertical" className="mx-1 h-6" />

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

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Fit view"
                  onClick={() => void fitView({ duration, padding: 0.2 })}
                />
              }
            >
              <CornersOutIcon />
            </TooltipTrigger>
            <TooltipContent>Fit view</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </Panel>
  )
}
