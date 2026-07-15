"use client"

import {
  CastleTurretIcon,
  DotsThreeVerticalIcon,
  PlusIcon,
  ScrollIcon,
} from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { CalendarSlotContent } from "@/domain/planner/view/calendar"
import {
  claimDungeonSlotAction,
  unclaimDungeonSlotAction,
} from "@/lib/actions/campaign-clock/dungeon-claim"
import {
  clearBeatScheduleAction,
  scheduleBeatAction,
} from "@/lib/actions/campaign-notes/schedule"
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
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <PlusIcon className="size-3.5" />
        Schedule a beat
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-xs" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Story beats</DropdownMenuLabel>
          {beats.length === 0 ? (
            <DropdownMenuItem disabled>Nothing unscheduled</DropdownMenuItem>
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

/**
 * An occupied slot's ⋮ menu — the remove half of the schedule/claim pair. A
 * beat unschedules back to the prepped shelf (floating — it stays a click
 * away) or to Not scheduled; a delve unclaims, reverting the slot to
 * downtime (the dungeon stays in the library, D9). Recorded-downtime
 * suppression isn't in play here: future slots can't hold entries, and
 * today's set-aside confirm lives on the runner's pull-in menus.
 */
export function OccupiedSlotMenu({
  campaignId,
  slotId,
  content,
}: {
  campaignId: string
  slotId: string
  content: Exclude<CalendarSlotContent, { kind: "open" }>
}) {
  const { run } = useCalendarWrite()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground"
            aria-label={
              content.kind === "story"
                ? `Actions for ${content.beatTitle}`
                : `Actions for the ${content.dungeonName} delve`
            }
          />
        }
      >
        <DotsThreeVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {content.kind === "story" ? (
          <>
            <DropdownMenuItem
              onClick={() =>
                run(() =>
                  clearBeatScheduleAction({
                    campaignId,
                    beatId: content.beatId,
                    floating: true,
                  })
                )
              }
            >
              Make Floating
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                run(() =>
                  clearBeatScheduleAction({
                    campaignId,
                    beatId: content.beatId,
                    floating: false,
                  })
                )
              }
            >
              Unschedule
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onClick={() =>
              run(() => unclaimDungeonSlotAction({ campaignId, slotId }))
            }
          >
            Remove the delve — back to downtime
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
