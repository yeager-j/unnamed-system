import { stripChipTokens } from "./chip"
import type { ParticipantRef } from "./participant"

/** How much prose a card shows before trailing off. */
const SUMMARY_LIMIT = 140

/**
 * The **chip hover-preview payload** (UNN-622, atomic-editor design §6.1): what
 * a pill's hover card shows. Fetched lazily per target — never folded into the
 * page's resolver payload, which every beat body and timeline line already
 * carries for refs nobody may hover.
 *
 * `name`/`tombstoned` are the **fallback** identity, not the display identity:
 * a caller that already resolved the ref (`ResolvedParticipant` on the display
 * path, the `ParticipantLinkWorld` snapshot in the editor) renders its own live
 * label, so a cached payload can never surface a stale name after a rename. The
 * payload's identity surfaces only where the caller has none — an editor chip
 * whose ref has left the live world, which the `deletedAt`-blind preview read
 * resolves as tombstoned.
 *
 * `sublabel` is the linker's traits line ("The Moon · Warlock", an article's
 * type, "Level 4 · Warrior"); `summary` is the opening of the subject's prose.
 * Articles have prose to open with (their body); NPCs have no summary field
 * yet, so theirs stays null until the ticket that adds one fills it in here.
 */
export interface ParticipantPreview {
  ref: ParticipantRef
  name: string
  tombstoned: boolean
  portraitUrl: string | null
  sublabel: string | null
  summary: string | null
}

/**
 * The opening of a chip-bearing markdown body, as a card-sized plain-text
 * summary: chip tokens collapse to their labels (a raw `[[npc:id|Maren]]` in a
 * preview would be worse than nothing), whitespace collapses to single spaces,
 * and an over-long body trails off at the last whole word inside the limit.
 * `null` for a body with nothing in it.
 */
export function previewSummary(markdown: string): string | null {
  const text = stripChipTokens(markdown).replace(/\s+/g, " ").trim()
  if (text === "") return null
  if (text.length <= SUMMARY_LIMIT) return text

  const clipped = text.slice(0, SUMMARY_LIMIT)
  const lastSpace = clipped.lastIndexOf(" ")
  return `${(lastSpace === -1 ? clipped : clipped.slice(0, lastSpace)).trimEnd()}…`
}
