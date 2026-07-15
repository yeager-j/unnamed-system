"use client"

import {
  CalendarCheckIcon,
  CircleDashedIcon,
  ClockCountdownIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
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
 * state pill opens a **searchable day/slot picker** — a `Command` palette over
 * every upcoming slot, grouped by day, occupied slots disabled and attributed.
 * Type a day number to jump (a flat all-days list doesn't survive a 120-day
 * horizon). Floating and Not scheduled sit below the divider. Writes ride
 * `useTransition`; controls never disable on pending.
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
  const [open, setOpen] = useState(false)
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

  const scheduleTo = (slotId: string) => {
    setOpen(false)
    run(() => scheduleBeatAction({ campaignId, beatId, slotId }))
  }
  const clear = (floating: boolean) => {
    setOpen(false)
    run(() => clearBeatScheduleAction({ campaignId, beatId, floating }))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
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
            ? "Floating"
            : "Not scheduled"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          {clockStarted ? <CommandInput placeholder="Jump to a day…" /> : null}
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="Floating run anytime"
                onSelect={() => clear(true)}
              >
                <ClockCountdownIcon className="size-4 text-gold" />
                Floating
              </CommandItem>
              <CommandItem value="Not scheduled" onSelect={() => clear(false)}>
                <CircleDashedIcon className="size-4 text-muted-foreground" />
                Not scheduled
              </CommandItem>
            </CommandGroup>
            {clockStarted ? (
              <>
                <CommandSeparator />
                <CommandEmpty>No matching day.</CommandEmpty>
                {days.map((day) => (
                  <CommandGroup key={day.day} heading={day.label}>
                    {day.slots.map((slot) => {
                      const isCurrent =
                        schedule.kind === "scheduled" &&
                        schedule.slotId === slot.id
                      return (
                        <CommandItem
                          key={slot.id}
                          value={`${day.label} ${slot.label}`}
                          disabled={slot.occupiedBy !== null && !isCurrent}
                          onSelect={() => scheduleTo(slot.id)}
                        >
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              isCurrent && "font-medium text-primary-text"
                            )}
                          >
                            {slot.label}
                          </span>
                          {slot.occupiedBy !== null ? (
                            <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                              {slot.occupiedBy}
                            </span>
                          ) : null}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </>
            ) : (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Start the clock to schedule a day.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
