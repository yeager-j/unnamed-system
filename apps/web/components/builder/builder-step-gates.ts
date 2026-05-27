import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "../../lib/db/load-character"
import { isValidCreationAllocation } from "../../lib/game/character/virtues/utils"
import type { MovementSlug } from "./builder-steps"

/**
 * Shared "can the player advance from this movement?" predicates. Three
 * callers share the source of truth:
 *
 * - the wizard's Continue link (`nextGateForStep` — gates one movement at a
 *   time, surfaces the reason as the disabled-link tooltip);
 * - the route page on Movement 4 (calls `findStepGateFailures` to gate the
 *   Finalize button on every required input, not just persona's name);
 * - the `finalizeCharacterAction` Server Action (canonical server-side
 *   gate — re-runs every predicate and rejects the finalize on the first
 *   failure).
 *
 * Corpus, Ortus, and Persona gate; Movement 3 (Animus) is permissive by
 * design (ADR-002: the text-heavy work is opt-in and Knives / Chains /
 * Identity Traits do not block finalize) and intentionally does not appear
 * here.
 *
 * The input is the minimal structural slice of the builder character every
 * predicate needs. The route's `BuilderCharacter` and the action's loaded
 * row both satisfy this shape without wrapping.
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

/** The gate-bearing movement slugs. Slugs not listed are always advanceable. */
export type GatedStepSlug = "corpus" | "ortus" | "persona"

/**
 * Per-movement "can the player advance from here?" rule. Returns
 * `{ canAdvance: true }` for any slug that does not gate progress, so callers
 * never need a default branch.
 *
 * Reason strings are second-person prose because they surface as the
 * disabled-Continue / disabled-Finalize tooltip.
 */
export function nextGateForStep(
  slug: MovementSlug,
  character: StepGateCharacter
): StepGateResult {
  switch (slug) {
    case "corpus": {
      if (character.originArchetypeKey === null) {
        return {
          canAdvance: false,
          reason: "Pick an Origin Archetype to continue.",
        }
      }
      return { canAdvance: true }
    }
    case "ortus": {
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
      return { canAdvance: true }
    }
    case "persona": {
      if (character.name.trim().length === 0) {
        return {
          canAdvance: false,
          reason: "Give your character a name to finalize.",
        }
      }
      return { canAdvance: true }
    }
    default:
      return { canAdvance: true }
  }
}

/**
 * A gate failure surfaced on the Finalize button / finalize action. Each
 * entry names the movement slug so the consumer can render a "Fix in {slug}"
 * link if it wants to (the Finalize button just surfaces the first reason as
 * its disabled tooltip).
 */
export interface GateFailure {
  stepSlug: GatedStepSlug
  reason: string
}

/** Every gated movement in wizard order. */
export const GATED_STEPS: readonly GatedStepSlug[] = [
  "corpus",
  "ortus",
  "persona",
]

/**
 * Runs every gate in wizard order and returns the failures. The route page
 * uses the result to gate the Finalize button; the finalize Server Action
 * uses it to reject mid-write if anything has changed since the click.
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
