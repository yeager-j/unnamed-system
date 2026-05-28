"use client"

import { CaretDownIcon, CaretUpIcon, MinusIcon } from "@phosphor-icons/react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useViewerRole } from "@/components/shell/viewer-role"
import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { setBattleConditionAxisAction } from "@/lib/actions/combat-state"
import {
  BATTLE_CONDITION_STATES,
  type BattleConditions,
  type BattleConditionState,
} from "@/lib/game/character"
import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_LABELS,
} from "@/lib/ui/labels"

type AxisKey = "attack" | "defense" | "hitEvasion"

/**
 * One Battle Condition axis on the Combat State card. Public mode renders
 * the plain-text {@link readonlyFallback} the row already passed in; owner
 * mode swaps it for a shadcn Select that opens its three options aligned
 * over the trigger (`alignItemWithTrigger`) so the value position doesn't
 * shift when the menu appears. The full {@link BattleConditions} object is
 * re-written on each change — the column is a single jsonb blob, so a
 * field-shaped patch wouldn't save anything and would only complicate the
 * server action.
 */
export function BattleConditionAxis({
  characterId,
  axis,
  conditions,
  vitalsVersion,
  readonlyFallback,
}: {
  characterId: string
  axis: AxisKey
  conditions: BattleConditions
  vitalsVersion: number
  readonlyFallback: React.ReactNode
}) {
  const role = useViewerRole()
  if (role !== "owner") return <>{readonlyFallback}</>

  return (
    <OwnerAxis
      characterId={characterId}
      axis={axis}
      conditions={conditions}
      vitalsVersion={vitalsVersion}
    />
  )
}

function OwnerAxis({
  characterId,
  axis,
  conditions,
  vitalsVersion,
}: {
  characterId: string
  axis: AxisKey
  conditions: BattleConditions
  vitalsVersion: number
}) {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()
  // Reducer-as-merger so back-to-back axis flips compose on the latest
  // optimistic state, not a stale closure value.
  const [optimistic, applyOptimistic] = useOptimistic(
    conditions,
    (
      current,
      patch: { axis: AxisKey; state: BattleConditionState }
    ): BattleConditions => ({
      ...current,
      [patch.axis]: {
        state: patch.state,
        stacks: patch.state === "neutral" ? 0 : 1,
      },
    })
  )

  const current = optimistic[axis].state
  const axisLabel = BATTLE_CONDITION_AXIS_LABELS[axis]

  function dispatch(nextState: BattleConditionState) {
    if (nextState === current) return
    startTransition(async () => {
      applyOptimistic({ axis, state: nextState })
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          setBattleConditionAxisAction({
            characterId,
            axis,
            state: nextState,
            expectedVersion,
          }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
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
