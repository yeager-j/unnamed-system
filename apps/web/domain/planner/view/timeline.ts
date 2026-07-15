/**
 * The shared timeline shaping (phase 7 — UNN-580): one day-grouped view for
 * every surface that renders a run of `campaignUpdate` rows — the entity
 * pages' timelines, Day-End Capture's "Logged today", and the Chronicle.
 * Pure; the reads live in `lib/db/queries/load-campaign-updates.ts`.
 */

import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"

import {
  foldResolvedParticipants,
  type ParticipantHitsByKind,
  type ParticipantRef,
  type ResolvedParticipant,
} from "../participant"
import { activePeriod, monthDate, periodOf, type PeriodMarker } from "../period"

/** The timeline's slice of an update row, concerns folded in by the query. */
export interface TimelineUpdateInput {
  id: string
  day: number
  body: string
  category: UpdateCategory | null
  /** The update's primary ref; null means "the world". */
  primary: ParticipantRef | null
  concerns: readonly ParticipantRef[]
  /** True for slot-less rows — world updates take edit/delete/re-date/bind. */
  isWorld: boolean
  /** Non-null on ⚑ markers — the deadline article this update resolves (D5). */
  resolvesArticleId: string | null
}

/** One rendered timeline entry. */
export interface TimelineEntryView {
  id: string
  day: number
  body: string
  category: UpdateCategory | null
  /** True for slot-less rows — the timeline offers edit/delete on these. */
  isWorld: boolean
  /** The primary, resolved; null for "the world" rows. */
  primary: ResolvedParticipant | null
  /** True when the elided entity is the update's primary (vs merely concerned). */
  isPrimary: boolean
  /** Every participant except the elided entity — the strip when no primary chip renders. */
  others: ResolvedParticipant[]
  /** The row's actual concerns (elided entity included), resolved — the edit seed. */
  concerns: ResolvedParticipant[]
  /** ⚑ — the resolved deadline article this entry is the marker for, if any. */
  resolves: ResolvedParticipant | null
}

/** Entries grouped under their day heading, input (query) order preserved. */
export interface TimelineDayView {
  day: number
  /**
   * The in-month date ("May 3") when a month is active on this day, else null —
   * the heading's primary (`monthDate ?? "Day {day}"`), the raw `day` kept as a
   * quiet always-visible secondary (month names can repeat across a campaign).
   */
  monthDate: string | null
  /** The season in effect on this day; null when no seasons were supplied. */
  seasonLabel: string | null
  entries: TimelineEntryView[]
}

/**
 * Shapes update rows into day-grouped timeline entries: participants resolve
 * through the campaign-scoped hits (D4 — tombstoned names render muted,
 * misses fall back to captured labels, the page never breaks), ⚑ markers
 * resolve their anchor article's name the same way, and day groups pick up
 * their season label and in-month date (both inherit-forward, D1/UNN-629).
 * `opts.elide` names the surface's own entity (the entity pages) so it drops
 * out of every participant strip.
 */
export function buildTimelineDayViews(
  updates: readonly TimelineUpdateInput[],
  hits: ParticipantHitsByKind,
  opts: {
    elide?: Pick<ParticipantRef, "kind" | "id">
    seasons?: readonly PeriodMarker[]
    months?: readonly PeriodMarker[]
  } = {}
): TimelineDayView[] {
  const { elide, seasons, months } = opts
  const days: TimelineDayView[] = []
  for (const update of updates) {
    const isPrimary =
      elide !== undefined &&
      update.primary !== null &&
      update.primary.kind === elide.kind &&
      update.primary.id === elide.id
    const otherRefs = [
      ...(update.primary === null || isPrimary ? [] : [update.primary]),
      ...update.concerns.filter(
        (ref) =>
          !(
            elide !== undefined &&
            ref.kind === elide.kind &&
            ref.id === elide.id
          )
      ),
    ]
    const entry: TimelineEntryView = {
      id: update.id,
      day: update.day,
      body: update.body,
      category: update.category,
      isWorld: update.isWorld,
      primary:
        update.primary === null
          ? null
          : foldResolvedParticipants([update.primary], hits)[0]!,
      isPrimary,
      others: foldResolvedParticipants(otherRefs, hits),
      concerns: foldResolvedParticipants(update.concerns, hits),
      resolves:
        update.resolvesArticleId === null
          ? null
          : foldResolvedParticipants(
              [{ kind: "article", id: update.resolvesArticleId }],
              hits
            )[0]!,
    }
    const group = days.at(-1)
    if (group !== undefined && group.day === update.day) {
      group.entries.push(entry)
    } else {
      days.push({
        day: update.day,
        monthDate:
          months === undefined
            ? null
            : monthDate(update.day, activePeriod(months, update.day)),
        seasonLabel:
          seasons === undefined ? null : periodOf(seasons, update.day),
        entries: [entry],
      })
    }
  }
  return days
}
