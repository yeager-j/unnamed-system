import { getSideEffect } from "@workspace/game/data"
import { type SideEffectKey } from "@workspace/game/foundation"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { Prose } from "./prose"

/**
 * One Side Effect tag in an Attack Roll tier row (design handoff `.efx`): the
 * canonical name (e.g. "Critical", "Insta-Kill (Light)") set as a small
 * uppercase mono pill, tinted by the Skill's element hue via `className` (a set
 * of border/text classes from the element-tone registry). The tooltip renders
 * the side effect's rule description. Unknown keys are skipped — the schema
 * rejects them at parse time, but this guards against bad persisted data.
 */
export function SideEffectBadge({
  sideEffectKey,
  className,
}: {
  sideEffectKey: SideEffectKey
  className?: string
}) {
  const sideEffect = getSideEffect(sideEffectKey)
  if (!sideEffect) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex cursor-help items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-extrabold tracking-wider whitespace-nowrap uppercase",
              "border-border text-muted-foreground",
              className
            )}
          >
            {sideEffect.name}
          </span>
        }
      />
      {sideEffect.description ? (
        <TooltipContent side="top" className="max-w-sm">
          <Prose className="prose-xs whitespace-normal" invert={false}>
            {sideEffect.description}
          </Prose>
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}
