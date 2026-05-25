import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "../../lib/db/load-character"
import { DRAFT_NAME_PLACEHOLDER } from "../../lib/db/start-character-draft"
import { isValidCreationAllocation } from "../../lib/game/virtues/allocation"
import { IDENTITY_TRAIT_MESSAGES } from "./steps/identity/messages"

/**
 * Shared "can the player advance from this step?" predicates. Lifted out of
 * `app/builder/[shortId]/[step]/page.tsx` so three callers share one source
 * of truth:
 *
 * - the wizard's Next button (`nextGateForStep` — gates one step at a time);
 * - the Review server component (calls every prior step's gate to render
 *   the validation summary that points at the failing step);
 * - the `finalizeCharacterAction` Server Action (canonical server-side
 *   gate — re-runs all predicates and rejects the finalize on the first
 *   failure).
 *
 * The input is the minimal structural slice of the builder character every
 * predicate needs. Both the route's `BuilderCharacter` and the action's
 * loaded row satisfy this shape without wrapping.
 */

/** The minimal builder-character slice the gates inspect. */
export interface StepGateCharacter {
  name: string
  originArchetypeKey: string | null
  virtueExpression: number
  virtueEmpathy: number
  virtueWisdom: number
  virtueFocus: number
  knives: readonly CharacterKnifeRow[]
  chains: readonly CharacterChainRow[]
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
}

export type StepGateResult =
  | { canAdvance: true }
  | { canAdvance: false; reason: string }

/** The gate-bearing step slugs. Steps not listed are always advanceable. */
export type GatedStepSlug =
  | "basic-info"
  | "path-and-archetype"
  | "character-origins"
  | "identity"

/**
 * The Step-3 hard minimums — surfaced here so the Knives/Chains editors and
 * the Review screen's "what's blocking finalize" summary share one source.
 */
export const MIN_KNIVES = 4
export const MIN_CHAINS = 1

/**
 * Per-step "can the player advance from here?" rule. Returns
 * `{ canAdvance: true }` for any step that does not gate progress, so callers
 * never need a default branch.
 *
 * Each reason string is written in second-person prose because it's surfaced
 * to the player as the disabled Next button's tooltip and (on the Review
 * screen) as the validation summary's bullet copy. PRD §5.2 lists the hard
 * requirements; the Step-3 minima for Knives/Chains and the Step-4 "all
 * five Identity sections non-empty" gate are existing UNN-207/208
 * conventions, not new requirements.
 */
export function nextGateForStep(
  slug: string,
  character: StepGateCharacter
): StepGateResult {
  switch (slug) {
    case "basic-info": {
      const trimmed = character.name.trim()
      if (trimmed.length === 0 || trimmed === DRAFT_NAME_PLACEHOLDER) {
        return {
          canAdvance: false,
          reason: "Give your character a name to continue.",
        }
      }
      return { canAdvance: true }
    }
    case "path-and-archetype": {
      if (character.originArchetypeKey === null) {
        return {
          canAdvance: false,
          reason: "Pick an Origin Archetype to continue.",
        }
      }
      return { canAdvance: true }
    }
    case "character-origins": {
      const allocation = {
        expression: character.virtueExpression,
        empathy: character.virtueEmpathy,
        wisdom: character.virtueWisdom,
        focus: character.virtueFocus,
      }
      if (!isValidCreationAllocation(allocation)) {
        return {
          canAdvance: false,
          reason:
            "Finish your Virtue allocation — one Virtue at +2 and two at +1.",
        }
      }
      if (character.knives.length < MIN_KNIVES) {
        const missing = MIN_KNIVES - character.knives.length
        return {
          canAdvance: false,
          reason: `Add at least ${missing} more Knife${missing === 1 ? "" : "s"} to continue.`,
        }
      }
      if (character.chains.length < MIN_CHAINS) {
        return {
          canAdvance: false,
          reason: "Add at least one Chain to continue.",
        }
      }
      return { canAdvance: true }
    }
    case "identity": {
      const sections = [
        { field: "personality" as const, value: character.personalityTraits },
        { field: "hope" as const, value: character.hopes },
        { field: "dream" as const, value: character.dreams },
        { field: "fear" as const, value: character.fears },
        { field: "secret" as const, value: character.secrets },
      ]
      const firstEmpty = sections.find(
        (section) => (section.value ?? "").trim().length === 0
      )
      if (firstEmpty) {
        return {
          canAdvance: false,
          reason: IDENTITY_TRAIT_MESSAGES[firstEmpty.field].emptyReason,
        }
      }
      return { canAdvance: true }
    }
    default:
      return { canAdvance: true }
  }
}

/**
 * A gate failure surfaced on the Review screen / finalize action. Each entry
 * names the step slug so the consumer can render a "Fix in {step}" link.
 */
export interface GateFailure {
  stepSlug: GatedStepSlug
  reason: string
}

/** Every gated step in wizard order. */
export const GATED_STEPS: readonly GatedStepSlug[] = [
  "basic-info",
  "path-and-archetype",
  "character-origins",
  "identity",
]

/**
 * Runs every gate in wizard order and returns the failures. The Review
 * screen renders these as a validation summary; the finalize Server Action
 * rejects if the list is non-empty.
 */
export function findStepGateFailures(
  character: StepGateCharacter
): GateFailure[] {
  const failures: GateFailure[] = []
  for (const slug of GATED_STEPS) {
    const result = nextGateForStep(slug, character)
    if (!result.canAdvance) {
      failures.push({ stepSlug: slug, reason: result.reason })
    }
  }
  return failures
}
