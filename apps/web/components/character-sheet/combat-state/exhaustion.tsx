"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"
import { getExhaustionLevel } from "@/lib/game/combat"

import { ExhaustionStepper } from "./exhaustion-stepper"

/**
 * The Exhaustion entry on the Combat State card. Uses the same vertical
 * label-above-value format as Ailment so the two sit side by side at the top
 * of the card. The badge surfaces the current level (or "None" at 0) and its
 * tooltip carries the rulebook effect text for that tier. Owner-mode adds
 * inline +/- steppers for manual correction — the normal reducer is Full
 * Rest (UNN-156), not these buttons.
 */
export function Exhaustion() {
  const { exhaustion } = useCharacter()
  const entry = getExhaustionLevel(exhaustion)
  const exhausted = entry.level > 0
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Exhaustion
      </p>
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                variant={exhausted ? "destructive" : "secondary"}
                className="cursor-help"
              >
                {exhausted ? `Level: ${entry.level}` : "None"}
              </Badge>
            }
          />
          <TooltipContent side="top" className="max-w-xs whitespace-normal">
            {entry.description}
          </TooltipContent>
        </Tooltip>
        <OwnerOnly>
          <ExhaustionStepper />
        </OwnerOnly>
      </div>
    </div>
  )
}
