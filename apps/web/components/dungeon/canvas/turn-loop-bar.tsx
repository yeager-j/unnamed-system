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

import { CanvasBottomBar } from "@/components/shared/canvas/canvas-bottom-bar"
import { CanvasZoomCluster } from "@/components/shared/canvas/canvas-zoom-cluster"

import { useDungeonCanvas } from "./dungeon-canvas-context"

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
  const [confirmFinish, setConfirmFinish] = useState(false)

  return (
    <>
      <CanvasBottomBar>
        <span className="px-2 font-serif whitespace-nowrap tabular-nums">
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

        <CanvasZoomCluster />

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
