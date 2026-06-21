"use client"

import { MinusIcon, PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr"

import { type CombatantDetail } from "@workspace/game/engine"
import {
  COUNTER_KEYS,
  type CombatEvent,
  type CounterKey,
} from "@workspace/game/foundation"
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

import { DetailSection } from "@/components/shared/detail-section"
import { COUNTER_HINTS, COUNTER_LABELS } from "@/lib/ui/labels"

/**
 * The drawer's **COUNTERS** section — named tallies (Lumina, …) the DM keeps on a
 * combatant (UNN: Path of Dawn). Each active counter is a stepper row; an "Add
 * counter" popover introduces a counter type not yet present. Every control
 * dispatches a generic `adjustCounter`/`clearCounter` through `onCombatEvent`, so
 * a new counter type needs only a `COUNTER_KEYS` + label entry — no UI change.
 *
 * Stepper buttons send a **delta** (±1), never an absolute, so back-to-back taps
 * merge on the server instead of overwriting (the UNN-226 lesson). Identical for
 * PCs and enemies (overlay state, ADR Decision 1) — counters are typically
 * applied to enemies, but the app stays permissive.
 */
export function CombatantCountersSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
}) {
  const combatantId = detail.id
  const { counters } = detail

  const active = COUNTER_KEYS.filter((key) => (counters[key] ?? 0) > 0)
  const addable = COUNTER_KEYS.filter((key) => (counters[key] ?? 0) === 0)

  function adjust(counter: CounterKey, delta: number) {
    onCombatEvent({ kind: "adjustCounter", combatantId, counter, delta })
  }

  function clear(counter: CounterKey) {
    onCombatEvent({ kind: "clearCounter", combatantId, counter })
  }

  return (
    <DetailSection title="Counters">
      <div className="flex flex-col gap-2">
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">No counters.</p>
        ) : (
          active.map((key) => (
            <CounterRow
              key={key}
              count={counters[key] ?? 0}
              label={COUNTER_LABELS[key]}
              onIncrement={() => adjust(key, 1)}
              onDecrement={() => adjust(key, -1)}
              onRemove={() => clear(key)}
            />
          ))
        )}

        {addable.length > 0 ? (
          <AddCounter counters={addable} onAdd={(key) => adjust(key, 1)} />
        ) : null}
      </div>
    </DetailSection>
  )
}

/** One active counter: label + count, then decrease / remove / increase. */
function CounterRow({
  label,
  count,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  label: string
  count: number
  onIncrement: () => void
  onDecrement: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        {label}
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </span>
      <ButtonGroup aria-label={`Adjust ${label}`}>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Decrease ${label}`}
          onClick={onDecrement}
        >
          <MinusIcon weight="bold" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Remove ${label}`}
          className="text-destructive"
          onClick={onRemove}
        >
          <XIcon weight="bold" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Increase ${label}`}
          onClick={onIncrement}
        >
          <PlusIcon weight="bold" aria-hidden />
        </Button>
      </ButtonGroup>
    </div>
  )
}

/** The "Add counter" popover: one button per not-yet-active counter type, each
 *  starting it at 1. */
function AddCounter({
  counters,
  onAdd,
}: {
  counters: readonly CounterKey[]
  onAdd: (counter: CounterKey) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start font-normal"
          >
            <PlusIcon aria-hidden />
            Add counter
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <PopoverHeader className="gap-1 p-3 pb-2">
          <PopoverTitle>Counters</PopoverTitle>
          <PopoverDescription>
            Apply a counter — the app doesn&apos;t enforce a cap.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-0.5 p-2 pt-1">
          {counters.map((key) => (
            <Button
              key={key}
              variant="ghost"
              className="h-auto w-full justify-start px-2 py-1.5 text-left"
              onClick={() => onAdd(key)}
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-xs font-medium">
                  {COUNTER_LABELS[key]}
                </span>
                <span className="text-xs whitespace-normal text-muted-foreground">
                  {COUNTER_HINTS[key]}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
