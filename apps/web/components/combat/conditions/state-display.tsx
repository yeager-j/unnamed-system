"use client"

import {
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  getAilment,
  type Ailments,
  type BattleConditions,
  type ConditionDurations,
} from "@workspace/game-v2/encounter"
import { Badge } from "@workspace/ui/components/badge"

import { AxisStateDisplay } from "@/components/combat/conditions/controls"
import { SectionLabel } from "@/components/shared/section-label"
import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_FLAG_LABELS,
} from "@/domain/labels"

/**
 * A **read-only** view of a combatant's session overlay — the player-watch peer
 * of the DM drawer's editable {@link
 * import("@/components/combat/conditions/controls").ConditionsControls}. The
 * player sees what's affecting them (ailments, the three battle-condition axes +
 * their duration clocks, and the Charged / Concentrating flags) but can't change
 * it: combat conditions are the DM's to set.
 *
 * Fed straight from the redacted snapshot combatant, so it ships no data a
 * spectator couldn't already see (every overlay component is public-to-all).
 */
export function CombatStateDisplay({
  ailments,
  battleConditions,
  conditionDurations,
}: {
  ailments: Ailments
  battleConditions: BattleConditions
  conditionDurations: ConditionDurations
}) {
  const activeFlags = BATTLE_CONDITION_FLAG_KEYS.filter(
    (flag) => battleConditions[flag]
  )

  return (
    <section aria-label="Combat state" className="flex flex-col gap-2.5">
      <SectionLabel>Combat state</SectionLabel>

      {ailments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ailments</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {ailments.map((key) => (
            <Badge key={key} variant="secondary">
              {getAilment(key)?.name ?? key}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
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
    </section>
  )
}
