"use client"

import { SwordIcon, XIcon } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import { useDungeonSetupCanvas } from "@/components/dungeon/canvas/setup/context"
import { CanvasBottomBar } from "@/components/shared/canvas/canvas-bottom-bar"
import { CanvasZoomCluster } from "@/components/shared/canvas/canvas-zoom-cluster"

/**
 * The encounter **Setup** phase's bottom Panel (UNN-467): **Cancel** (returns to
 * exploration, no state change) · **Begin encounter (N)** (gated on ≥1 placed
 * enemy; opens the advantage / first-side dialog) · the shared zoom cluster. State
 * comes from {@link useDungeonSetupCanvas}.
 */
export function SetupBar() {
  const { beginCount, canBegin, onBegin, onCancel, disabled } =
    useDungeonSetupCanvas()

  return (
    <CanvasBottomBar className="flex-wrap">
      <span className="px-2 font-heading text-sm font-medium">
        Set up encounter
      </span>

      <Button size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
        <XIcon />
        Cancel
      </Button>
      <Button size="sm" onClick={onBegin} disabled={!canBegin || disabled}>
        <SwordIcon weight="fill" />
        Begin encounter ({beginCount})
      </Button>

      <Separator orientation="vertical" className="mx-1" />

      <CanvasZoomCluster />
    </CanvasBottomBar>
  )
}
