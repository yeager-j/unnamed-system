import { ArrowFatLineUpIcon, PathIcon } from "@phosphor-icons/react"

import { type PathChoice } from "@workspace/game-v2/kernel/vocab"
import { Badge } from "@workspace/ui/components/badge"

import { PATH_CHOICE_LABELS } from "@/domain/labels"

/**
 * The Atlas's in-page Saved-Ranks strip: how many Archetype Ranks the player
 * has to spend, with the Path chip and unlocked count on the right. This is the
 * Atlas's own banner; the *sheet-wide* persistent ranks banner that links here
 * is a sibling ticket (UNN-255).
 */
export function RanksHeader({
  savedRanks,
  unlockedCount,
  pathChoice,
}: {
  savedRanks: number
  unlockedCount: number
  pathChoice: PathChoice
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 sm:items-center">
        <ArrowFatLineUpIcon
          className="mt-0.5 size-6 shrink-0 text-muted-foreground"
          aria-hidden
        />
        {savedRanks > 0 ? (
          <div className="flex flex-col">
            <p className="text-sm">
              You have{" "}
              <span className="font-mono font-semibold tabular-nums">
                {savedRanks}
              </span>{" "}
              Archetype {savedRanks === 1 ? "Rank" : "Ranks"} to spend.
            </p>
            <p className="text-xs text-muted-foreground">
              Unlock a new one or rank up one you own.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Saved Archetype Ranks to spend — browse and plan your next moves.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-9 text-sm sm:pl-0">
        <Badge variant="outline">
          <PathIcon />
          {PATH_CHOICE_LABELS[pathChoice]} Path
        </Badge>
        <span className="font-mono text-muted-foreground tabular-nums">
          {unlockedCount} unlocked
        </span>
      </div>
    </div>
  )
}
