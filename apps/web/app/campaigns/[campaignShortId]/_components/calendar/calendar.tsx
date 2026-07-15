"use client"

import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr"

import type { CalendarView } from "@/domain/planner/view/calendar"
import type { SchedulableBeat } from "@/lib/db/queries/load-campaign-notes"

import { AddDaysBar } from "./add-days-bar"
import { DayCard } from "./day-card"
import { DeadlineRibbon } from "./deadline-ribbon"
import type { DatableArticle } from "./quick-create"
import type { ClaimableDungeon } from "./slot-actions"

/**
 * The Calendar (UNN-578, PRD FR-8, handoff Screen 4): the DM's
 * upcoming-only agenda — the past belongs to the Chronicle. A 1120px
 * centered column: the deadline ribbon, one day card per materialized day
 * from today to the horizon, and the add-days bar. The ↑ Today FAB rides the
 * document scroll — today is always the first card.
 */
export function Calendar({
  campaignId,
  clockVersion,
  view,
  articles,
  beats,
  dungeons,
}: {
  campaignId: string
  clockVersion: number
  view: CalendarView
  /** Undated live articles — the quick-create pick list. */
  articles: DatableArticle[]
  /** Unscheduled + floating beats — the slot menu's schedule list. */
  beats: SchedulableBeat[]
  /** The campaign's dungeons — the slot menu's claim-ahead list (D9). */
  dungeons: ClaimableDungeon[]
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b px-4 py-5 md:px-7">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Calendar
          </h1>
          <span className="inline-flex h-[30px] items-center gap-2 rounded-full border bg-card px-3.5 font-mono text-xs text-muted-foreground tabular-nums">
            <span className="size-2 rounded-full bg-primary" />
            Now · Day {view.currentDay}
            {view.nowSeasonLabel ? ` · ${view.nowSeasonLabel}` : null}
          </span>
        </div>
      </header>
      <div className="flex-1 px-4 pt-6 pb-24 md:px-7">
        <section className="mx-auto w-full max-w-[1120px]">
          <p className="mb-3 text-[10px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
            Deadlines &amp; the days ahead
          </p>
          <DeadlineRibbon ribbon={view.ribbon} />
        </section>
        <section className="mx-auto mt-7 flex w-full max-w-[1120px] flex-col gap-3">
          <p className="text-[10px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
            The days
          </p>
          {view.days.map((day) => (
            <DayCard
              key={day.day}
              campaignId={campaignId}
              day={day}
              articles={articles}
              beats={beats}
              dungeons={dungeons}
            />
          ))}
          <AddDaysBar campaignId={campaignId} clockVersion={clockVersion} />
        </section>
      </div>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed right-6 bottom-6 z-40 inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/85"
      >
        <ArrowUpIcon className="size-4" />
        Today
      </button>
    </div>
  )
}
