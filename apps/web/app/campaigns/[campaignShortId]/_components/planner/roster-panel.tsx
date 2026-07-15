"use client"

import { CheckCircleIcon, MoonStarsIcon } from "@phosphor-icons/react/dist/ssr"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { initials } from "@workspace/ui/lib/initials"
import { cn } from "@workspace/ui/lib/utils"

import type { DayProgress } from "@/domain/planner/day-progress"
import type { RosterRowView } from "@/domain/planner/view/roster"

import { useRunnerSelection } from "./runner-selection"

/**
 * The Day Runner's sidebar panel (handoff §"Downtime resolution workspace"):
 * the day pill + campaign name up top, then the placed characters as
 * **selectable** rows (hub-and-spoke — resolve in any order), each carrying
 * a pip per downtime slot (filled = recorded) that collapses to the green
 * check when the character's day is done, and "The day" progress footer.
 * "Open character sheet" lives on the workspace card now.
 */
export function RosterPanel({
  campaignName,
  dayLine,
  roster,
  pipsByCharacter,
  progress,
}: {
  campaignName: string
  dayLine: string | null
  roster: RosterRowView[]
  /** Per character: one pip per downtime slot today, in rail order. */
  pipsByCharacter: Record<string, boolean[]>
  progress: DayProgress | null
}) {
  const { selectedCharacterId, selectCharacter } = useRunnerSelection()
  const effectiveSelectedId = selectedCharacterId ?? roster[0]?.id ?? null

  return (
    <>
      <SidebarHeader className="gap-2 p-4">
        {dayLine ? (
          <div className="flex items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            <MoonStarsIcon className="size-3.5 text-gold" />
            {dayLine}
          </div>
        ) : null}
        <div className="font-display text-lg leading-tight font-bold text-foreground">
          {campaignName}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            Placed characters · {roster.length}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {roster.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                No characters placed yet — players place theirs from their
                sheet, or you can from Manage.
              </p>
            ) : (
              <SidebarMenu>
                {roster.map((row) => (
                  <SidebarMenuItem key={row.id}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={row.id === effectiveSelectedId}
                      onClick={() => selectCharacter(row.id)}
                    >
                      <Avatar className="size-8 rounded-md">
                        {row.portraitUrl ? (
                          <AvatarImage src={row.portraitUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="rounded-md">
                          {initials(row.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid min-w-0 flex-1 text-left leading-tight">
                        <span className="truncate font-medium">{row.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {row.subtitle}
                        </span>
                      </div>
                      <SlotPips pips={pipsByCharacter[row.id] ?? []} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {progress !== null && progress.total > 0 ? (
        <SidebarFooter className="gap-1.5 border-t p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              The day
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
        </SidebarFooter>
      ) : null}
    </>
  )
}

/** One pip per downtime slot, collapsing to the green check when all filled. */
function SlotPips({ pips }: { pips: boolean[] }) {
  if (pips.length === 0) return null
  if (pips.every(Boolean)) {
    return (
      <CheckCircleIcon
        aria-label="All downtime recorded"
        weight="fill"
        className="size-4 shrink-0 text-green-500"
      />
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {pips.map((filled, index) => (
        <span
          key={index}
          className={cn(
            "size-1.5 rounded-full",
            filled ? "bg-primary" : "border border-muted-foreground/40"
          )}
        />
      ))}
    </span>
  )
}
