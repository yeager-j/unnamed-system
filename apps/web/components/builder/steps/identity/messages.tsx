import type { IdentityTraitField } from "@/lib/db/character-identity-traits"

/**
 * Per-kind copy for the five Step-4 Identity sections. Pulled into its own
 * map so the section component stays a thin shell — each label/blurb/
 * placeholder is in one place, mirroring how `lib/ui/labels.ts` centralizes
 * domain → display strings. Order here is the order rendered in the
 * builder step.
 */
export interface IdentityTraitMessages {
  label: string
  description: string
  placeholder: string
  /** Reason copy when this section is empty and the player clicks Next. */
  emptyReason: string
}

export const IDENTITY_TRAIT_ORDER: readonly IdentityTraitField[] = [
  "personality",
  "hope",
  "dream",
  "fear",
  "secret",
] as const

export const IDENTITY_TRAIT_MESSAGES: Record<
  IdentityTraitField,
  IdentityTraitMessages
> = {
  personality: {
    label: "Personality Traits",
    description:
      "Small, specific habits that make your character recognizable at the table. Use a `- ` list with one Trait per line. Aim for two to four.",
    placeholder:
      "- Blunt\n- Slow to anger\n- Always sharpens her knife when thinking",
    emptyReason: "Add at least one Personality Trait to continue.",
  },
  hope: {
    label: "Hopes",
    description:
      "Short-term, realistic goals your character is actively working toward — concrete enough that you and the DM will recognize one being fulfilled. One or two.",
    placeholder:
      "- Earn enough to free my sister from indenture\n- Find the family that left me at the temple gate",
    emptyReason: "Add at least one Hope to continue.",
  },
  dream: {
    label: "Dreams",
    description:
      "A long-term, larger-than-life goal your character cannot achieve alone — and may not achieve in their lifetime. Choose one.",
    placeholder: "To end the century-long war between Caelin and the Reach.",
    emptyReason: "Add a Dream to continue.",
  },
  fear: {
    label: "Fears",
    description:
      "Things that paralyze your character now but might be overcome through play. Every Fear emerges from a specific wound — capture both. One or two.",
    placeholder:
      "- Drowning. My brother fell through the ice when we were eight.\n- Being thought a coward.",
    emptyReason: "Add at least one Fear to continue.",
  },
  secret: {
    label: "Secrets",
    description:
      "Things only your character (and perhaps a very small circle) knows, which would be devastating if revealed. Share each with your DM in private. One or two.",
    placeholder:
      "- I cannot read the contracts I'm paid to guard.\n- I know the King is a Lich.",
    emptyReason: "Add at least one Secret to continue.",
  },
}
