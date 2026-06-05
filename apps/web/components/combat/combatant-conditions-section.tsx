"use client"

import {
  CaretDownIcon,
  CaretUpIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { DetailSection } from "@/components/shared/detail-section"
import {
  BATTLE_CONDITION_AXIS_KEYS,
  type BattleConditionAxisKey,
  type BattleConditionFlagKey,
  type BattleConditionState,
} from "@/lib/game/character"
import { AILMENTS, getAilment, type AilmentKey } from "@/lib/game/combat"
import type { CombatantDetail, CombatEvent } from "@/lib/game/encounter"
import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_FLAG_LABELS,
  BATTLE_CONDITION_LABELS,
} from "@/lib/ui/labels"

const DOWNED_KEY: AilmentKey = "downed"
const FLAG_KEYS: readonly BattleConditionFlagKey[] = [
  "charged",
  "concentrating",
]

/** Axis states in low→high display order (the data order is neutral-first). */
const AXIS_DISPLAY_ORDER: readonly BattleConditionState[] = [
  "decreased",
  "neutral",
  "increased",
]

/**
 * The drawer's **AILMENT & CONDITIONS** section (UNN-310) — the session-overlay
 * state the DM edits per combatant, all dispatched through `onCombatEvent`:
 *
 * - **Ailments** — a permissive multi-select (no one-at-a-time enforcement;
 *   co-existence is the DM's call). Each toggle is one `setAilment`/`clearAilment`.
 * - **Battle-condition axes** — a tri-state segmented control per axis with its
 *   live duration countdown (`setBattleConditionAxis`).
 * - **Charged / Concentrating** — manual on/off flags, no auto-consume
 *   (`setBattleConditionFlag`).
 *
 * Identical for PCs and enemies (overlay state, ADR Decision 1).
 */
export function CombatantConditionsSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
}) {
  const combatantId = detail.id
  const { battleConditions, conditionDurations } = detail

  function setAxis(axis: BattleConditionAxisKey, state: BattleConditionState) {
    onCombatEvent({
      kind: "setBattleConditionAxis",
      combatantId,
      axis,
      state,
    })
  }

  function setFlag(flag: BattleConditionFlagKey, value: boolean) {
    onCombatEvent({ kind: "setBattleConditionFlag", combatantId, flag, value })
  }

  return (
    <DetailSection title="Ailment & conditions">
      <div className="flex flex-col gap-4">
        <AilmentPicker
          ailments={detail.ailments}
          onSet={(ailment) =>
            onCombatEvent({ kind: "setAilment", combatantId, ailment })
          }
          onClear={(ailment) =>
            onCombatEvent({ kind: "clearAilment", combatantId, ailment })
          }
        />

        <div className="flex flex-col gap-2">
          {BATTLE_CONDITION_AXIS_KEYS.map((axis) => (
            <AxisRow
              key={axis}
              axis={axis}
              state={battleConditions[axis]}
              duration={conditionDurations[axis] ?? null}
              onSet={(state) => setAxis(axis, state)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {FLAG_KEYS.map((flag) => (
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
    </DetailSection>
  )
}

/** One tri-state axis (Attack / Defense / Hit-Evasion): label · duration · a
 *  Decreased/Neutral/Increased segmented control. */
function AxisRow({
  axis,
  state,
  duration,
  onSet,
}: {
  axis: BattleConditionAxisKey
  state: BattleConditionState
  duration: number | null
  onSet: (state: BattleConditionState) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{BATTLE_CONDITION_AXIS_LABELS[axis]}</span>
      <div className="flex items-center gap-2">
        {duration ? (
          <Badge variant="secondary" className="tabular-nums">
            {duration}t
          </Badge>
        ) : null}
        <ToggleGroup
          aria-label={`${BATTLE_CONDITION_AXIS_LABELS[axis]} state`}
          variant="outline"
          size="sm"
          spacing={0}
          value={[state]}
          onValueChange={(value) => {
            const next = value[0] as BattleConditionState | undefined
            if (next) onSet(next)
          }}
        >
          {AXIS_DISPLAY_ORDER.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={BATTLE_CONDITION_LABELS[option]}
              className={
                option === "decreased" ? "data-[pressed]:text-destructive" : ""
              }
            >
              <AxisStateIcon state={option} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

function AxisStateIcon({ state }: { state: BattleConditionState }) {
  if (state === "increased") return <CaretUpIcon weight="bold" aria-hidden />
  if (state === "decreased") return <CaretDownIcon weight="bold" aria-hidden />
  return <MinusIcon weight="bold" aria-hidden />
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
