"use client"

import { LineSegmentIcon, PlusSquareIcon } from "@phosphor-icons/react/dist/ssr"
import { Panel } from "@xyflow/react"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Separator } from "@workspace/ui/components/separator"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { CanvasZoomCluster } from "@/components/shared/canvas/canvas-zoom-cluster"

import type { ToolMode } from "./tool-mode"

/** The two authoring tools (icon + label) — what a click creates. Toggling one off
 *  returns to the neutral `select` mode (scroll-pan + box-select). */
const CREATE_MODES: { mode: ToolMode; label: string; icon: ReactNode }[] = [
  { mode: "addZone", label: "Zone", icon: <PlusSquareIcon /> },
  { mode: "connect", label: "Connect", icon: <LineSegmentIcon /> },
]

/**
 * The bottom-centered floating tool palette (UNN-461) — FigJam-style. The two
 * authoring tools (**Zone** ▸ **Connect**), then a zoom cluster: zoom-out, a live
 * zoom-percentage readout that fits the view on click, and zoom-in. There's no
 * Select/Pan tool — the canvas pans on scroll and box-selects on drag by default.
 * Reduced-motion callers get instant (un-animated) viewport changes (PRD a11y).
 */
export function CanvasToolbar({
  mode,
  onModeChange,
}: {
  mode: ToolMode
  onModeChange: (mode: ToolMode) => void
}) {
  return (
    <Panel position="bottom-center" className="mb-4">
      <TooltipProvider delay={300}>
        <div className="flex items-center gap-1 rounded-none border bg-popover p-3 shadow-lg">
          <ButtonGroup>
            {CREATE_MODES.map(({ mode: value, label, icon }) => (
              <Button
                key={value}
                variant={mode === value ? "secondary" : "ghost"}
                aria-pressed={mode === value}
                onClick={() => onModeChange(mode === value ? "select" : value)}
              >
                {icon}
                {label}
              </Button>
            ))}
          </ButtonGroup>

          <Separator orientation="vertical" />

          <CanvasZoomCluster />
        </div>
      </TooltipProvider>
    </Panel>
  )
}
