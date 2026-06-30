"use client"

import { SparkleIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"

import {
  eligibleVirtuesForRankUp,
  MAX_VIRTUE_RANK,
  SPARK_LOG_CAPACITY,
  sparkLogBreakdown,
} from "@workspace/game/engine"
import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game/foundation"
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
import { VIRTUE_LABELS } from "@/lib/ui/labels"

/**
 * Virtues block on the Explore tab's reference rail (PRD §6.1 / §7.5,
 * UNN-222; redesigned UNN-172). Each Virtue renders as a 0–{@link
 * MAX_VIRTUE_RANK} pip meter beside its numeral, and the shared Spark log as a
 * segment meter over the `Sparks: N / 7` counter and per-Virtue breakdown. For
 * owners it carries the "Add Spark" picker plus the "Rank up a Virtue" CTA that
 * surfaces when the log is full; public viewers see the meters read-only.
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
      <CardContent className="flex flex-col gap-3.5">
        <dl className="flex flex-col gap-2.5">
          {VIRTUE_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2.5">
              <dt className="w-20 shrink-0 text-xs text-muted-foreground">
                {VIRTUE_LABELS[key]}
              </dt>
              <VirtueMeter value={optimistic.virtues[key]} />
              <dd className="w-3.5 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums">
                {optimistic.virtues[key]}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="flex items-center gap-1.5 font-medium">
            <SparkleIcon
              weight="fill"
              aria-hidden
              className="text-sm text-muted-foreground"
            />
            Sparks:{" "}
            <span className="font-mono tabular-nums">
              {optimistic.sparkLog.length} / {SPARK_LOG_CAPACITY}
            </span>
          </span>
          <SparkMeter value={optimistic.sparkLog.length} />
          {breakdown.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              (
              {breakdown
                .map(
                  ({ virtue, count }) => `${VIRTUE_LABELS[virtue]} ×${count}`
                )
                .join(", ")}
              )
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The 0–{@link MAX_VIRTUE_RANK} rank track for one Virtue: filled pips up to
 * `value`, hollow after. Decorative — the adjacent numeral carries the value
 * for assistive tech, so the track is `aria-hidden`.
 */
function VirtueMeter({ value }: { value: number }) {
  return (
    <span className="flex flex-1 gap-[3px]" aria-hidden>
      {Array.from({ length: MAX_VIRTUE_RANK }).map((_, i) => (
        <span
          key={i}
          className={"h-1.5 flex-1 " + (i < value ? "bg-gold" : "bg-muted")}
        />
      ))}
    </span>
  )
}

/**
 * The Spark log fill, one outlined segment per slot up to {@link
 * SPARK_LOG_CAPACITY}. Decorative — the `Sparks: N / 7` counter above is the
 * accessible source of truth — so the track is `aria-hidden`.
 */
function SparkMeter({ value }: { value: number }) {
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: SPARK_LOG_CAPACITY }).map((_, i) => (
        <span
          key={i}
          className={
            "h-2 flex-1 border " +
            (i < value
              ? "border-gold/60 bg-gold"
              : "border-muted-foreground/40")
          }
        />
      ))}
    </span>
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
