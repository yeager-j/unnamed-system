/**
 * The wizard's movement list — the single source of truth for slugs, Roman
 * numerals, chapter titles, and italic framing lines (ADR-002 §"Structure —
 * four movements"). The shell reads from this; the route's
 * `[step]/page.tsx` validates the URL segment against it; the DB row's
 * `builderStep` integer is an index into it.
 */

export type RomanNumeral = "I" | "II" | "III" | "IV"

/**
 * The closed set of movement slugs. The route page narrows the URL segment
 * to this union after `indexOfStep` confirms the slug exists, so the
 * dispatch in `[step]/page.tsx` can be exhaustively type-checked without a
 * fallback branch.
 */
export type MovementSlug = "corpus" | "ortus" | "animus" | "persona"

export type BuilderStep = {
  /** URL slug — the segment under `/builder/[shortId]/`. */
  slug: MovementSlug
  /**
   * The Roman numeral rendered above the title in the chapter-header chrome.
   * One per movement; intentionally not derived from index so the source
   * file reads as data, not arithmetic.
   */
  romanNumeral: RomanNumeral
  /** The chapter title in serif type (e.g. "The Body"). */
  label: string
  /**
   * The italic serif framing line under the title. `null` for movements that
   * intentionally render without one (Movement 4 per ADR-002).
   */
  framingLine: string | null
}

export const BUILDER_STEPS = [
  {
    slug: "corpus",
    romanNumeral: "I",
    label: "Corpus",
    framingLine: "What shape does your power take?",
  },
  {
    slug: "ortus",
    romanNumeral: "II",
    label: "Ortus",
    framingLine: "Where does your character come from?",
  },
  {
    slug: "animus",
    romanNumeral: "III",
    label: "Animus",
    framingLine: "What are the contents of your soul?",
  },
  {
    slug: "persona",
    romanNumeral: "IV",
    label: "Persona",
    framingLine: "Who are you?",
  },
] as const satisfies readonly BuilderStep[]

export const FIRST_STEP_SLUG = BUILDER_STEPS[0].slug

/**
 * Resolves a step slug → its index in `BUILDER_STEPS`, or `null` if the slug
 * isn't recognized. Used by the route handler to validate the URL segment
 * and by the shell to highlight the current dot.
 */
export function indexOfStep(slug: string): number | null {
  const index = BUILDER_STEPS.findIndex((step) => step.slug === slug)
  return index === -1 ? null : index
}

/**
 * Resolves a `builderStep` index → its slug, clamping if the index is out
 * of range so a corrupted/old value can't trap the player.
 */
export function slugForStepIndex(index: number): MovementSlug {
  if (index < 0) return BUILDER_STEPS[0].slug
  if (index >= BUILDER_STEPS.length) {
    return BUILDER_STEPS[BUILDER_STEPS.length - 1]!.slug
  }
  return BUILDER_STEPS[index]!.slug
}
