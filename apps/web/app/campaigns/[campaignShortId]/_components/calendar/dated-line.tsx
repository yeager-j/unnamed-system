"use client"

import {
  DotsThreeVerticalIcon,
  FlagBannerIcon,
  StarFourIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

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
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import type { CalendarDatedLine } from "@/domain/planner/view/calendar"
import {
  reopenDeadlineAction,
  resolveDeadlineAction,
} from "@/lib/actions/campaign-updates/resolve-deadline"
import {
  clearArticleDateAction,
  setArticleDateAction,
} from "@/lib/actions/campaign-world/article-date"

import { useCalendarWrite } from "./use-calendar-write"

/**
 * One dated-article line on a day card (D5's whole lifecycle in miniature):
 * a deadline renders red with Resolve while it looms or falls due, muted
 * with Reopen once a ⚑ marker binds it; an event renders gold and inert.
 * Re-dating lives in the ⋯ menu — hidden on a resolved deadline, whose date
 * is history until reopened (the server refuses regardless).
 */
export function DatedLine({
  campaignId,
  day,
  line,
}: {
  campaignId: string
  day: number
  line: CalendarDatedLine
}) {
  const { run } = useCalendarWrite()
  const [resolveOpen, setResolveOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  const isDeadline = line.kind === "deadline"
  const resolved = isDeadline && line.state === "resolved"

  return (
    <div className="group flex w-full min-w-0 items-center gap-1.5">
      {isDeadline ? (
        <FlagBannerIcon
          weight="fill"
          className={cn(
            "size-3.5 shrink-0",
            resolved ? "text-muted-foreground/60" : "text-destructive"
          )}
        />
      ) : (
        <StarFourIcon weight="fill" className="size-3.5 shrink-0 text-gold" />
      )}
      <span
        className={cn(
          "min-w-0 truncate text-xs font-semibold",
          isDeadline
            ? resolved
              ? "text-muted-foreground line-through decoration-muted-foreground/50"
              : "text-destructive"
            : "text-gold"
        )}
      >
        {line.name}
      </span>
      {isDeadline && !resolved ? (
        <Button
          variant="outline"
          size="xs"
          className="ml-auto shrink-0"
          onClick={() => setResolveOpen(true)}
        >
          Resolve
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 text-muted-foreground",
                !resolved && !isDeadline ? "ml-auto" : resolved ? "ml-auto" : ""
              )}
              aria-label={`Actions for ${line.name}`}
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {resolved ? (
            <DropdownMenuItem
              onClick={() =>
                run(() =>
                  reopenDeadlineAction({
                    campaignId,
                    articleId: line.articleId,
                  })
                )
              }
            >
              Reopen — the threat returns
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => setDateOpen(true)}>
                Change the day…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  run(() =>
                    clearArticleDateAction({
                      campaignId,
                      articleId: line.articleId,
                    })
                  )
                }
              >
                Remove from the calendar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {resolveOpen ? (
        <ResolveDialog
          name={line.name}
          onOpenChange={setResolveOpen}
          onResolve={(body) =>
            run(() =>
              resolveDeadlineAction({
                campaignId,
                articleId: line.articleId,
                body,
              })
            )
          }
        />
      ) : null}
      {dateOpen ? (
        <ChangeDateDialog
          name={line.name}
          kind={line.kind}
          initialDay={day}
          onOpenChange={setDateOpen}
          onSubmit={(newDay) =>
            run(() =>
              setArticleDateAction({
                campaignId,
                articleId: line.articleId,
                day: newDay,
                kind: line.kind,
              })
            )
          }
        />
      ) : null}
    </div>
  )
}

/**
 * The Resolve confirm (FR-6/7): prose optional — a blank body writes the
 * outcome-neutral "Resolved — ⟨name⟩" marker. Mounted only while open, like
 * every planner dialog.
 */
function ResolveDialog({
  name,
  onOpenChange,
  onResolve,
}: {
  name: string
  onOpenChange: (open: boolean) => void
  onResolve: (body: string) => void
}) {
  const [body, setBody] = useState("")

  const submit = () => {
    onResolve(body)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve “{name}”</DialogTitle>
          <DialogDescription>
            Writes a ⚑ marker into the Chronicle on today&apos;s date and takes
            the deadline off the ribbon. Resolved is outcome-neutral — it means
            the story answered it, not that it went well.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="resolve-body">What happened? (optional)</Label>
          <Textarea
            id="resolve-body"
            value={body}
            rows={3}
            placeholder={`Resolved — ${name}`}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <FlagBannerIcon weight="fill" />
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChangeDateDialog({
  name,
  kind,
  initialDay,
  onOpenChange,
  onSubmit,
}: {
  name: string
  kind: "event" | "deadline"
  initialDay: number
  onOpenChange: (open: boolean) => void
  onSubmit: (day: number) => void
}) {
  const [value, setValue] = useState(String(initialDay))

  const submit = () => {
    const day = Number.parseInt(value, 10)
    if (!Number.isInteger(day) || day < 1) return
    onSubmit(day)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move “{name}”</DialogTitle>
          <DialogDescription>
            {kind === "deadline"
              ? "The countdown re-aims at the new day."
              : "The event moves to the new day."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="dated-day">Day</Label>
          <Input
            id="dated-day"
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
