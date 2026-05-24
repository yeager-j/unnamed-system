import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import type { ResolvedSkillCost } from "@/lib/game/skill-cost"

interface SkillCostBadgeProps {
  cost: ResolvedSkillCost | null
  className?: string
}

/**
 * The Skill cost chip shared by the Skills list row and the Skill popover
 * card. SP costs read blue, HP costs read green so players can spot which
 * resource a Skill drains at a glance; Skills with no cost fall back to the
 * outline variant with an em dash to keep the cost column visually aligned.
 * The 200-step tints match the damage-type chips so neutral-900 text stays
 * readable across the palette.
 */
export function SkillCostBadge({ cost, className }: SkillCostBadgeProps) {
  if (!cost) {
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground", className)}
      >
        —
      </Badge>
    )
  }
  return (
    <Badge variant={cost.kind}>
      {cost.amount} {COST_KIND_LABELS[cost.kind]}
    </Badge>
  )
}

const COST_KIND_LABELS: Record<ResolvedSkillCost["kind"], string> = {
  sp: "SP",
  hp: "HP",
}
