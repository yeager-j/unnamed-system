/**
 * The activity/update categories (PRD FR-2): categorization only — the tag
 * colors the Chronicle; only `collaborator` ever has a mechanical echo (the
 * bond, D8). `idle` is the one-click "did nothing substantial" mark (empty
 * body legal, muted and filtered out of the Chronicle by default).
 *
 * Homed in domain (UNN-580, the `PARTICIPANT_KINDS` precedent): the schema
 * column types itself off this vocabulary, not the other way round, so pure
 * view code never has to reach into `lib` for the values.
 */
export const UPDATE_CATEGORIES = [
  "virtue",
  "talent",
  "practical",
  "collaborator",
  "idle",
] as const

/** One of {@link UPDATE_CATEGORIES}. */
export type UpdateCategory = (typeof UPDATE_CATEGORIES)[number]
