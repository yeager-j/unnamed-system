/**
 * Day-End Capture shaping (phase 7 — UNN-580, PRD FR-6): the pre-suggest
 * drafts, the deadline alerts, and the hero's glance line. Pure — the page
 * assembles the inputs from what `DayRunnerRoot` already loads.
 */

import type { ParticipantRef, ResolvedParticipant } from "../participant"

/**
 * One pre-suggested draft chip. **Seed only, never a write** (FR-6): clicking
 * pre-fills the composer; recording stays the DM's explicit act.
 */
export interface DayEndPreSuggest {
  /** Stable per source: `beat:{id}` / `delve:{slotId}` / `deadline:{articleId}`. */
  id: string
  kind: "beat" | "delve" | "deadline"
  chipLabel: string
  seed: {
    body: string
    primary: ParticipantRef | null
    concerns: ParticipantRef[]
  }
}

/**
 * Builds the day's pre-suggests, in the ticket's order: each **resolved
 * beat** (primary = its first mention chip, concerns = the rest, draft = its
 * tagline), each **resolved dungeon slot** (primary-less "The party
 * delved…"), each **Looming/Due deadline** (primary = the dated article,
 * blank draft — the resolution prose is the DM's).
 */
export function buildDayEndPreSuggests(input: {
  resolvedBeats: readonly {
    id: string
    title: string
    tagline: string | null
    chips: readonly ResolvedParticipant[]
  }[]
  resolvedDelves: readonly { slotId: string; dungeonName: string }[]
  liveDeadlines: readonly { articleId: string; name: string }[]
}): DayEndPreSuggest[] {
  const asSeedRef = (participant: ResolvedParticipant): ParticipantRef => ({
    kind: participant.ref.kind,
    id: participant.ref.id,
    label: participant.label,
  })
  return [
    ...input.resolvedBeats.map((beat): DayEndPreSuggest => {
      const [first, ...rest] = beat.chips
      return {
        id: `beat:${beat.id}`,
        kind: "beat",
        chipLabel: beat.title,
        seed: {
          body: beat.tagline ?? "",
          primary: first === undefined ? null : asSeedRef(first),
          concerns: rest.map(asSeedRef),
        },
      }
    }),
    ...input.resolvedDelves.map(
      (delve): DayEndPreSuggest => ({
        id: `delve:${delve.slotId}`,
        kind: "delve",
        chipLabel: delve.dungeonName,
        seed: {
          body: `The party delved ${delve.dungeonName}.`,
          primary: null,
          concerns: [],
        },
      })
    ),
    ...input.liveDeadlines.map(
      (deadline): DayEndPreSuggest => ({
        id: `deadline:${deadline.articleId}`,
        kind: "deadline",
        chipLabel: deadline.name,
        seed: {
          body: "",
          primary: {
            kind: "article",
            id: deadline.articleId,
            label: deadline.name,
          },
          concerns: [],
        },
      })
    ),
  ]
}

/** The hero's mono glance line — pinned copy, in the handoff's phrasing. */
export function dayEndGlanceLine(
  downtimeCount: number,
  worldCount: number
): string {
  const activities = downtimeCount === 1 ? "activity" : "activities"
  const updates = worldCount === 1 ? "update" : "updates"
  return `${downtimeCount} downtime ${activities} recorded · ${worldCount} world ${updates} logged`
}

/** One Day-End deadline alert (FR-6's "LOOMING DEADLINE" banner). */
export interface DayEndDeadlineAlert {
  articleId: string
  name: string
  state: "looming" | "due"
  /** Days until `datedDay`; 0 or negative renders as DUE. */
  daysLeft: number
  /** Plain-text body excerpt (chips flattened); null when the article is bodyless. */
  excerpt: string | null
}

/** The alert countdown's big mono figure + label. */
export function deadlineCountdown(alert: DayEndDeadlineAlert): {
  figure: string
  label: string
} {
  if (alert.state === "due" || alert.daysLeft <= 0) {
    return { figure: "0", label: "due now" }
  }
  return {
    figure: String(alert.daysLeft),
    label: alert.daysLeft === 1 ? "day left" : "days left",
  }
}
