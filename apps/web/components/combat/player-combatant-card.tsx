import {
  activeConditions,
  type ActiveCondition,
  type PlayerVisibleCombatant,
} from "@workspace/game/engine"
import { getAilment } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_FLAG_LABELS,
  COMBAT_SIDE_LABELS,
} from "@/lib/ui/labels"

import { VitalBar } from "./vital-bar"

/**
 * One combatant as the player watch view shows it (UNN-322): name + side, the
 * HP bar (and SP when the combatant has a pool), and the active ailments +
 * Battle Conditions. Pure read display — no controls. Everything it renders is
 * already redacted by the snapshot projection, so an enemy card simply has no
 * attributes/affinities to show (UNN-324). The acting combatant gets a primary
 * ring to echo the turn tracker.
 */
export function PlayerCombatantCard({
  combatant,
}: {
  combatant: PlayerVisibleCombatant
}) {
  const conditions = activeConditions(combatant.battleConditions)
  // Only combatants with an actual SP resource get a bar — a catalog enemy has
  // none (`sp` is null) and an inline enemy may declare 0 max.
  const sp = combatant.sp && combatant.sp.max > 0 ? combatant.sp : null

  return (
    <Card
      size="sm"
      className={cn(combatant.isCurrent && "ring-2 ring-primary")}
    >
      <CardHeader>
        <CardTitle className="truncate">{combatant.name}</CardTitle>
        <Badge
          variant={combatant.side === "players" ? "secondary" : "destructive"}
        >
          {COMBAT_SIDE_LABELS[combatant.side]}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <Pool label="HP" pool={combatant.hp} kind="hp" />
        {sp ? <Pool label="SP" pool={sp} kind="sp" /> : null}

        {combatant.ailments.length > 0 || conditions.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {combatant.ailments.map((key) => (
              <Badge key={key} variant="destructive">
                {getAilment(key)?.name ?? key}
              </Badge>
            ))}
            {conditions.map((condition) => (
              <ConditionBadge
                key={conditionKey(condition)}
                condition={condition}
              />
            ))}
          </div>
        ) : null}

        {combatant.engagedWith.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Engaged with{" "}
            <span className="text-foreground">
              {combatant.engagedWith.join(", ")}
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Pool({
  label,
  pool,
  kind,
}: {
  label: string
  pool: { current: number; max: number }
  kind: "hp" | "sp"
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {pool.current}
          <span className="text-muted-foreground"> / {pool.max}</span>
        </span>
      </div>
      <VitalBar current={pool.current} max={pool.max} kind={kind} />
    </div>
  )
}

function conditionKey(condition: ActiveCondition): string {
  return condition.kind === "axis"
    ? `axis-${condition.axis}`
    : `flag-${condition.flag}`
}

/** An active Battle Condition as a tinted badge: a raised axis reads neutral
 *  (secondary), a lowered axis reads as a warning (destructive), a flag outlined. */
function ConditionBadge({ condition }: { condition: ActiveCondition }) {
  if (condition.kind === "flag") {
    return (
      <Badge variant="outline">
        {BATTLE_CONDITION_FLAG_LABELS[condition.flag]}
      </Badge>
    )
  }
  const arrow = condition.state === "increased" ? "↑" : "↓"
  return (
    <Badge
      variant={condition.state === "increased" ? "secondary" : "destructive"}
    >
      {BATTLE_CONDITION_AXIS_LABELS[condition.axis]} {arrow}
    </Badge>
  )
}
