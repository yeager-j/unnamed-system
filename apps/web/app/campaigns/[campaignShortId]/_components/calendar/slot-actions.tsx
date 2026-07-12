"use client"

import {
  CastleTurretIcon,
  PlusIcon,
  ScrollIcon,
} from "@phosphor-icons/react/dist/ssr"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { claimDungeonSlotAction } from "@/lib/actions/campaign-clock/dungeon-claim"
import { scheduleBeatAction } from "@/lib/actions/campaign-notes/schedule"
import type { SchedulableBeat } from "@/lib/db/queries/load-campaign-notes"

import { useCalendarWrite } from "./use-calendar-write"

/** A campaign dungeon the slot menu can claim ahead (D9). */
export interface ClaimableDungeon {
  id: string
  name: string
}

/**
 * An open slot's "+ Schedule a beat" menu (FR-8): schedulable beats (the
 * floating shelf + the never-scheduled) plus D9's claim-a-delve-ahead. The
 * slot is already chosen — this is the day-picker → slot-picker's other
 * half, so the menu is flat. Occupied races surface as `"slot-occupied"`.
 */
export function SlotActions({
  campaignId,
  slotId,
  beats,
  dungeons,
}: {
  campaignId: string
  slotId: string
  beats: SchedulableBeat[]
  dungeons: ClaimableDungeon[]
}) {
  const { run } = useCalendarWrite()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-text"
          />
        }
      >
        <PlusIcon className="size-3.5" />
        Schedule a beat
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Story beats</DropdownMenuLabel>
          {beats.length === 0 ? (
            <DropdownMenuItem disabled>
              Nothing unscheduled in Session Notes
            </DropdownMenuItem>
          ) : (
            beats.map((beat) => (
              <DropdownMenuItem
                key={beat.id}
                onClick={() =>
                  run(() =>
                    scheduleBeatAction({ campaignId, beatId: beat.id, slotId })
                  )
                }
              >
                <ScrollIcon className="text-gold" />
                <span className="truncate">
                  {beat.title.trim() === "" ? "Untitled beat" : beat.title}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
        {dungeons.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Claim a dungeon</DropdownMenuLabel>
              {dungeons.map((dungeon) => (
                <DropdownMenuItem
                  key={dungeon.id}
                  onClick={() =>
                    run(() =>
                      claimDungeonSlotAction({
                        campaignId,
                        slotId,
                        dungeonId: dungeon.id,
                      })
                    )
                  }
                >
                  <CastleTurretIcon className="text-gold" />
                  <span className="truncate">{dungeon.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
