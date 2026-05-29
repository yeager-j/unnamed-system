import { BATTLE_CONDITION_AXIS_LABELS } from "@/lib/ui/labels"

import { BattleConditionAxis } from "./battle-condition-axis"

const AXES = [
  { key: "attack", label: BATTLE_CONDITION_AXIS_LABELS.attack },
  { key: "defense", label: BATTLE_CONDITION_AXIS_LABELS.defense },
  { key: "hitEvasion", label: BATTLE_CONDITION_AXIS_LABELS.hitEvasion },
] as const

/**
 * The three Battle Condition axes (Attack / Defense / Hit-Evasion). Each
 * {@link BattleConditionAxis} self-sources its state from the optimistic
 * character and renders plain text (public) or an inline Select (owner).
 */
export function BattleConditionRow() {
  return (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
      {AXES.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          <dd>
            <BattleConditionAxis axis={key} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
