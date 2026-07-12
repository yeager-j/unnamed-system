"use client"

import {
  CalendarCheckIcon,
  CircleDashedIcon,
  ClockCountdownIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import type { SchedulePickerDayView } from "@/domain/planner/view/schedule-picker"
import {
  clearBeatScheduleAction,
  scheduleBeatAction,
} from "@/lib/actions/campaign-notes/schedule"

const SCHEDULE_ERROR_COPY: Record<string, string> = {
  "frozen-day": "That day is in the past — history stays put.",
  "slot-occupied": "That slot already holds a beat.",
  "slot-not-found": "That slot no longer exists — refresh the page.",
  "beat-not-found": "This beat is gone — refresh the page.",
  "clock-not-found": "Start the clock before scheduling.",
  "invalid-input": "Couldn't save — that input doesn't look right.",
}

/** A beat's schedule, pre-derived by the caller from the one stored fact. */
export type ScheduleState =
  | { kind: "scheduled"; slotId: string; label: string }
  | { kind: "floating" }
  | { kind: "none" }

/**
 * The beat editor's schedule control (handoff Screen 3 + §2's UX delta): the
 * state pill opens a **day-picker → slot-picker** menu — each upcoming day a
 * submenu of its slots, occupied slots disabled and attributed — then
 * Floating and Not scheduled below the divider. Writes ride `useTransition`;
 * controls never disable on pending.
 */
export function ScheduleControl({
  campaignId,
  beatId,
  schedule,
  days,
  clockStarted,
}: {
  campaignId: string
  beatId: string
  schedule: ScheduleState
  days: SchedulePickerDayView[]
  clockStarted: boolean
}) {
  const [, startTransition] = useTransition()

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) {
        toast.error(
          SCHEDULE_ERROR_COPY[result.error] ?? "Couldn't update the schedule."
        )
      }
    })

  const schedule_to = (slotId: string) =>
    run(() => scheduleBeatAction({ campaignId, beatId, slotId }))
  const clear = (floating: boolean) =>
    run(() => clearBeatScheduleAction({ campaignId, beatId, floating }))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={schedule.kind === "none" ? "outline" : "secondary"}
            size="sm"
            className={cn(
              schedule.kind === "scheduled" && "text-primary-text",
              schedule.kind === "floating" && "text-gold"
            )}
          />
        }
      >
        <ScheduleGlyph kind={schedule.kind} />
        {schedule.kind === "scheduled"
          ? schedule.label
          : schedule.kind === "floating"
            ? "Floating · run anytime"
            : "Not scheduled"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {clockStarted ? (
          days.map((day) => (
            <DropdownMenuSub key={day.day}>
              <DropdownMenuSubTrigger>
                <span className={cn(day.full && "text-muted-foreground")}>
                  {day.label}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-52">
                {day.slots.map((slot) => (
                  <DropdownMenuItem
                    key={slot.id}
                    disabled={
                      slot.occupiedBy !== null &&
                      !(
                        schedule.kind === "scheduled" &&
                        schedule.slotId === slot.id
                      )
                    }
                    onClick={() => schedule_to(slot.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {slot.label}
                    </span>
                    {slot.occupiedBy !== null ? (
                      <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                        {slot.occupiedBy}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        ) : (
          <DropdownMenuItem disabled>
            Start the clock to schedule
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => clear(true)}>
          <ClockCountdownIcon className="size-4 text-gold" />
          Floating · run anytime
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => clear(false)}>
          <CircleDashedIcon className="size-4 text-muted-foreground" />
          Not scheduled
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The schedule-state glyph the tree rows reuse (calendar / gold clock / dashed circle). */
export function ScheduleGlyph({
  kind,
  className,
}: {
  kind: "scheduled" | "floating" | "none"
  className?: string
}) {
  if (kind === "scheduled") {
    return <CalendarCheckIcon className={cn("size-4", className)} />
  }
  if (kind === "floating") {
    return <ClockCountdownIcon className={cn("size-4 text-gold", className)} />
  }
  return <CircleDashedIcon className={cn("size-4", className)} />
}
