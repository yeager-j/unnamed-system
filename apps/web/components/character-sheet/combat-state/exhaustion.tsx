import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { getExhaustionLevel } from "@/lib/game/combat"

/**
 * The Exhaustion entry on the Combat State card. Uses the same vertical
 * label-above-value format as Ailment so the two sit side by side at the top
 * of the card. The badge surfaces the current level (or "None" at 0) and its
 * tooltip carries the rulebook effect text for that tier.
 */
export function Exhaustion({ exhaustion }: { exhaustion: number }) {
  const entry = getExhaustionLevel(exhaustion)
  const exhausted = entry.level > 0
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Exhaustion
      </p>
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
    </div>
  )
}
