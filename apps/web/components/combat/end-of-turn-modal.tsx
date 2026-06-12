"use client"

import {
  ArrowRightIcon,
  CheckIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useEffect, useRef, useState } from "react"

import { getAilment } from "@workspace/game/data"
import type {
  EndOfTurnAilment,
  EndOfTurnObligations,
} from "@workspace/game/engine"
import { type CombatEvent } from "@workspace/game/foundation"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import {
  BATTLE_CONDITION_AXIS_LABELS,
  BATTLE_CONDITION_FLAG_LABELS,
  END_OF_TURN_CLEAR_TOOLTIP,
  END_OF_TURN_EMPTY,
  endOfTurnApplyLabel,
  savingThrowPrompt,
} from "@/lib/ui/labels"

const DURATIONS_KEY = "durations"
const FLAGS_KEY = "flags"

/**
 * The end-of-turn modal (UNN-317). End turn always opens it — a deliberate beat,
 * even when nothing needs resolving (UNN-344 product decision). It renders the
 * just-acted combatant's {@link EndOfTurnObligations} as a list of Alerts:
 *
 * - one per non-Downed **ailment** — a saving-throw prompt the DM rolls in the
 *   real world (pass → **Clear**, dispatching `clearAilment`), plus an **Apply**
 *   button for an enemy's Burn/Sleep that commits the HP delta via
 *   `adjustEnemyVitals` (PCs are reminders; the description carries the rule);
 * - informational rows for the duration ticks and held Charged/Concentrating.
 *
 * Obligations are **snapshotted when the modal opens** so an Apply target is a
 * frozen absolute value — re-clicking is idempotent, no compounding damage — and
 * rows persist until the DM dismisses them (the X in each Alert's corner, also
 * the path for a *failed* save). The **Done** CTA — or any other dismissal —
 * closes the modal and drops the console into draft mode, so the DM is never
 * stranded.
 */
export function EndOfTurnModal({
  actorId,
  actorName,
  obligations,
  open,
  onCombatEvent,
  isPending,
  onDone,
}: {
  actorId: string
  actorName: string
  obligations: EndOfTurnObligations | null
  open: boolean
  onCombatEvent: (event: CombatEvent) => void
  isPending: boolean
  onDone: () => void
}) {
  const latest = useRef(obligations)
  latest.current = obligations

  const [snapshot, setSnapshot] = useState<EndOfTurnObligations | null>(null)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setSnapshot(latest.current)
    setDismissed(new Set())
    setApplied(new Set())
  }, [open])

  function dismiss(key: string) {
    setDismissed((prev) => new Set(prev).add(key))
  }

  function clearAilment(ailment: EndOfTurnAilment["ailment"]) {
    onCombatEvent({ kind: "clearAilment", combatantId: actorId, ailment })
    dismiss(ailment)
  }

  function applyEffect(entry: EndOfTurnAilment) {
    if (entry.apply === null) return
    onCombatEvent({
      kind: "adjustEnemyVitals",
      combatantId: actorId,
      field: entry.apply.field,
      value: entry.apply.value,
    })
    setApplied((prev) => new Set(prev).add(entry.ailment))
  }

  const ailments = (snapshot?.ailments ?? []).filter(
    (entry) => !dismissed.has(entry.ailment)
  )
  const showDurations =
    (snapshot?.activeDurations.length ?? 0) > 0 && !dismissed.has(DURATIONS_KEY)
  const showFlags =
    (snapshot?.heldFlags.length ?? 0) > 0 && !dismissed.has(FLAGS_KEY)
  const isEmpty = ailments.length === 0 && !showDurations && !showFlags

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-baseline justify-between gap-3">
          <DialogTitle>End of {actorName}&apos;s turn</DialogTitle>
          <span className="mr-6 text-sm text-muted-foreground">
            resolve, then draft
          </span>
        </DialogHeader>

        {isEmpty ? (
          <p className="py-2 text-sm text-muted-foreground">
            {END_OF_TURN_EMPTY}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {ailments.map((entry) => {
              const canonical = getAilment(entry.ailment)
              const isApplied = applied.has(entry.ailment)
              return (
                <Alert key={entry.ailment}>
                  <AlertTitle>{canonical?.name ?? entry.ailment}</AlertTitle>
                  <AlertDescription>
                    {savingThrowPrompt(canonical?.name ?? entry.ailment)}
                    {canonical ? ` · ${canonical.description}` : null}
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => dismiss(entry.ailment)}
                      aria-label="Dismiss"
                    >
                      <XIcon />
                    </Button>
                  </AlertAction>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {entry.apply ? (
                      <Button
                        size="sm"
                        variant={isApplied ? "secondary" : "default"}
                        onClick={() => applyEffect(entry)}
                        disabled={isPending}
                      >
                        {isApplied ? (
                          <>
                            <CheckIcon weight="bold" />
                            Applied
                          </>
                        ) : (
                          endOfTurnApplyLabel(entry.apply.delta)
                        )}
                      </Button>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => clearAilment(entry.ailment)}
                            disabled={isPending}
                          >
                            Clear
                          </Button>
                        }
                      />
                      <TooltipContent side="top" className="max-w-xs">
                        {END_OF_TURN_CLEAR_TOOLTIP}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </Alert>
              )
            })}

            {showDurations ? (
              <Alert>
                <AlertTitle>Condition durations</AlertTitle>
                <AlertDescription>
                  {snapshot?.activeDurations
                    .map(
                      ({ axis, turns }) =>
                        `${BATTLE_CONDITION_AXIS_LABELS[axis]} · ${turns} ${
                          turns === 1 ? "turn" : "turns"
                        } left`
                    )
                    .join(" · ")}
                </AlertDescription>
                <AlertAction>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => dismiss(DURATIONS_KEY)}
                    aria-label="Dismiss"
                  >
                    <XIcon />
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}

            {showFlags ? (
              <Alert>
                <AlertTitle>Held</AlertTitle>
                <AlertDescription>
                  {snapshot?.heldFlags
                    .map((flag) => BATTLE_CONDITION_FLAG_LABELS[flag])
                    .join(" · ")}{" "}
                  — carries to the next attack; clear when spent.
                </AlertDescription>
                <AlertAction>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => dismiss(FLAGS_KEY)}
                    aria-label="Dismiss"
                  >
                    <XIcon />
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button className="w-full" onClick={onDone}>
            <ArrowRightIcon weight="bold" />
            Done — open the draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
