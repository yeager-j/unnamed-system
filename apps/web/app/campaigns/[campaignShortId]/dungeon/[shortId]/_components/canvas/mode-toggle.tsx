"use client"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

export type DungeonConsoleMode = "play" | "edit"

/**
 * The run console's **Edit ⇄ Play** segmented control (UNN-486) — DM-local,
 * ephemeral UI orthogonal to the delve's status (ADR — *Console topology*). It
 * lives **inside** each board's bottom bar (the play {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/turn-loop-bar").TurnLoopBar}
 * and the Edit-mode {@link import("@/components/maps/canvas/canvas-toolbar").CanvasToolbar}),
 * so it sits in the same place across the swap instead of floating over the canvas.
 * Play draws tokens/fog; Edit swaps in the Map builder over the live Instance.
 */
export function DungeonModeToggle({
  mode,
  onModeChange,
}: {
  mode: DungeonConsoleMode
  onModeChange: (mode: DungeonConsoleMode) => void
}) {
  return (
    <ToggleGroup
      aria-label="Canvas mode"
      variant="outline"
      size="sm"
      spacing={0}
      value={[mode]}
      onValueChange={(value) => {
        const next = value[0] as DungeonConsoleMode | undefined
        if (next) onModeChange(next)
      }}
    >
      <ToggleGroupItem value="play">Play</ToggleGroupItem>
      <ToggleGroupItem value="edit">Edit</ToggleGroupItem>
    </ToggleGroup>
  )
}
