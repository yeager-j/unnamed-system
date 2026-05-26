/**
 * The wizard's movement list — the single source of truth for slugs, Roman
 * numerals, chapter titles, and italic framing lines (ADR-002 §"Structure —
 * four movements"). The shell reads from this; the route's
 * `[step]/page.tsx` validates the URL segment against it; the DB row's
 * `builderStep` integer is an index into it.
 *
 * Movement bodies are filled in across sibling tickets:
 *
 * - `the-body`   → UNN-215 (Path picker + Archetype grid + narrative-light)
 * - `the-past`   → UNN-216 (Ancestry + Background + Virtues)
 * - `the-story`  → UNN-217 (writer view — Backstory / Knives / Chains / Identity)
 * - `the-person` → UNN-218 (Portrait + Pronouns + Name-last + Finalize)
 *
 * Until each movement's ticket lands, this ticket (UNN-214) renders a
 * placeholder so the shell can be exercised end-to-end.
 */

export type RomanNumeral = "I" | "II" | "III" | "IV"

export type BuilderStep = {
  /** URL slug — the segment under `/builder/[shortId]/`. */
  slug: string
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
    framingLine: "The body your character will inhabit.",
  },
  {
    slug: "ortus",
    romanNumeral: "II",
    label: "Ortus",
    framingLine: "The years before the adventure.",
  },
  {
    slug: "animus",
    romanNumeral: "III",
    label: "Animus",
    framingLine:
      "Knives, Chains, and Identity Traits — your DM needs these most.",
  },
  {
    slug: "persona",
    romanNumeral: "IV",
    label: "Persona",
    framingLine: null,
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
export function slugForStepIndex(index: number): string {
  if (index < 0) return BUILDER_STEPS[0].slug
  if (index >= BUILDER_STEPS.length) {
    return BUILDER_STEPS[BUILDER_STEPS.length - 1]!.slug
  }
  return BUILDER_STEPS[index]!.slug
}
