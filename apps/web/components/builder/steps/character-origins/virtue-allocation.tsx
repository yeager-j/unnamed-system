"use client"

import { LockIcon } from "@phosphor-icons/react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { setCharacterVirtuesAction } from "@/lib/actions/character-virtues"
import { VIRTUE_KEYS, type VirtueKey } from "@/lib/game/character"
import {
  describeAllocationProgress,
  type VirtueAllocation,
} from "@/lib/game/virtues/allocation"
import { VIRTUE_LABELS } from "@/lib/ui/labels"

/**
 * Virtue allocation picker (rulebook 1.2, PRD §5.1 step 3). The player
 * assigns one Virtue at +2 and two distinct Virtues at +1; the fourth stays
 * at 0. Two concerns drive the UI shape:
 *
 * 1. The +2 pick is mutually exclusive — radio.
 * 2. The +1 picks are a *set of two from three* (i.e. the Virtues that
 *    aren't the current +2) — togglable chips with a "remaining picks"
 *    summary that doubles as the validation message.
 *
 * Every change writes the *full* 4-rank allocation in one identity-class
 * call. Concurrency / staleness is handled by the shared dispatch pipeline;
 * the Next button on the route gate reads `valid` independently from
 * server-rendered ranks, so saved state is the single source of truth.
 */
export function VirtueAllocationPicker({
  characterId,
  serverAllocation,
  identityVersion,
}: {
  characterId: string
  serverAllocation: VirtueAllocation
  identityVersion: number
}) {
  const versionRef = useCharacterTokenRef(identityVersion)
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(
    serverAllocation,
    (_current, next: VirtueAllocation) => next
  )

  const progress = describeAllocationProgress(optimistic)

  function persist(next: VirtueAllocation) {
    startTransition(async () => {
      setOptimistic(next)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          setCharacterVirtuesAction({
            characterId,
            expression: next.expression,
            empathy: next.empathy,
            wisdom: next.wisdom,
            focus: next.focus,
            expectedVersion,
          }),
      })
      if (!result.ok) {
        if (result.error === "stale") {
          toast.error(
            "Someone else updated this character — refresh to see the latest."
          )
        } else if (result.error === "character-not-found") {
          toast.error("This character was deleted.")
        } else {
          toast.error("Couldn't save your Virtues. Try again.")
        }
      }
    })
  }

  function setPlusTwo(virtue: VirtueKey) {
    if (optimistic[virtue] === 2) return
    // Picking a +2 evicts any existing +1 on the same Virtue but otherwise
    // leaves +1 picks intact, so swapping the +2 between two existing +1
    // Virtues doesn't wipe the player's prior choices.
    const next: VirtueAllocation = { ...optimistic }
    for (const key of VIRTUE_KEYS) {
      if (next[key] === 2) next[key] = 0
    }
    next[virtue] = 2
    // If the new +2 was previously a +1, that Virtue is now spoken for; no
    // other adjustment needed.
    persist(next)
  }

  function togglePlusOne(virtue: VirtueKey) {
    const current = optimistic[virtue]
    if (current === 2) return
    const next: VirtueAllocation = { ...optimistic }

    if (current === 1) {
      next[virtue] = 0
    } else {
      const existingOnes = VIRTUE_KEYS.filter((k) => next[k] === 1)
      if (existingOnes.length >= 2) {
        toast.message("You've already picked two +1 Virtues.", {
          description: "Tap one of your current +1 picks to swap it out.",
        })
        return
      }
      next[virtue] = 1
    }
    persist(next)
  }

  return (
    <FieldSet disabled={pending}>
      <FieldLegend>Virtues</FieldLegend>
      <FieldDescription>
        All four Virtues start at Rank 0. Boost one Virtue by +2 and two others
        by +1.
      </FieldDescription>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLegend variant="label">+2 Virtue</FieldLegend>
          <RadioGroup
            value={progress.plusTwo ?? ""}
            onValueChange={(value) => setPlusTwo(value as VirtueKey)}
          >
            {VIRTUE_KEYS.map((virtue) => {
              const id = `virtue-plus-two-${virtue}`
              return (
                <FieldLabel key={virtue} htmlFor={id}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{VIRTUE_LABELS[virtue]}</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem id={id} value={virtue} />
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
        </Field>

        <Field>
          <FieldLegend variant="label">+1 Virtues (pick two)</FieldLegend>
          {VIRTUE_KEYS.map((virtue) => {
            const isPlusTwo = optimistic[virtue] === 2
            const isPicked = optimistic[virtue] === 1
            const limitReached = progress.plusOnes.length >= 2 && !isPicked
            const id = `virtue-plus-one-${virtue}`
            return (
              <FieldLabel key={virtue} htmlFor={id}>
                <Field
                  orientation="horizontal"
                  data-disabled={isPlusTwo || limitReached}
                >
                  <FieldContent className="flex-row items-center gap-2">
                    <FieldTitle>{VIRTUE_LABELS[virtue]}</FieldTitle>

                    {isPlusTwo && <LockIcon />}
                  </FieldContent>
                  <Checkbox
                    id={id}
                    checked={isPicked}
                    onCheckedChange={() => togglePlusOne(virtue)}
                    disabled={isPlusTwo || limitReached}
                  />
                </Field>
              </FieldLabel>
            )
          })}
        </Field>
      </div>

      <FieldDescription
        role="status"
        aria-live="polite"
        className={
          progress.valid
            ? "text-foreground"
            : "text-amber-700 dark:text-amber-300"
        }
      >
        {summarize(progress)}
      </FieldDescription>
    </FieldSet>
  )
}

function summarize(progress: ReturnType<typeof describeAllocationProgress>) {
  if (progress.valid) return "Virtues allocated."

  const parts: string[] = []
  if (progress.remaining.plusTwo) parts.push("pick a +2 Virtue")
  if (progress.remaining.plusOnes === 1) parts.push("pick one more +1 Virtue")
  if (progress.remaining.plusOnes === 2) parts.push("pick two +1 Virtues")
  if (parts.length === 0) {
    // No "remaining" picks but still invalid → overflow (too many +2s or
    // +1s), which the UI guards against; surface a generic nudge as a
    // last resort.
    return "Adjust your Virtue picks to one +2 and two +1s."
  }
  return `To continue, ${parts.join(" and ")}.`
}
