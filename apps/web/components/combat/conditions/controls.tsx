"use client"

import {
  CaretDownIcon,
  CaretUpIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"

import {
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  DEFAULT_BATTLE_CONDITION_TURNS,
  type AilmentEvent,
  type AilmentKey,
  type BattleConditionAxisAction,
  type BattleConditionAxisKey,
  type BattleConditionEvent,
  type BattleConditionFlagKey,
  type BattleConditions,
  type BattleConditionState,
  type ConditionDurations,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { AILMENTS, getAilment } from "@workspace/game/data"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { Toggle } from "@workspace/ui/components/toggle"

import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_FLAG_LABELS,
  BATTLE_CONDITION_LABELS,
} from "@/lib/ui/labels"

const DOWNED_KEY: AilmentKey = "downed"

/**
 * The session-overlay condition editor, factored out of the DM drawer's
 * {@link import("@/components/combat/drawer/conditions-section").CombatantConditionsSection}
 * (UNN-310) so the player watch view's own combat-state control renders the
 * **identical** UI. Pure controls over the three pieces of overlay state, each
 * dispatched as a `CombatEvent` through `onCombatEvent`:
 *
 * - **Ailments** — a permissive multi-select (no one-at-a-time enforcement).
 * - **Battle-condition axes** — read-only state + duration per axis, with
 *   increase / clear / decrease controls (`adjustBattleConditionAxis`).
 * - **Charged / Concentrating** — manual on/off flags (`setBattleConditionFlag`).
 *
 * Presentational and emit-only: the DM drawer's `combatant-conditions-section`
 * feeds it from a `CombatantDetail` and emits through `applyCombatEvent`. The
 * player watch no longer edits its own overlay — combat conditions are the DM's to
 * set — so the DM is the only caller that mounts this for editing.
 */
export function ConditionsControls({
  participantId,
  battleConditions,
  conditionDurations,
  ailments,
  onCombatEvent,
}: {
  participantId: ParticipantId
  battleConditions: BattleConditions
  conditionDurations: ConditionDurations
  ailments: readonly string[]
  onCombatEvent: (event: AilmentEvent | BattleConditionEvent) => void
}) {
  function adjustAxis(
    axis: BattleConditionAxisKey,
    action: BattleConditionAxisAction
  ) {
    onCombatEvent({
      kind: "adjustBattleConditionAxis",
      participantId,
      axis,
      action,
      ...(action === "clear" ? {} : { turns: DEFAULT_BATTLE_CONDITION_TURNS }),
    })
  }

  function setFlag(flag: BattleConditionFlagKey, value: boolean) {
    onCombatEvent({
      kind: "setBattleConditionFlag",
      participantId,
      flag,
      value,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <AilmentPicker
        ailments={ailments}
        onSet={(ailment) =>
          onCombatEvent({ kind: "setAilment", participantId, ailment })
        }
        onClear={(ailment) =>
          onCombatEvent({ kind: "clearAilment", participantId, ailment })
        }
      />

      <div className="flex flex-col gap-2">
        {BATTLE_CONDITION_AXIS_KEYS.map((axis) => (
          <AxisRow
            key={axis}
            axis={axis}
            state={battleConditions[axis]}
            duration={conditionDurations[axis] ?? null}
            onAdjust={(action) => adjustAxis(axis, action)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {BATTLE_CONDITION_FLAG_KEYS.map((flag) => (
          <Toggle
            key={flag}
            pressed={battleConditions[flag]}
            onPressedChange={(value) => setFlag(flag, value)}
            variant="outline"
            size="sm"
            className="data-[pressed]:border-foreground"
          >
            {BATTLE_CONDITION_FLAG_LABELS[flag]}
          </Toggle>
        ))}
      </div>
    </div>
  )
}

/** One tri-state axis (Attack / Defense / Hit-Evasion): a read-only state +
 *  duration display, then decrease / clear / increase controls. */
function AxisRow({
  axis,
  state,
  duration,
  onAdjust,
}: {
  axis: BattleConditionAxisKey
  state: BattleConditionState
  duration: number | null
  onAdjust: (action: BattleConditionAxisAction) => void
}) {
  const axisLabel = BATTLE_CONDITION_AXIS_LABELS[axis]
  const isNeutral = state === "neutral"
  const canClear = !isNeutral || duration !== null

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{axisLabel}</span>
        <AxisStateDisplay state={state} duration={duration} />
      </div>
      <ButtonGroup aria-label={`Adjust ${axisLabel}`}>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Decrease ${axisLabel}`}
          className="text-destructive"
          onClick={() => onAdjust("decrease")}
        >
          <CaretDownIcon weight="bold" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Clear ${axisLabel}`}
          disabled={!canClear}
          onClick={() => onAdjust("clear")}
        >
          <XIcon weight="bold" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Increase ${axisLabel}`}
          onClick={() => onAdjust("increase")}
        >
          <CaretUpIcon weight="bold" aria-hidden />
        </Button>
      </ButtonGroup>
    </div>
  )
}

/** The live read-out for one axis: state icon + label, with the turns-remaining
 *  countdown when a duration clock is running. Exported so the player watch's
 *  read-only {@link import("@/components/combat/conditions/state-display").CombatStateDisplay} shows the
 *  identical axis read-out the DM editor does (no drift). */
export function AxisStateDisplay({
  state,
  duration,
}: {
  state: BattleConditionState
  duration: number | null
}) {
  const tone =
    state === "increased"
      ? "font-medium"
      : state === "decreased"
        ? "font-medium text-destructive"
        : "text-muted-foreground"

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <AxisStateIcon state={state} />
      {BATTLE_CONDITION_LABELS[state]}
      {duration !== null ? (
        <Badge variant="secondary" className="tabular-nums">
          {duration}t
        </Badge>
      ) : null}
    </span>
  )
}

function AxisStateIcon({ state }: { state: BattleConditionState }) {
  if (state === "increased")
    return <CaretUpIcon weight="bold" aria-hidden className="size-3.5" />
  if (state === "decreased")
    return <CaretDownIcon weight="bold" aria-hidden className="size-3.5" />
  return <MinusIcon weight="bold" aria-hidden className="size-3.5" />
}

/** A permissive multi-select of the 12 ailments (Downed pinned on top), each an
 *  independent toggle — no one-at-a-time enforcement. */
function AilmentPicker({
  ailments,
  onSet,
  onClear,
}: {
  ailments: readonly string[]
  onSet: (ailment: AilmentKey) => void
  onClear: (ailment: AilmentKey) => void
}) {
  const summary =
    ailments.length === 0
      ? "No ailment"
      : ailments.map((key) => getAilment(key)?.name ?? key).join(", ")

  const others = AILMENTS.filter((ailment) => ailment.key !== DOWNED_KEY)

  function toggle(key: AilmentKey, next: boolean) {
    if (next) onSet(key)
    else onClear(key)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Ailments
      </p>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start font-normal"
            >
              <PlusIcon aria-hidden />
              <span className="truncate">{summary}</span>
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 gap-0 p-0">
          <PopoverHeader className="gap-1 p-3 pb-2">
            <PopoverTitle>Ailments</PopoverTitle>
            <PopoverDescription>
              Track any combination — the app doesn&apos;t enforce one at a
              time.
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-0.5 px-2 pb-1">
            <AilmentRow
              ailmentKey={DOWNED_KEY}
              pressed={ailments.includes(DOWNED_KEY)}
              onToggle={(next) => toggle(DOWNED_KEY, next)}
            />
          </div>
          <Separator />
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto px-2 py-1">
            {others.map((ailment) => (
              <AilmentRow
                key={ailment.key}
                ailmentKey={ailment.key}
                pressed={ailments.includes(ailment.key)}
                onToggle={(next) => toggle(ailment.key, next)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function AilmentRow({
  ailmentKey,
  pressed,
  onToggle,
}: {
  ailmentKey: AilmentKey
  pressed: boolean
  onToggle: (next: boolean) => void
}) {
  const canonical = getAilment(ailmentKey)
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={onToggle}
      className="h-auto w-full justify-start px-2 py-1.5 text-left"
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium">
          {canonical?.name ?? ailmentKey}
        </span>
        {canonical ? (
          <span className="text-xs whitespace-normal text-muted-foreground">
            {canonical.description}
          </span>
        ) : null}
      </span>
    </Toggle>
  )
}
