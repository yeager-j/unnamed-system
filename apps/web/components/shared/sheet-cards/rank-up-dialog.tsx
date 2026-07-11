"use client"

import type { VirtueKey } from "@workspace/game-v2/kernel/vocab"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import type { VirtuesCardView } from "@/domain/character/view/virtues-card"
import { useEntityWrite } from "@/domain/entity/use-entity-write"
import { VIRTUE_LABELS } from "@/domain/labels"

/**
 * The forced rank-up (rulebook 1.2): a full Spark log must convert into a
 * rank before more Sparks accrue. Lists **eligible** Virtues only (those in
 * the log — `eligibleVirtuesForRankUp` via the view model); a Virtue already
 * at the ceiling stays listed but disabled, since the engine keeps the log
 * intact on `rank-capped` so another eligible pick can spend it.
 */
export function RankUpDialog({
  view,
  open,
  onOpenChange,
}: {
  view: VirtuesCardView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch } = useEntityWrite()

  const rankUp = (virtue: VirtueKey) => {
    dispatch(
      { component: "virtues", op: "rankUp", virtue },
      { messages: { error: "Couldn't rank up. Try again." } }
    )
    onOpenChange(false)
  }

  const allCapped =
    view.eligible.length > 0 &&
    view.eligible.every((virtue) => view.rankCapped[virtue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rank Up a Virtue</DialogTitle>
          <DialogDescription>
            Your Spark log is full. Choose a Virtue you earned Sparks for —
            ranking up spends the log.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {view.eligible.map((virtue) => {
            const capped = view.rankCapped[virtue]
            const rank = view.rows.find((row) => row.virtue === virtue)?.rank
            return (
              <Button
                key={virtue}
                variant="outline"
                disabled={capped}
                onClick={() => rankUp(virtue)}
                className="justify-between"
              >
                <span>{VIRTUE_LABELS[virtue]}</span>
                <span className="text-xs text-muted-foreground">
                  {capped ? "At max rank" : `${rank} → ${(rank ?? 0) + 1}`}
                </span>
              </Button>
            )
          })}
        </div>
        {allCapped ? (
          <p className="text-xs text-muted-foreground">
            Every eligible Virtue is at its ceiling. Talk to your DM — the log
            stays until a Virtue can take the rank.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
