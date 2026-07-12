"use client"

import {
  CaretDownIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { addDaysAction } from "@/lib/actions/campaign-clock/add-days"

import { useCalendarWrite } from "./use-calendar-write"

/**
 * The add-days bar (D1's third materialization point, `addDays`'s first UI):
 * Add 1 / Add 7 / an Add-N stepper popover, extending the planning horizon
 * without touching `currentDay`. Rides the `clockVersion` CAS like every
 * clock-structural write.
 */
export function AddDaysBar({
  campaignId,
  clockVersion,
}: {
  campaignId: string
  clockVersion: number
}) {
  const { run } = useCalendarWrite()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState(7)

  const add = (days: number) =>
    run(() =>
      addDaysAction({ campaignId, days, expectedVersion: clockVersion })
    )

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-dashed pt-4">
      <Button size="sm" onClick={() => add(1)}>
        <PlusIcon />
        Add a day
      </Button>
      <Button variant="outline" size="sm" onClick={() => add(7)}>
        <PlusIcon />
        Add 7 days
      </Button>
      <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" aria-label="Add several days…" />
          }
        >
          Add <span className="font-bold text-primary-text">{bulk}</span> days
          <CaretDownIcon className="opacity-60" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-52 p-2">
          <p className="px-1.5 pb-2 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            How many days?
          </p>
          <div className="flex items-center justify-between px-1 pb-2.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fewer days"
              onClick={() => setBulk((days) => Math.max(1, days - 1))}
            >
              <MinusIcon />
            </Button>
            <span className="font-mono text-2xl font-bold tabular-nums">
              {bulk}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More days"
              onClick={() => setBulk((days) => Math.min(365, days + 1))}
            >
              <PlusIcon />
            </Button>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setBulkOpen(false)
              add(bulk)
            }}
          >
            Add {bulk} days
          </Button>
        </PopoverContent>
      </Popover>
      <span className="text-xs text-muted-foreground">
        extend the calendar as the campaign runs long
      </span>
    </div>
  )
}
