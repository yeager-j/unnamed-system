"use client"

import {
  ArrowRightIcon,
  CheckIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useEffect, useRef, useState } from "react"

import type {
  AilmentEvent,
  AilmentHpApply,
  EndOfTurnAilment,
  EndOfTurnObligations,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { getAilment } from "@workspace/game/data"
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
  frenzyDecrementReminder,
  savingThrowPrompt,
} from "@/lib/ui/labels"

const DURATIONS_KEY = "durations"
const FLAGS_KEY = "flags"
const FRENZY_KEY = "frenzy"

/**
 * The end-of-turn modal (UNN-317). End turn always opens it — a deliberate beat,
 * even when nothing needs resolving (UNN-344 product decision). It renders the
 * just-acted combatant's {@link EndOfTurnObligations} as a list of Alerts:
 *
 * - one per non-Downed **ailment** — a saving-throw prompt the DM rolls in the
 *   real world (pass → **Clear**, dispatching `clearAilment`), plus an **Apply**
 *   button for Burn/Sleep on any vitals-bearing participant: v2's uniform
 *   {@link AilmentHpApply} carries the signed *delta*, handed to `onApplyHp` —
 *   the console routes it through the storage-blind write-router (`damage` /
 *   `heal`), so a PC and an enemy resolve identically (the v1 "PCs are
 *   reminders" kind-gate is gone);
 * - informational rows for the duration ticks and held Charged/Concentrating.
 *
 * Obligations are **snapshotted when the modal opens** and rows persist until
 * the DM dismisses them (the X in each Alert's corner, also the path for a
 * *failed* save). Because a v2 apply is a **delta** write (not v1's frozen
 * absolute), the Apply button disables once applied — re-clicking would
 * compound. The **Done** CTA — or any other dismissal — closes the modal and
 * drops the console into draft mode, so the DM is never stranded.
 */
export function EndOfTurnModal({
  actorId,
  actorName,
  obligations,
  open,
  onCombatEvent,
  onApplyHp,
  isPending,
  onDone,
}: {
  actorId: ParticipantId
  actorName: string
  obligations: EndOfTurnObligations | null
  open: boolean
  onCombatEvent: (event: AilmentEvent) => void
  /** Commits one ailment's HP delta through the combatant write-router. */
  onApplyHp: (apply: AilmentHpApply) => void
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
    onCombatEvent({ kind: "clearAilment", participantId: actorId, ailment })
    dismiss(ailment)
  }

  function applyEffect(entry: EndOfTurnAilment) {
    if (entry.apply === null) return
    onApplyHp(entry.apply)
    setApplied((prev) => new Set(prev).add(entry.ailment))
  }

  const ailments = (snapshot?.ailments ?? []).filter(
    (entry) => !dismissed.has(entry.ailment)
  )
  const showDurations =
    (snapshot?.activeDurations.length ?? 0) > 0 && !dismissed.has(DURATIONS_KEY)
  const showFlags =
    (snapshot?.heldFlags.length ?? 0) > 0 && !dismissed.has(FLAGS_KEY)
  const showFrenzy = snapshot?.frenzy != null && !dismissed.has(FRENZY_KEY)
  const isEmpty =
    ailments.length === 0 && !showDurations && !showFlags && !showFrenzy

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
                        disabled={isPending || isApplied}
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

            {showFrenzy && snapshot?.frenzy ? (
              <Alert>
                <AlertTitle>Frenzy</AlertTitle>
                <AlertDescription>
                  {frenzyDecrementReminder(snapshot.frenzy.pain)} The player
                  updates their own Pain Meter.
                </AlertDescription>
                <AlertAction>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => dismiss(FRENZY_KEY)}
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
