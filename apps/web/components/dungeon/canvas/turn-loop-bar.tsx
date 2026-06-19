"use client"

import {
  ArrowRightIcon,
  FlagCheckeredIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Panel, useReactFlow, useViewport } from "@xyflow/react"
import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useDungeonCanvas } from "./dungeon-canvas-context"

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * The DM run console's bottom **Panel** (UNN-464 chrome pass) — the dungeon-turn
 * counter + Advance, Finish delve, and the canvas zoom cluster (zoom-out, a live
 * zoom-percentage readout that fits the view on click, zoom-in). It lives **inside**
 * React Flow so it can drive the viewport (matching the editor's
 * {@link import("@/components/maps/canvas/canvas-toolbar").CanvasToolbar}); its
 * turn-loop state + dispatchers come from {@link useDungeonCanvas} (the run console
 * provides them), so nothing threads through `DungeonCanvas`.
 *
 * The turn counter is the only turn signal players ever see (no turn queue in
 * exploration — PRD FR-6). The party (and the delve's back/name header) lives in
 * the left {@link import("../dungeon-party-sidebar").DungeonPartySidebar}; turn
 * reminders surface as top-right toasts.
 */
export function TurnLoopBar() {
  const { turnCounter, advanceTurn, startEncounter, finishDelve, disabled } =
    useDungeonCanvas()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const duration = prefersReducedMotion() ? 0 : 250
  const [confirmFinish, setConfirmFinish] = useState(false)

  return (
    <Panel position="bottom-center" className="mb-4">
      <TooltipProvider delay={300}>
        <div className="flex flex-wrap items-center gap-1 rounded-none border bg-popover p-3 shadow-lg">
          <span className="px-2 font-serif tabular-nums">
            Dungeon Turn{" "}
            <span className="font-bold">
              {turnCounter.toString().padStart(2, "0")}
            </span>
          </span>
          <Button size="sm" onClick={advanceTurn} disabled={disabled}>
            Advance
            <ArrowRightIcon weight="bold" />
          </Button>

          <Separator orientation="vertical" className="mx-2" />

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

          <Separator orientation="vertical" className="mx-2" />

          <Button size="sm" onClick={startEncounter} disabled={disabled}>
            <SwordIcon weight="fill" />
            Start an encounter
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmFinish(true)}
            disabled={disabled}
          >
            <FlagCheckeredIcon weight="bold" />
            Finish delve
          </Button>
        </div>
      </TooltipProvider>

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish this delve?</AlertDialogTitle>
            <AlertDialogDescription>
              The delve will be marked done. Players see a frozen final map.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                finishDelve()
                setConfirmFinish(false)
              }}
            >
              Finish delve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}
