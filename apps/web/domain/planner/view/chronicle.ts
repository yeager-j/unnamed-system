import type {
  ChronicleFilters,
  ChronicleUpdateRow,
} from "@/lib/db/queries/load-campaign-updates"

import {
  PARTICIPANT_KINDS,
  type ParticipantHitsByKind,
  type ParticipantRef,
} from "../participant"
import type { PeriodMarker } from "../period"
import { UPDATE_CATEGORIES, type UpdateCategory } from "../update-category"
import { buildTimelineDayViews, type TimelineDayView } from "./timeline"

/**
 * Chronicle default-visibility (D9/PRD FR-2, pinned by UNN-576's AC ahead of
 * the phase-7 surface): **Idle entries are muted and filtered out by
 * default** — "did nothing substantial" is honest record-keeping, not
 * timeline content. Everything else (world updates, categorized downtime)
 * shows. The Chronicle's filter toggle simply stops calling this; the SQL
 * half of the same rule lives in `loadChroniclePage`'s default predicate
 * (pinned both ways by tests).
 */
export function isShownByDefaultInChronicle(update: {
  category: UpdateCategory | null
}): boolean {
  return update.category !== "idle"
}

/**
 * Shapes one Chronicle page (newest-first: `day DESC, authoredAt DESC`) into
 * day groups reading **descending by day, ascending within a day** — the
 * feed scrolls back through history, but a day reads top-to-bottom like the
 * day it was.
 */
export function buildChronicleDayViews(
  updates: readonly ChronicleUpdateRow[],
  hits: ParticipantHitsByKind,
  periods: {
    seasons: readonly PeriodMarker[]
    months: readonly PeriodMarker[]
  }
): TimelineDayView[] {
  const days = buildTimelineDayViews(updates, hits, {
    seasons: periods.seasons,
    months: periods.months,
  })
  for (const day of days) day.entries.reverse()
  return days
}

/**
 * Appends an older page's day groups onto the loaded feed, merging the day a
 * page boundary split: the older page's slice of that day holds its
 * **earlier** entries (the scan is descending), so it prepends. Entries the
 * feed already holds are dropped from the older page — after a mutation the
 * RSC-rendered first page re-anchors on its own (its boundary can't be
 * re-chained the way the client slices can), so a row that slid across that
 * seam would otherwise render twice. Pure, so both rules are unit-tested
 * instead of living ad-hoc in the component.
 */
export function mergeChroniclePages(
  loaded: readonly TimelineDayView[],
  older: readonly TimelineDayView[]
): TimelineDayView[] {
  const seen = new Set(
    loaded.flatMap((day) => day.entries.map((entry) => entry.id))
  )
  const fresh = older
    .map((day) => ({
      ...day,
      entries: day.entries.filter((entry) => !seen.has(entry.id)),
    }))
    .filter((day) => day.entries.length > 0)

  const lastLoaded = loaded.at(-1)
  const firstFresh = fresh[0]
  if (
    lastLoaded === undefined ||
    firstFresh === undefined ||
    lastLoaded.day !== firstFresh.day
  ) {
    return [...loaded, ...fresh]
  }
  return [
    ...loaded.slice(0, -1),
    {
      ...lastLoaded,
      entries: [...firstFresh.entries, ...lastLoaded.entries],
    },
    ...fresh.slice(1),
  ]
}

/** The Chronicle's URL state, decoded from `searchParams`. */
export interface ChronicleParams {
  filters: ChronicleFilters
  /** The `?day=N` slice bound (Day-End's "Open in Chronicle" link). */
  startDay: number | null
}

/**
 * Decodes the Chronicle's `searchParams` — `about=kind:id`, `cat=category`,
 * `idle=1`, `day=N` — treating anything malformed as absent (a shared URL
 * never 500s). Filter state lives in the URL so views are shareable and the
 * back button works; the pagination cursor deliberately does not.
 */
export function parseChronicleParams(params: {
  about?: string | string[]
  cat?: string | string[]
  idle?: string | string[]
  day?: string | string[]
}): ChronicleParams {
  return {
    filters: {
      participant: parseParticipant(single(params.about)),
      category: parseCategory(single(params.cat)),
      showIdle: single(params.idle) === "1",
    },
    startDay: parseDay(single(params.day)),
  }
}

/**
 * The inverse of {@link parseChronicleParams}: serializes URL state back to
 * a query string (empty string when everything is default). One encoder, so
 * the filter bar, the jump rail, and Day-End's day-slice link agree on the
 * grammar.
 */
export function chronicleSearchParams(params: ChronicleParams): string {
  const search = new URLSearchParams()
  if (params.filters.participant !== null) {
    search.set(
      "about",
      `${params.filters.participant.kind}:${params.filters.participant.id}`
    )
  }
  if (params.filters.category !== null) {
    search.set("cat", params.filters.category)
  }
  if (params.filters.showIdle) search.set("idle", "1")
  if (params.startDay !== null) search.set("day", String(params.startDay))
  const encoded = search.toString()
  return encoded === "" ? "" : `?${encoded}`
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseParticipant(
  value: string | undefined
): Pick<ParticipantRef, "kind" | "id"> | null {
  if (value === undefined) return null
  const separator = value.indexOf(":")
  if (separator === -1) return null
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!(PARTICIPANT_KINDS as readonly string[]).includes(kind) || id === "")
    return null
  return { kind: kind as ParticipantRef["kind"], id }
}

function parseCategory(value: string | undefined): UpdateCategory | null {
  if (value === undefined) return null
  return (UPDATE_CATEGORIES as readonly string[]).includes(value)
    ? (value as UpdateCategory)
    : null
}

function parseDay(value: string | undefined): number | null {
  if (value === undefined) return null
  const day = Number(value)
  return Number.isInteger(day) && day >= 1 ? day : null
}
