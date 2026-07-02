"use client"

import {
  ArrowRightIcon,
  FlagCheckeredIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
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
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useDungeonCanvas } from "@/components/dungeon/canvas/explore/context"
import { DungeonModeToggle } from "@/components/dungeon/canvas/mode-toggle"
import { CanvasBottomBar } from "@/components/shared/canvas/canvas-bottom-bar"
import { CanvasZoomCluster } from "@/components/shared/canvas/canvas-zoom-cluster"

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
 * the left {@link import("@/components/dungeon/explore/party-sidebar").DungeonPartySidebar}; turn
 * reminders surface as top-right toasts.
 */
export function TurnLoopBar() {
  const {
    turnCounter,
    advanceTurn,
    finishDelve,
    mode,
    onModeChange,
    disabled,
  } = useDungeonCanvas()
  const [confirmFinish, setConfirmFinish] = useState(false)

  return (
    <>
      <CanvasBottomBar>
        <DungeonModeToggle mode={mode} onModeChange={onModeChange} />

        <Separator orientation="vertical" className="mx-2" />

        <span className="pl-1 whitespace-nowrap tabular-nums">
          Turn{" "}
          <span className="font-bold">
            {turnCounter.toString().padStart(2, "0")}
          </span>
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                aria-label="Advance turn"
                onClick={advanceTurn}
                disabled={disabled}
              />
            }
          >
            <ArrowRightIcon weight="bold" />
          </TooltipTrigger>
          <TooltipContent>Advance turn</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-2" />

        <CanvasZoomCluster />

        <Separator orientation="vertical" className="mx-2" />

        {/* Dungeon combat is disabled during the v1 combat cutover (UNN-535);
            it returns on engine v2 in PR11d. A disabled trigger doesn't fire
            Tooltip hover events, so the span carries the title. */}
        <span title="Start an encounter — Combat returns in PR11d">
          <Button size="icon" aria-label="Start an encounter" disabled>
            <SwordIcon weight="fill" />
          </Button>
        </span>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="outline"
                aria-label="Finish delve"
                onClick={() => setConfirmFinish(true)}
                disabled={disabled}
              />
            }
          >
            <FlagCheckeredIcon weight="bold" />
          </TooltipTrigger>
          <TooltipContent>Finish delve</TooltipContent>
        </Tooltip>
      </CanvasBottomBar>

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
    </>
  )
}
