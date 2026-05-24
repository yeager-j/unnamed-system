/**
 * The wizard's step list — the single source of truth for slugs, labels, and
 * in-context guidance blurbs (PRD §5.1 + §11). Both the stepper UI and the
 * route's `[step]/page.tsx` switch read from this; `characters.builderStep`
 * is an index into it.
 *
 * Step bodies for everything past `basic-info` ship as placeholder
 * "Coming soon" surfaces in this ticket. Follow-up tickets fill them in:
 *
 * - `path-and-archetype` → UNN-205
 * - `background` → UNN-205 + UNN-207
 * - `identity` → UNN-207
 * - `review` → UNN-206
 */

export type BuilderStep = {
  /** URL slug — the segment under `/builder/[shortId]/`. */
  slug: string
  /** Short label shown in the step indicator and on the draft card. */
  label: string
  /**
   * The PRD-§11 short blurb rendered above the step body, explaining what
   * the player is choosing and why.
   */
  blurb: string
}

export const BUILDER_STEPS = [
  {
    slug: "basic-info",
    label: "Basic info",
    blurb:
      "Pick the name and pronouns your character goes by, and (optionally) upload a portrait. You can change any of these later from the sheet.",
  },
  {
    slug: "path-and-archetype",
    label: "Path & Archetype",
    blurb:
      "Choose your HP / SP path and your Origin Archetype. The Archetype sets your Attributes, Affinities, and starting Skills.",
  },
  {
    slug: "background",
    label: "Background",
    blurb:
      "Assign your starting Virtues and write the prose that grounds your character — Ancestry, Background, Backstory, Knives, and Chains.",
  },
  {
    slug: "identity",
    label: "Identity Traits",
    blurb:
      "Capture who your character is on the inside: Personality, Hopes, Dreams, Fears, and Secrets.",
  },
  {
    slug: "review",
    label: "Review",
    blurb: "Look over everything and finalize your character.",
  },
] as const satisfies readonly BuilderStep[]

export const FIRST_STEP_SLUG = BUILDER_STEPS[0].slug

/**
 * Resolves a step slug → its index in `BUILDER_STEPS`, or `null` if the slug
 * isn't recognized. Used by the route handler to validate the URL segment
 * and by the stepper to highlight the current pill.
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
