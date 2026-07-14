"use client"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { CombatantChip, SideDot } from "@/components/combat/combatant-chip"
import type { CombatantView } from "@/domain/combat/view/console-view"

export type ConsolePhase = "active" | "resolving" | "drafting"

/**
 * The turn-order spine (UNN-344): combatants in session order, with acted /
 * skipped ones struck-through, the current actor boxed (an active turn), and the
 * side's eligible picks rendered as tappable "glowing" candidates (a draft).
 * Whatever isn't shown individually folds into a trailing **"+N to act"**
 * counter — the AC's "counter for the remainder". When a draft has no one left
 * to pick, the round is over and the strip offers **Start round N+1**.
 *
 * Pure presentation over the {@link CombatantView} rows the console derived;
 * every tap routes back out through `onDraft` / `onAdvanceRound` (no write path
 * of its own).
 */
export function TurnOrderStrip({
  rows,
  phase,
  round,
  roundComplete,
  isPending,
  onDraft,
  onAdvanceRound,
}: {
  rows: CombatantView[]
  phase: ConsolePhase
  round: number
  roundComplete: boolean
  isPending: boolean
  onDraft: (participantId: ParticipantId) => void
  onAdvanceRound: () => void
}) {
  const isDrafting = phase === "drafting"

  const isStruck = (row: CombatantView) => row.hasActed || row.isFallen
  const isCandidate = (row: CombatantView) => isDrafting && row.isEligible
  const isBoxed = (row: CombatantView) => !isDrafting && row.isCurrent

  const renderedInline = (row: CombatantView) =>
    isStruck(row) || isBoxed(row) || isCandidate(row)

  const toAct = rows.filter((row) => !renderedInline(row)).length

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rows.map((row) => {
        if (isCandidate(row)) {
          return (
            <button
              key={row.id}
              type="button"
              disabled={isPending}
              onClick={() => onDraft(row.id)}
              aria-label={`Draft ${row.name}`}
              data-side={row.side}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border-2 border-primary px-2 py-1 text-xs font-medium",
                "ring-2 ring-primary/30 transition-colors hover:bg-primary/10",
                "focus-visible:ring-3 focus-visible:ring-primary/50 focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <SideDot side={row.side} />
              {row.name}
              <span className="text-[10px] tracking-wide text-primary uppercase">
                tap
              </span>
            </button>
          )
        }

        if (isBoxed(row)) {
          return (
            <CombatantChip
              key={row.id}
              side={row.side}
              label={row.name}
              data-testid="turn-strip-current"
              className="border-2 border-foreground font-medium"
            />
          )
        }

        // Acted or Fallen → a struck, greyed chip.
        if (isStruck(row)) {
          return (
            <CombatantChip
              key={row.id}
              side={row.side}
              label={row.name}
              muted
              className="text-muted-foreground/70 line-through"
            />
          )
        }

        // Still to act but not shown individually (the other side's pending, or
        // this side's picks during an active turn) → folded into "+N to act".
        return null
      })}

      {toAct > 0 ? (
        <span className="px-1 text-xs text-muted-foreground">
          +{toAct} to act
        </span>
      ) : null}

      {isDrafting && roundComplete ? (
        <Button
          variant="outline"
          size="sm"
          className="ml-1"
          disabled={isPending}
          onClick={onAdvanceRound}
        >
          Round complete — start round {round + 1}
        </Button>
      ) : null}
    </div>
  )
}
