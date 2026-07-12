/**
 * Entity-page shaping (phase 6 — UNN-579): the per-entity timeline (updates
 * where this entity is primary or concerned, PRD FR-10) and the delete
 * confirm's ref-count copy. Pure; the reads live in
 * `lib/db/queries/load-campaign-updates.ts` / `load-world-web.ts`.
 */

import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"

import {
  foldResolvedParticipants,
  type ParticipantHitsByKind,
  type ParticipantRef,
  type ResolvedParticipant,
} from "../participant"

/** The timeline's slice of an update row, concerns folded in by the query. */
export interface EntityTimelineUpdateInput {
  id: string
  day: number
  body: string
  category: UpdateCategory | null
  /** The update's primary ref; null means "the world". */
  primary: ParticipantRef | null
  concerns: readonly ParticipantRef[]
}

/** One rendered timeline entry. */
export interface EntityTimelineEntryView {
  id: string
  body: string
  category: UpdateCategory | null
  /** True when the page's entity is the update's primary (vs merely concerned). */
  isPrimary: boolean
  /** Every participant except the page's entity, resolved (tombstones muted). */
  others: ResolvedParticipant[]
}

/** Entries grouped under their day heading, input (query) order preserved. */
export interface EntityTimelineDayView {
  day: number
  entries: EntityTimelineEntryView[]
}

/**
 * Shapes the primary-or-concerned update rows into day-grouped timeline
 * entries: the page's own entity is elided from each entry's participant
 * strip (the page is the context), everyone else resolves through the
 * campaign-scoped hits (D4 — tombstoned names render muted, misses fall back
 * to captured labels, the page never breaks).
 */
export function buildEntityTimelineView(
  updates: readonly EntityTimelineUpdateInput[],
  self: ParticipantRef,
  hits: ParticipantHitsByKind
): EntityTimelineDayView[] {
  const days: EntityTimelineDayView[] = []
  for (const update of updates) {
    const isPrimary =
      update.primary !== null &&
      update.primary.kind === self.kind &&
      update.primary.id === self.id
    const otherRefs = [
      ...(update.primary === null || isPrimary ? [] : [update.primary]),
      ...update.concerns.filter(
        (ref) => !(ref.kind === self.kind && ref.id === self.id)
      ),
    ]
    const entry: EntityTimelineEntryView = {
      id: update.id,
      body: update.body,
      category: update.category,
      isPrimary,
      others: foldResolvedParticipants(otherRefs, hits),
    }
    const group = days.at(-1)
    if (group !== undefined && group.day === update.day) {
      group.entries.push(entry)
    } else {
      days.push({ day: update.day, entries: [entry] })
    }
  }
  return days
}

/** What still points at an entity — the delete confirm's inputs. */
export interface ParticipantRefCounts {
  relations: number
  updates: number
  beatMentions: number
}

/**
 * The delete confirm's reference sentence: "Referenced nowhere yet." when
 * clean, otherwise the non-zero parts joined — "Referenced by 2 relations
 * and 1 beat." Unit-tested copy, since it replaces phase 2's hardcoded lie.
 */
export function refCountLine(counts: ParticipantRefCounts): string {
  const parts = [
    countPart(counts.relations, "relation"),
    countPart(counts.updates, "update"),
    countPart(counts.beatMentions, "beat"),
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return "Referenced nowhere yet."
  if (parts.length === 1) return `Referenced by ${parts[0]}.`
  if (parts.length === 2) return `Referenced by ${parts[0]} and ${parts[1]}.`
  return `Referenced by ${parts[0]}, ${parts[1]}, and ${parts[2]}.`
}

function countPart(count: number, noun: string): string | null {
  if (count === 0) return null
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}
