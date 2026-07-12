import { FlagBannerIcon } from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

import type { CalendarRibbonView } from "@/domain/planner/view/calendar"

/**
 * The deadline ribbon (handoff Screen 4): an 8-day tick row with one
 * countdown bar per unresolved deadline spanning today→due. Far deadlines
 * arrive **clamped** — the bar runs the full window and its label points
 * off-grid ("→ Day 74"). Purely presentational; Resolve lives on the day
 * cards, where the deadline has room to act.
 */
export function DeadlineRibbon({ ribbon }: { ribbon: CalendarRibbonView }) {
  return (
    <div className="rounded-lg border bg-card/70 px-4 py-4">
      <div className="grid grid-cols-8 border-b pb-2">
        {ribbon.tickDays.map((day, index) => (
          <div
            key={day}
            className={cn(
              "text-center font-mono text-xs text-muted-foreground tabular-nums",
              index > 0 && "border-l border-border/60",
              index === 0 && "font-bold text-primary-text"
            )}
          >
            {day}
          </div>
        ))}
      </div>
      {ribbon.bars.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No deadlines looming — the days ahead are yours.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-8 gap-y-2">
          {ribbon.bars.map((bar) => (
            <div
              key={bar.articleId}
              className="min-w-0"
              style={{ gridColumn: `1 / ${bar.span + 1}` }}
            >
              <div className="flex h-[26px] items-center gap-2 overflow-hidden rounded-md border border-destructive/45 bg-destructive/20 px-2.5 whitespace-nowrap">
                <FlagBannerIcon
                  weight="fill"
                  className="size-3.5 shrink-0 text-destructive"
                />
                <span className="truncate text-xs font-semibold">
                  {bar.name}
                </span>
                <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-destructive tabular-nums">
                  {bar.countdownLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
