import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/dist/ssr"

import type { BattleConditionState } from "@/lib/game/character"

const CONDITION_LABEL: Record<BattleConditionState, string> = {
  neutral: "Neutral",
  increased: "Increased",
  decreased: "Decreased",
}

export function ConditionValue({ state }: { state: BattleConditionState }) {
  if (state === "neutral") {
    return <span className="text-muted-foreground">Neutral</span>
  }
  const Icon = state === "increased" ? CaretUpIcon : CaretDownIcon
  const tone =
    state === "increased" ? "font-medium" : "font-medium text-destructive"
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      {CONDITION_LABEL[state]}
      <Icon weight="bold" aria-hidden className="size-3.5" />
    </span>
  )
}
