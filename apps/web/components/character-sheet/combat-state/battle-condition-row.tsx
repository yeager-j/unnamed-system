import type { BattleConditions } from "@/lib/game/character"

import { ConditionValue } from "./condition-value"

const AXES = [
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "hitEvasion", label: "Hit/Evasion" },
] as const

export function BattleConditionRow({
  conditions,
}: {
  conditions: BattleConditions
}) {
  return (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
      {AXES.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          <dd>
            <ConditionValue state={conditions[key].state} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
