"use client"

import { useState } from "react"

import { type Archetype } from "@workspace/game-v2/archetypes/archetype"
import { type AtlasNodeState } from "@workspace/game-v2/archetypes/atlas"
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
import { Button, ButtonProps } from "@workspace/ui/components/button"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"

import { useEntityWrite } from "@/domain/entity/use-entity-write"

const NO_RANKS_REASON = "No Saved Archetype Ranks to spend."

/**
 * The Atlas action affordance for one Archetype — the single confirm-then-write
 * flow shared by the detail panel and the recommendation slots. Its label and
 * behavior follow the node's {@link AtlasNodeState}:
 *
 * - `unlockable`       → "Unlock"
 * - `owned`            → "Rank up"
 * - `mastered`         → "Mastered" (inert)
 * - `locked`           → "Prerequisites not met" (inert)
 * - `narrative-locked` → "Story-locked" (inert; the campaign's narrative gate,
 *   re-checked server-side at the entity write door)
 *
 * An actionable button still disables when no Saved Rank is available; the
 * {@link TooltipButton} surfaces the reason on hover/focus. Both cases dispatch
 * the same `spendArchetypeRank` descriptor keyed by Archetype **key** (S3 —
 * UNN-561): the Writer reads the roster and decides unlock-vs-rank-up. The
 * optimistic frame re-folds, so the card, sidebar count, and Saved-Ranks
 * counter all move in one frame.
 */
export function ArchetypeActionButton({
  archetype,
  state,
  savedRanks,
  ...props
}: {
  archetype: Archetype
  state: AtlasNodeState
  savedRanks: number
} & ButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { dispatch } = useEntityWrite()

  if (state.kind === "mastered") {
    return (
      <Button variant="outline" {...props} disabled>
        Mastered
      </Button>
    )
  }

  if (state.kind === "locked") {
    return (
      <Button variant="outline" {...props} disabled>
        Prerequisites not met
      </Button>
    )
  }

  if (state.kind === "narrative-locked") {
    return (
      <Button variant="outline" {...props} disabled>
        Story-locked
      </Button>
    )
  }

  const isUnlock = state.kind === "unlockable"
  const verb = isUnlock ? "unlock" : "rank up"
  const label = isUnlock ? "Unlock" : "Rank up"
  const noRanks = savedRanks <= 0

  function confirm() {
    dispatch(
      {
        component: "archetypes",
        op: "spendArchetypeRank",
        archetypeKey: archetype.key,
      },
      { messages: { error: `Couldn't ${verb} ${archetype.name}. Try again.` } }
    )
    setConfirmOpen(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <TooltipButton
        disabled={noRanks}
        disabledReason={NO_RANKS_REASON}
        title={noRanks ? NO_RANKS_REASON : undefined}
        onClick={() => setConfirmOpen(true)}
        {...props}
      >
        {label}
      </TooltipButton>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to {verb} {archetype.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This spends 1 Saved Archetype Rank.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>{label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
