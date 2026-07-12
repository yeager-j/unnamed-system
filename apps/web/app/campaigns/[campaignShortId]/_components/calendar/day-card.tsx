"use client"

import { CastleTurretIcon, ScrollIcon } from "@phosphor-icons/react/dist/ssr"
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import type {
  CalendarDayView,
  CalendarSlotView,
} from "@/domain/planner/view/calendar"
import {
  clearSeasonAction,
  setSeasonAction,
} from "@/lib/actions/campaign-clock/season"
import type { SchedulableBeat } from "@/lib/db/queries/load-campaign-notes"

import { SlotIcon } from "../planner/slot-icon"
import { DatedLine } from "./dated-line"
import { QuickCreate, type DatableArticle } from "./quick-create"
import {
  OccupiedSlotMenu,
  SlotActions,
  type ClaimableDungeon,
} from "./slot-actions"
import { useCalendarWrite } from "./use-calendar-write"

/**
 * One agenda day card (handoff Screen 4): the left column carries identity —
 * Today pin, day number, season (click to set/edit the inherit-forward
 * marker), dated-article lines or the quick-create pills — and the right
 * column the day's slots (beat title / claimed dungeon / "+ Schedule a
 * beat"). A day holding a live deadline tints red, the mock's alarm bell.
 */
export function DayCard({
  campaignId,
  day,
  articles,
  beats,
  dungeons,
}: {
  campaignId: string
  day: CalendarDayView
  articles: DatableArticle[]
  beats: SchedulableBeat[]
  dungeons: ClaimableDungeon[]
}) {
  const hasLiveDeadline = day.dated.some(
    (line) => line.kind === "deadline" && line.state !== "resolved"
  )

  return (
    <div
      className={cn(
        "flex flex-col items-stretch overflow-hidden rounded-lg border bg-card sm:flex-row",
        day.isToday && "border-primary ring-1 ring-primary ring-inset",
        !day.isToday && hasLiveDeadline && "border-destructive/55"
      )}
    >
      <div
        className={cn(
          "flex w-full shrink-0 flex-col items-start gap-2 border-b p-4 sm:w-[230px] sm:border-r sm:border-b-0",
          hasLiveDeadline && "border-destructive/45 bg-destructive/5"
        )}
      >
        {day.isToday ? (
          <span className="inline-flex h-5 items-center rounded-full bg-primary px-2.5 text-[9px] font-bold tracking-[0.08em] text-primary-foreground uppercase">
            Today
          </span>
        ) : null}
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl tracking-tight">
            Day {day.day}
          </span>
          <SeasonControl
            campaignId={campaignId}
            day={day.day}
            seasonLabel={day.seasonLabel}
            startsHere={day.seasonStartsHere}
          />
        </div>
        {day.dated.map((line) => (
          <DatedLine
            key={line.articleId}
            campaignId={campaignId}
            day={day.day}
            line={line}
          />
        ))}
        <QuickCreate
          campaignId={campaignId}
          day={day.day}
          articles={articles}
          compact={day.dated.length > 0}
        />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 p-4 lg:grid-cols-2">
        {day.slots.map((slot) => (
          <SlotBox
            key={slot.id}
            campaignId={campaignId}
            slot={slot}
            beats={beats}
            dungeons={dungeons}
          />
        ))}
      </div>
    </div>
  )
}

function SlotBox({
  campaignId,
  slot,
  beats,
  dungeons,
}: {
  campaignId: string
  slot: CalendarSlotView
  beats: SchedulableBeat[]
  dungeons: ClaimableDungeon[]
}) {
  const open = slot.content.kind === "open"
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5",
        slot.content.kind === "story" && "border-primary/35 bg-primary/12",
        slot.content.kind === "dungeon" && "border-gold/35 bg-gold/10",
        open && "border-dashed"
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-[0.05em] uppercase",
          slot.content.kind === "story"
            ? "text-primary-text"
            : slot.content.kind === "dungeon"
              ? "text-gold"
              : "text-muted-foreground"
        )}
      >
        <SlotIcon label={slot.label} className="size-3" />
        {slot.label}
      </span>
      {slot.content.kind === "story" ? (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium">
            <ScrollIcon className="size-3.5 shrink-0 text-gold" />
            <span className="truncate">{slot.content.beatTitle}</span>
          </span>
          <OccupiedSlotMenu
            campaignId={campaignId}
            slotId={slot.id}
            content={slot.content}
          />
        </>
      ) : slot.content.kind === "dungeon" ? (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium">
            <CastleTurretIcon className="size-3.5 shrink-0 text-gold" />
            <span className="truncate">{slot.content.dungeonName}</span>
          </span>
          <OccupiedSlotMenu
            campaignId={campaignId}
            slotId={slot.id}
            content={slot.content}
          />
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            Downtime
          </span>
          <SlotActions
            campaignId={campaignId}
            slotId={slot.id}
            beats={beats}
            dungeons={dungeons}
          />
        </>
      )}
    </div>
  )
}

/**
 * The season affordance (FR-8's inherit-forward label, the first UI to reach
 * phase 1's `setSeason`/`clearSeason` writes): the inherited label — or a
 * quiet "set season" — opens a dialog that writes a marker starting on
 * *this* day; a day holding the marker itself also offers Clear.
 */
function SeasonControl({
  campaignId,
  day,
  seasonLabel,
  startsHere,
}: {
  campaignId: string
  day: number
  seasonLabel: string | null
  startsHere: boolean
}) {
  const { run } = useCalendarWrite()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(seasonLabel ?? "")

  const submit = () => {
    const label = value.trim()
    if (label === "") return
    run(() => setSeasonAction({ campaignId, day, label }))
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(startsHere ? (seasonLabel ?? "") : "")
          setOpen(true)
        }}
        className={cn(
          "font-mono text-[11px] transition-colors hover:text-gold",
          seasonLabel ? "text-muted-foreground" : "text-muted-foreground/50"
        )}
      >
        {seasonLabel ?? "set season"}
      </button>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Season from Day {day}</DialogTitle>
              <DialogDescription>
                A sparse marker — every day from Day {day} inherits it until the
                next marker takes over.
                {startsHere
                  ? " This day holds a marker; clearing it lets the previous season run on."
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="season-label">Season</Label>
              <Input
                id="season-label"
                autoFocus
                value={value}
                placeholder="High Summer"
                maxLength={60}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
              />
            </div>
            <DialogFooter>
              {startsHere ? (
                <Button
                  variant="ghost"
                  className="mr-auto text-destructive"
                  onClick={() => {
                    run(() => clearSeasonAction({ campaignId, day }))
                    setOpen(false)
                  }}
                >
                  Clear marker
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
