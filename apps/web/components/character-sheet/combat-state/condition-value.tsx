import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/dist/ssr"

import { type BattleConditionState } from "@workspace/game/foundation"

import { BATTLE_CONDITION_LABELS } from "@/lib/ui/labels"

export function ConditionValue({ state }: { state: BattleConditionState }) {
  if (state === "neutral") {
    return <span className="text-muted-foreground">Neutral</span>
  }
  const Icon = state === "increased" ? CaretUpIcon : CaretDownIcon
  const tone =
    state === "increased" ? "font-medium" : "font-medium text-destructive"
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      {BATTLE_CONDITION_LABELS[state]}
      <Icon weight="bold" aria-hidden className="size-3.5" />
    </span>
  )
}
