import type { BattleConditions } from "@/lib/game/character"
import { BATTLE_CONDITION_AXIS_LABELS } from "@/lib/ui/labels"

import { BattleConditionAxis } from "./battle-condition-axis"
import { ConditionValue } from "./condition-value"

const AXES = [
  { key: "attack", label: BATTLE_CONDITION_AXIS_LABELS.attack },
  { key: "defense", label: BATTLE_CONDITION_AXIS_LABELS.defense },
  { key: "hitEvasion", label: BATTLE_CONDITION_AXIS_LABELS.hitEvasion },
] as const

/**
 * The three Battle Condition axes (Attack / Defense / Hit-Evasion). Public
 * mode shows the current value as plain text via {@link ConditionValue};
 * owner mode (UNN-226) swaps each value for an inline Select that opens to
 * the three options aligned over the trigger, so the read affordance and
 * the edit affordance share the same footprint.
 */
export function BattleConditionRow({
  characterId,
  conditions,
  vitalsVersion,
}: {
  characterId: string
  conditions: BattleConditions
  vitalsVersion: number
}) {
  return (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
      {AXES.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          <dd>
            <BattleConditionAxis
              characterId={characterId}
              axis={key}
              conditions={conditions}
              vitalsVersion={vitalsVersion}
              readonlyFallback={
                <ConditionValue state={conditions[key].state} />
              }
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}
