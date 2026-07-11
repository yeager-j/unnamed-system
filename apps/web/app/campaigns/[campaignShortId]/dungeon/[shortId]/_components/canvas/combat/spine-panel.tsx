"use client"

import { Panel } from "@xyflow/react"

import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

import { TurnOrderStrip } from "@/components/combat/turn-order-strip"

import { useDungeonCombatCanvas } from "./context"

/**
 * The combat turn-order spine, pinned **top-center** inside the React Flow canvas
 * (UNN-536) — the dungeon combat peer of the mapless console's header strip. It
 * shows whose draft it is ("Players' draft — tap who's up") or who is acting ("Now
 * acting: X"), the {@link TurnOrderStrip} (tap an eligible combatant to draft it;
 * "start round N+1" when both sides are spent), and — while a combatant is acting —
 * the **move-anywhere** override (guided adjacency ⇄ any zone). All state comes from
 * {@link useDungeonCombatCanvas}; the run console provides it.
 */
export function CombatSpinePanel() {
  const {
    phase,
    round,
    draftHeading,
    actingName,
    turnRows,
    roundComplete,
    onDraft,
    onAdvanceRound,
    moveAnywhere,
    onToggleMoveAnywhere,
    disabled,
  } = useDungeonCombatCanvas()

  return (
    <Panel
      position="top-center"
      className="mt-4 flex max-w-[min(90vw,42rem)] flex-col gap-2 rounded-none border bg-popover/95 p-3 shadow-lg backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="font-heading text-sm font-medium">
          {phase === "drafting"
            ? draftHeading
            : phase === "resolving"
              ? "Resolving end-of-turn checks…"
              : `Now acting: ${actingName}`}
        </h2>
        {phase === "active" ? (
          <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <Switch
              checked={moveAnywhere}
              onCheckedChange={onToggleMoveAnywhere}
              disabled={disabled}
            />
            Move anywhere
          </Label>
        ) : null}
      </div>
      <TurnOrderStrip
        rows={turnRows}
        phase={phase}
        round={round}
        roundComplete={roundComplete}
        isPending={disabled}
        onDraft={onDraft}
        onAdvanceRound={onAdvanceRound}
      />
    </Panel>
  )
}
