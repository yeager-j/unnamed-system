"use client"

import { getAilment } from "@workspace/game/data"
import {
  BATTLE_CONDITION_AXIS_KEYS,
  type BattleConditionFlagKey,
  type BattleConditions,
  type ConditionDurations,
} from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_FLAG_LABELS,
} from "@/lib/ui/labels"

import { AxisStateDisplay } from "./conditions-controls"

const FLAG_KEYS: readonly BattleConditionFlagKey[] = [
  "charged",
  "concentrating",
]

/**
 * A **read-only** view of a combatant's session overlay — the player-watch peer of
 * the DM drawer's editable {@link import("./conditions-controls").ConditionsControls}.
 * The player sees what's affecting them (ailments, the three battle-condition axes +
 * their duration clocks, and the Charged / Concentrating flags) but can't change it:
 * combat conditions are the DM's to set. Fed straight from the redacted snapshot
 * combatant, so it ships no data a spectator couldn't already see.
 */
export function CombatStateDisplay({
  ailments,
  battleConditions,
  conditionDurations,
}: {
  ailments: readonly string[]
  battleConditions: BattleConditions
  conditionDurations: ConditionDurations
}) {
  const activeFlags = FLAG_KEYS.filter((flag) => battleConditions[flag])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Combat State</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Ailments
          </p>
          {ailments.length === 0 ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ailments.map((key) => (
                <Badge key={key} variant="secondary">
                  {getAilment(key)?.name ?? key}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {BATTLE_CONDITION_AXIS_KEYS.map((axis) => (
            <div key={axis} className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {BATTLE_CONDITION_AXIS_LABELS[axis]}
              </span>
              <AxisStateDisplay
                state={battleConditions[axis]}
                duration={conditionDurations[axis] ?? null}
              />
            </div>
          ))}
        </div>

        {activeFlags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeFlags.map((flag) => (
              <Badge key={flag} variant="outline">
                {BATTLE_CONDITION_FLAG_LABELS[flag]}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
