"use client"

import {
  ArrowElbowDownRightIcon,
  CalendarBlankIcon,
  DotsThreeIcon,
  FlagIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"

import type { TimelineEntryView } from "@/domain/planner/view/timeline"
import { redateUpdateAction } from "@/lib/actions/campaign-updates/redate"
import {
  bindDeadlineMarkerAction,
  reopenDeadlineAction,
} from "@/lib/actions/campaign-updates/resolve-deadline"

/** A live unresolved deadline the bind control can point an update at. */
export interface BindableDeadline {
  articleId: string
  name: string
}

const REDATE_ERROR_COPY: Record<string, string> = {
  "update-resolves-deadline":
    "This update resolves a deadline — unbind the ⚑ first.",
  "future-day": "That day hasn't happened yet — the Chronicle is the past.",
  "update-not-found": "That entry is gone — refresh the page.",
  "clock-not-found": "The clock is gone — refresh the page.",
}

const BIND_ERROR_COPY: Record<string, string> = {
  "already-resolved": "Another update already resolves that deadline.",
  "update-already-marker": "This update already resolves a deadline.",
  "update-is-slotted": "Detach this activity from its slot first (re-date it).",
  "not-a-deadline": "That article isn't a deadline anymore.",
  "article-not-found": "That deadline is gone — refresh the page.",
  "update-not-found": "That entry is gone — refresh the page.",
}

/**
 * A timeline entry's overflow: **Re-date** (the detach rule, D3) and the
 * **"↳ Resolves a deadline"** bind/unbind pair (D5). Rendered by the shared
 * timeline wherever its policy allows — the actions are the shared ones, so
 * a re-date here is the same row everywhere.
 */
export function TimelineEntryMenu({
  campaignId,
  entry,
  currentDay,
  canRedate,
  bindableDeadlines,
  onMutated,
}: {
  campaignId: string
  entry: TimelineEntryView
  currentDay: number | null
  canRedate: boolean
  bindableDeadlines: BindableDeadline[]
  onMutated?: () => void
}) {
  const [redateOpen, setRedateOpen] = useState(false)
  const [, startTransition] = useTransition()

  const bind = (articleId: string) =>
    startTransition(async () => {
      const result = await bindDeadlineMarkerAction({
        campaignId,
        articleId,
        updateId: entry.id,
      })
      if (!result.ok) {
        toast.error(
          BIND_ERROR_COPY[result.error] ?? "Couldn't bind. Try again."
        )
        return
      }
      onMutated?.()
    })

  const unbind = (articleId: string) =>
    startTransition(async () => {
      const result = await reopenDeadlineAction({ campaignId, articleId })
      if (!result.ok) {
        toast.error("Couldn't unbind. Try again.")
        return
      }
      onMutated?.()
    })

  const showRedate = canRedate && currentDay !== null
  const showBind =
    entry.isWorld && entry.resolves === null && bindableDeadlines.length > 0

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="More actions"
              className="text-muted-foreground"
            />
          }
        >
          <DotsThreeIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showRedate ? (
            <DropdownMenuItem onClick={() => setRedateOpen(true)}>
              <CalendarBlankIcon className="size-4" />
              Re-date…
            </DropdownMenuItem>
          ) : null}
          {showBind ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowElbowDownRightIcon className="size-4" />
                Resolves a deadline
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {bindableDeadlines.map((deadline) => (
                  <DropdownMenuItem
                    key={deadline.articleId}
                    onClick={() => bind(deadline.articleId)}
                  >
                    <FlagIcon className="size-4" />
                    {deadline.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {entry.resolves !== null ? (
            <DropdownMenuItem onClick={() => unbind(entry.resolves!.ref.id)}>
              <FlagIcon className="size-4" />
              Unbind resolution — re-open {entry.resolves.label}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Mount-on-open: an SSR'd *closed* Base UI dialog still consumes an
          id slot and desyncs every downstream useId — and this one renders
          per timeline row (docs/lessons/2026-07-11-ssr-closed-overlay-desyncs-ids.md). */}
      {showRedate && redateOpen ? (
        <RedateDialog
          campaignId={campaignId}
          entry={entry}
          currentDay={currentDay}
          onOpenChange={setRedateOpen}
          onMutated={onMutated}
        />
      ) : null}
    </>
  )
}

function RedateDialog({
  campaignId,
  entry,
  currentDay,
  onOpenChange,
  onMutated,
}: {
  campaignId: string
  entry: TimelineEntryView
  currentDay: number
  onOpenChange: (open: boolean) => void
  onMutated?: () => void
}) {
  const [dayInput, setDayInput] = useState(String(entry.day))
  const [isPending, startTransition] = useTransition()

  const day = Number(dayInput)
  const valid = Number.isInteger(day) && day >= 1 && day <= currentDay

  const submit = () =>
    startTransition(async () => {
      const result = await redateUpdateAction({
        campaignId,
        updateId: entry.id,
        day,
      })
      if (!result.ok) {
        toast.error(
          REDATE_ERROR_COPY[result.error] ?? "Couldn't re-date. Try again."
        )
        return
      }
      onOpenChange(false)
      onMutated?.()
    })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Re-date this update</DialogTitle>
          <DialogDescription>
            {entry.isWorld
              ? `Move it to another day, 1 through ${currentDay}.`
              : `A slot's day is a fact — re-dating detaches this activity from its slot, making it a world update on the day you pick (1 through ${currentDay}).`}
          </DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          min={1}
          max={currentDay}
          value={dayInput}
          onChange={(event) => setDayInput(event.target.value)}
          aria-label="New day"
          className="font-mono"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid && !isPending}>
            Re-date to Day {valid ? day : "—"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
