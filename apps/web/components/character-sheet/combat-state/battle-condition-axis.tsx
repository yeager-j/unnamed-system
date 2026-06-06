"use client"

import { CaretDownIcon, CaretUpIcon, MinusIcon } from "@phosphor-icons/react"

import {
  BATTLE_CONDITION_STATES,
  DEFAULT_BATTLE_CONDITIONS,
  type BattleConditionState,
} from "@workspace/game/foundation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { setBattleConditionAxisAction } from "@/lib/actions/combat-state"
import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_LABELS,
} from "@/lib/ui/labels"

import { ConditionValue } from "./condition-value"

type AxisKey = "attack" | "defense" | "hitEvasion"

/**
 * One Battle Condition axis on the Combat State card. Public mode renders the
 * plain-text {@link ConditionValue}; owner mode swaps it for a shadcn Select
 * whose three options align over the trigger so the value position doesn't
 * shift when the menu appears. Both read the optimistic battle conditions off
 * the shared character; the owner dispatch re-derives via the
 * `battleConditionAxis` edit.
 */
export function BattleConditionAxis({ axis }: { axis: AxisKey }) {
  const role = useViewerRole()
  const conditions =
    useCharacter().battleConditions ?? DEFAULT_BATTLE_CONDITIONS
  const current = conditions[axis]

  if (role !== "owner") return <ConditionValue state={current} />

  return <OwnerAxis axis={axis} current={current} />
}

function OwnerAxis({
  axis,
  current,
}: {
  axis: AxisKey
  current: BattleConditionState
}) {
  const { pending, write, characterId } = useCharacterWrite()
  const axisLabel = BATTLE_CONDITION_AXIS_LABELS[axis]

  function dispatch(nextState: BattleConditionState) {
    if (nextState === current) return
    write({
      edit: { kind: "battleConditionAxis", axis, state: nextState },
      surface: "battleConditions",
      action: (expectedVersion) =>
        setBattleConditionAxisAction({
          characterId,
          axis,
          state: nextState,
          expectedVersion,
        }),
    })
  }

  return (
    <Select<BattleConditionState>
      value={current}
      onValueChange={(value) => {
        if (value) dispatch(value)
      }}
      disabled={pending}
    >
      <SelectTrigger
        size="sm"
        aria-label={`${axisLabel} battle condition`}
        className="h-7 min-w-24 border-transparent px-2 hover:bg-muted/60 data-[popup-open]:bg-muted"
      >
        <SelectValue>
          <AxisValueDisplay state={current} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger className="min-w-32">
        {BATTLE_CONDITION_STATES.map((stateOption) => (
          <SelectItem key={stateOption} value={stateOption}>
            <AxisValueDisplay state={stateOption} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AxisValueDisplay({ state }: { state: BattleConditionState }) {
  if (state === "neutral") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <MinusIcon weight="bold" aria-hidden className="size-3.5" />
        {BATTLE_CONDITION_LABELS.neutral}
      </span>
    )
  }
  const Icon = state === "increased" ? CaretUpIcon : CaretDownIcon
  const tone = state === "increased" ? "" : "text-destructive"
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      <Icon weight="bold" aria-hidden className="size-3.5" />
      {BATTLE_CONDITION_LABELS[state]}
    </span>
  )
}
