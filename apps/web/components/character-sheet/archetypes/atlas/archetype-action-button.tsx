"use client"

import { useState } from "react"

import type { Archetype, AtlasNodeState } from "@workspace/game/archetypes"
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
import { TooltipButton } from "@workspace/ui/components/tooltip-button"

import { useCharacterWrite } from "@/hooks/use-character"
import {
  rankUpArchetypeAction,
  unlockArchetypeAction,
} from "@/lib/actions/archetype-ranks"

const NO_RANKS_REASON = "No Saved Archetype Ranks to spend."

/**
 * The Atlas action affordance for one Archetype — the single confirm-then-write
 * flow shared by the detail panel and the recommendation slots. Its label and
 * behavior follow the node's {@link AtlasNodeState}:
 *
 * - `unlockable` → "Unlock for 1 Rank"
 * - `owned`      → "Rank up for 1 Rank"
 * - `mastered`   → "Mastered" (inert)
 * - `locked`     → "Prerequisites not met" (inert)
 *
 * An actionable button still disables when no Saved Rank is available; the
 * {@link TooltipButton} surfaces the reason on hover/focus. The write goes
 * through the shared optimistic pipeline on the `spendArchetypeRank` surface,
 * so the card, sidebar count, and Saved-Ranks counter all re-render in the same
 * frame.
 */
export function ArchetypeActionButton({
  archetype,
  state,
  characterArchetypeId,
  savedRanks,
  size = "default",
  className,
}: {
  archetype: Archetype
  state: AtlasNodeState
  characterArchetypeId: string | null
  savedRanks: number
  size?: "default" | "sm"
  className?: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { write, pending, characterId } = useCharacterWrite()

  if (state.kind === "mastered") {
    return (
      <Button variant="outline" size={size} className={className} disabled>
        Mastered
      </Button>
    )
  }

  if (state.kind === "locked") {
    return (
      <Button variant="outline" size={size} className={className} disabled>
        Prerequisites not met
      </Button>
    )
  }

  const isUnlock = state.kind === "unlockable"
  const verb = isUnlock ? "unlock" : "rank up"
  const label = isUnlock ? "Unlock" : "Rank up"
  const noRanks = savedRanks <= 0

  function confirm() {
    if (isUnlock) {
      write({
        edit: { kind: "unlockArchetype", archetypeKey: archetype.key },
        surface: "spendArchetypeRank",
        action: (expectedVersion) =>
          unlockArchetypeAction({
            characterId,
            archetypeKey: archetype.key,
            expectedVersion,
          }),
        messages: { error: `Couldn't unlock ${archetype.name}. Try again.` },
      })
    } else if (characterArchetypeId) {
      write({
        edit: { kind: "rankUpArchetype", characterArchetypeId },
        surface: "spendArchetypeRank",
        action: (expectedVersion) =>
          rankUpArchetypeAction({
            characterId,
            characterArchetypeId,
            expectedVersion,
          }),
        messages: { error: `Couldn't rank up ${archetype.name}. Try again.` },
      })
    }
    setConfirmOpen(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <TooltipButton
        size={size}
        className={className}
        disabled={noRanks || pending}
        disabledReason={NO_RANKS_REASON}
        title={noRanks ? NO_RANKS_REASON : undefined}
        onClick={() => setConfirmOpen(true)}
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
            <AlertDialogAction onClick={confirm}>
              {isUnlock ? "Unlock" : "Rank up"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
