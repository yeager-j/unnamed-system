import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { getSideEffect, type SideEffectKey } from "@/lib/game/side-effects"

import { Prose } from "./prose"

/**
 * One Side Effect chip in an Attack Roll tier row. The Badge shows the canonical
 * name (e.g. "Critical", "Insta-Kill (Light)") and the tooltip renders the
 * side effect's rule description from the registry. Unknown keys are skipped —
 * the schema rejects them at parse time, but this guards against bad
 * persisted data slipping through.
 */
export function SideEffectBadge({
  sideEffectKey,
}: {
  sideEffectKey: SideEffectKey
}) {
  const sideEffect = getSideEffect(sideEffectKey)
  if (!sideEffect) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="secondary" className="cursor-help">
            {sideEffect.name}
          </Badge>
        }
      />
      {sideEffect.description ? (
        <TooltipContent side="top" className="max-w-sm">
          <Prose inverted className="prose-xs whitespace-normal">
            {sideEffect.description}
          </Prose>
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}
