"use client"

import { SparkleIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import {
  addSparkAction,
  rankUpVirtueAction,
} from "@/lib/actions/character-spark"
import {
  eligibleVirtuesForRankUp,
  SPARK_LOG_CAPACITY,
  sparkLogBreakdown,
  VIRTUE_KEYS,
  type VirtueKey,
} from "@/lib/game/character"
import { VIRTUE_LABELS } from "@/lib/ui/labels"

/**
 * Virtues block on the Explore tab (PRD §6.1 / §7.5, UNN-222). Renders the
 * four Virtue ranks, the shared Spark log progress, and (for owners) the
 * "+1 Spark" picker plus the "Rank up a Virtue" CTA that surfaces when the
 * log is full. Public viewers see the read-only header rows unchanged.
 *
 * Writes go through the progression-class retry pipeline. Optimistic state
 * mirrors what the server will persist by running the same pure `addSpark`
 * / `rankUpVirtue` engines client-side — so a click updates the breakdown
 * line before the round-trip and a failure rolls back cleanly.
 */
export function Virtues() {
  const character = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()

  const optimistic = {
    sparkLog: character.sparkLog,
    virtues: {
      expression: character.virtueExpression,
      empathy: character.virtueEmpathy,
      wisdom: character.virtueWisdom,
      focus: character.virtueFocus,
    },
  }

  const breakdown = sparkLogBreakdown(optimistic.sparkLog)
  const logFull = optimistic.sparkLog.length >= SPARK_LOG_CAPACITY
  const eligibleForRankUp = logFull
    ? eligibleVirtuesForRankUp({
        sparkLog: optimistic.sparkLog,
        virtues: optimistic.virtues,
      })
    : new Set<VirtueKey>()

  function handleAddSpark(virtue: VirtueKey) {
    write({
      edit: { kind: "addSpark", virtue },
      surface: "spark",
      action: (expectedVersion) =>
        addSparkAction({ characterId, virtue, expectedVersion }),
      messages: {
        stale:
          "Someone else updated this character — refresh to see the latest.",
        error: "Couldn't add Spark. Try again.",
      },
      onError: (error) => {
        if (error !== "log-full") return false
        toast.error("Spark log is full — rank up a Virtue to make room.")
        return true
      },
    })
  }

  function handleRankUp(virtue: VirtueKey) {
    write({
      edit: { kind: "rankUpVirtue", virtue },
      surface: "virtueRankUp",
      action: (expectedVersion) =>
        rankUpVirtueAction({ characterId, virtue, expectedVersion }),
      messages: {
        stale:
          "Someone else updated this character — refresh to see the latest.",
        error: "Couldn't rank up. Try again.",
      },
      onError: (error) => {
        if (error !== "rank-capped") return false
        toast.error(`${VIRTUE_LABELS[virtue]} is already at maximum rank.`)
        return true
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtues</CardTitle>
        <OwnerOnly>
          <CardAction>
            {logFull ? (
              <RankUpPopover
                eligible={eligibleForRankUp}
                disabled={pending}
                onPick={handleRankUp}
              />
            ) : (
              <AddSparkPopover disabled={pending} onPick={handleAddSpark} />
            )}
          </CardAction>
        </OwnerOnly>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
          {VIRTUE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2"
            >
              <dt className="text-muted-foreground">{VIRTUE_LABELS[key]}</dt>
              <dd className="font-medium tabular-nums">
                {optimistic.virtues[key]}
              </dd>
            </div>
          ))}
        </dl>

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-border pt-3">
          <span className="font-medium">
            Sparks:{" "}
            <span className="tabular-nums">
              {optimistic.sparkLog.length} / {SPARK_LOG_CAPACITY}
            </span>
          </span>
          {breakdown.length > 0 ? (
            <span className="text-muted-foreground">
              (
              {breakdown
                .map(
                  ({ virtue, count }) => `${VIRTUE_LABELS[virtue]} ×${count}`
                )
                .join(", ")}
              )
            </span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  )
}

function AddSparkPopover({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (virtue: VirtueKey) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label="Add a Spark"
          >
            <SparkleIcon weight="bold" aria-hidden />
            Add Spark
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-56">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Tag the new Spark with a Virtue.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {VIRTUE_KEYS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant="outline"
                onClick={() => {
                  onPick(key)
                  setOpen(false)
                }}
              >
                {VIRTUE_LABELS[key]}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RankUpPopover({
  eligible,
  disabled,
  onPick,
}: {
  eligible: Set<VirtueKey>
  disabled: boolean
  onPick: (virtue: VirtueKey) => void
}) {
  const [open, setOpen] = useState(false)
  const eligibleList = VIRTUE_KEYS.filter((key) => eligible.has(key))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" disabled={disabled} aria-label="Rank up a Virtue">
            <SparkleIcon weight="fill" aria-hidden />
            Rank up a Virtue
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-56">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Pick a Virtue to rank up. The Spark log will clear.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {eligibleList.map((key) => (
              <Button
                key={key}
                size="sm"
                onClick={() => {
                  onPick(key)
                  setOpen(false)
                }}
              >
                {VIRTUE_LABELS[key]}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
