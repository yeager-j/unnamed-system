"use client"

import { SparkleIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"

import type { VirtueKey } from "@workspace/game-v2/kernel/vocab"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { SegmentMeter } from "@workspace/ui/components/segment-meter"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { characterEntityWrite, CharacterRoot } from "@/domain/character/client"
import { buildVirtuesCardView } from "@/domain/character/view/virtues-card"
import { VIRTUE_LABELS } from "@/domain/labels"

import { RankUpDialog } from "./rank-up-dialog"
import { SheetCard } from "./sheet-card"

/**
 * The Virtues card (design frame `10b`): four rank rows over the Spark loop's
 * controls. The footer action follows the log — **Add Spark** (a popover
 * tagging the Spark with its Virtue, rulebook 1.2) until the log fills, then
 * **Rank Up a Virtue** (the forced flow; the dialog lists eligible Virtues
 * only). The client decides the swap off the view model; an `addSpark`
 * racing to a full log refuses `log-full` server-side, which reopens the
 * same dialog as the backstop.
 */
export function VirtuesCard() {
  const root = CharacterRoot.useRoot()
  const { entity } = root.value
  const [rankUpOpen, setRankUpOpen] = useState(false)
  const [sparkPickerOpen, setSparkPickerOpen] = useState(false)

  const view = buildVirtuesCardView(entity)

  const addSpark = (virtue: VirtueKey) => {
    setSparkPickerOpen(false)
    root.mutate(
      characterEntityWrite({
        entityId: root.value.profile.id,
        write: { component: "virtues", op: "addSpark", virtue },
      }),
      {
        onPrediction: (result) => {
          if (result.ok) return
          if (result.error === "log-full") {
            setRankUpOpen(true)
            return
          }
          toast.error("Couldn't add the Spark. Try again.")
        },
        onAcceptance: (result) => {
          if (result.ok) return
          if (
            (result.error.kind === "domain" ||
              result.error.kind === "replay-refused") &&
            result.error.error === "log-full"
          ) {
            setRankUpOpen(true)
            return
          }
          if (
            result.error.kind === "domain" ||
            result.error.kind === "replay-refused"
          ) {
            toast.error("Couldn't add the Spark. Try again.")
          }
        },
      }
    )
  }

  return (
    <SheetCard
      title="Virtues"
      headerSlot={
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
          Sparks · {view.sparkCount} / {view.sparkCapacity}
        </span>
      }
    >
      <dl className="flex flex-col gap-2.5">
        {view.rows.map(({ virtue, rank }) => (
          <div key={virtue} className="flex items-center gap-3">
            <dt className="w-24 shrink-0 text-sm text-foreground">
              {VIRTUE_LABELS[virtue]}
            </dt>
            <SegmentMeter
              label={`${VIRTUE_LABELS[virtue]} rank`}
              max={view.maxRank}
              value={rank}
              variant="primary"
            />
            <dd className="w-4 shrink-0 text-right font-mono text-sm font-bold tabular-nums">
              {rank}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-col gap-3 border-t pt-3.5">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {view.logFull
              ? "Your Spark log is full — rank up to keep earning."
              : `${view.sparkCapacity} Sparks rank up a Virtue`}
          </p>
          <OwnerOnly>
            {view.logFull ? (
              <Button size="sm" onClick={() => setRankUpOpen(true)}>
                Rank Up a Virtue
              </Button>
            ) : (
              <Popover open={sparkPickerOpen} onOpenChange={setSparkPickerOpen}>
                <PopoverTrigger render={<Button size="sm" variant="outline" />}>
                  <SparkleIcon aria-hidden />
                  Add Spark
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
                    Which Virtue earned this Spark?
                  </p>
                  <div className="flex flex-col">
                    {view.rows.map(({ virtue }) => (
                      <Button
                        key={virtue}
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() => addSpark(virtue)}
                      >
                        {VIRTUE_LABELS[virtue]}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </OwnerOnly>
        </div>

        <div className="flex flex-col gap-1.5">
          <SegmentMeter
            label="Spark log"
            max={view.sparkCapacity}
            value={view.sparkCount}
            variant="gold"
          />
          {view.breakdown.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {view.breakdown
                .map(
                  ({ virtue, count }) => `${VIRTUE_LABELS[virtue]} ×${count}`
                )
                .join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <RankUpDialog
        view={view}
        open={rankUpOpen}
        onOpenChange={setRankUpOpen}
      />
    </SheetCard>
  )
}
