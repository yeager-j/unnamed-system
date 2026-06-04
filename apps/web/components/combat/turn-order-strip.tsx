"use client"

import { cn } from "@workspace/ui/lib/utils"

import type { CombatantView } from "@/lib/game/encounter"

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
  onDraft: (combatantId: string) => void
  onAdvanceRound: () => void
}) {
  const isDrafting = phase === "drafting"

  const isSkipped = (row: CombatantView) => row.isFallen || row.isDowned
  const isStruck = (row: CombatantView) => row.hasActed || isSkipped(row)
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
            <span
              key={row.id}
              data-side={row.side}
              data-testid="turn-strip-current"
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground px-2 py-1 text-xs font-medium"
            >
              <SideDot side={row.side} />
              {row.name}
            </span>
          )
        }

        // Acted or skipped (Fallen/Downed) → a struck, greyed chip.
        if (isStruck(row)) {
          return (
            <span
              key={row.id}
              data-side={row.side}
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground/70 line-through"
            >
              <SideDot side={row.side} muted />
              {row.name}
            </span>
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
        <button
          type="button"
          disabled={isPending}
          onClick={onAdvanceRound}
          className={cn(
            "ml-1 inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium",
            "transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          Round complete — start round {round + 1}
        </button>
      ) : null}
    </div>
  )
}

/** A small side-colored square mirroring the design's combatant glyphs: players
 *  read as primary, enemies as destructive. */
function SideDot({
  side,
  muted = false,
}: {
  side: CombatantView["side"]
  muted?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-[2px]",
        side === "players" ? "bg-primary" : "bg-destructive",
        muted && "opacity-50"
      )}
    />
  )
}
