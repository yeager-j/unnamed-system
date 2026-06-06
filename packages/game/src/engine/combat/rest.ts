import { z } from "zod/v4"

import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  type StatComputationCharacter,
} from "@workspace/game/engine/character/stats/stats"
import { err, ok, type Result } from "@workspace/game/foundation/result"

/**
 * The three rest transitions — Full, Partial, Respite — that recover a
 * character's pools between encounters (PRD §7.3, rulebook
 * `2.5 Resting & Exhaustion`). The MVP never rolls: where the rules call for
 * a die, the caller passes the player-entered result. Pure and side-effect
 * free: every function returns a fresh {@link RestingCharacter} and never
 * mutates its input; persistence is the thin DB wrapper's job.
 *
 * Max HP/SP are derived (not stored) and need the full hydrated character, so
 * this independently extends the neutral {@link StatComputationCharacter} and
 * derives the maxes itself — the same shape `skill-cost`'s `CastingCharacter`
 * uses, kept separate to avoid coupling the two engines.
 */

/**
 * A {@link StatComputationCharacter} plus the live, tracked pools rest
 * recovers. The derived maxes (HP/SP/Hit/Skill Dice) are computed here from
 * the hydrated view and `level`, never read from storage.
 */
export interface RestingCharacter extends StatComputationCharacter {
  currentHP: number
  currentSP: number
  hitDiceRemaining: number
  skillDiceRemaining: number
  exhaustion: number
  prismaCharges: number
  prismaMaxCharges: number
}

/**
 * Expected, recoverable failures (not programmer errors): the caller asked to
 * spend more Skill or Hit Dice than the character has unspent.
 */
export type RestError = "insufficient-skill-dice" | "insufficient-hit-dice"

/** Player-entered Partial Rest choices: Skill Dice to spend and the SP they roll. */
export interface PartialRestInput {
  skillDiceSpent: number
  spRecovered: number
}

/** Player-entered Respite choices: Hit Dice to spend and the HP they roll. */
export interface RespiteInput {
  hitDiceSpent: number
  hpRecovered: number
}

/**
 * Server Action input guards (CLAUDE.md: the same Zod schemas validate Server
 * Action inputs). These bound the values to non-negative integers; the engine
 * still enforces the domain rule that dice spent cannot exceed those remaining.
 */
export const partialRestInputSchema = z.object({
  skillDiceSpent: z.number().int().nonnegative(),
  spRecovered: z.number().int().nonnegative(),
})

export const respiteInputSchema = z.object({
  hitDiceSpent: z.number().int().nonnegative(),
  hpRecovered: z.number().int().nonnegative(),
})

/**
 * A Full Rest: HP and SP restored to max, all spent Hit and Skill Dice
 * regained, Exhaustion reduced by one level (floored at 0), and Prisma charges
 * refilled to max. It has no failure mode, so it returns the new state
 * directly.
 */
export function applyFullRest(character: RestingCharacter): RestingCharacter {
  return {
    ...character,
    currentHP: computeMaxHP(character),
    currentSP: computeMaxSP(character),
    hitDiceRemaining: computeMaxHitDice(character.level),
    skillDiceRemaining: computeMaxSkillDice(character.level),
    exhaustion: Math.max(0, character.exhaustion - 1),
    prismaCharges: character.prismaMaxCharges,
  }
}

/**
 * A Partial Rest: HP restored to max; `skillDiceSpent` Skill Dice consumed
 * (not regained until the next Full Rest) and the player-rolled `spRecovered`
 * added to current SP, clamped at max SP. Hit Dice and Exhaustion are
 * untouched. Fails — without mutating — with `insufficient-skill-dice` when
 * the spend exceeds the unspent Skill Dice.
 */
export function applyPartialRest(
  character: RestingCharacter,
  { skillDiceSpent, spRecovered }: PartialRestInput
): Result<RestingCharacter, RestError> {
  if (skillDiceSpent < 0 || skillDiceSpent > character.skillDiceRemaining) {
    return err("insufficient-skill-dice")
  }

  return ok({
    ...character,
    currentHP: computeMaxHP(character),
    skillDiceRemaining: character.skillDiceRemaining - skillDiceSpent,
    currentSP: Math.min(
      computeMaxSP(character),
      character.currentSP + spRecovered
    ),
  })
}

/**
 * A Respite: the player-rolled `hpRecovered` added to current HP, clamped at
 * max HP, and `hitDiceSpent` Hit Dice consumed (not regained until the next
 * Full Rest). SP and Exhaustion are untouched. Fails — without mutating —
 * with `insufficient-hit-dice` when the spend exceeds the unspent Hit Dice.
 */
export function applyRespite(
  character: RestingCharacter,
  { hitDiceSpent, hpRecovered }: RespiteInput
): Result<RestingCharacter, RestError> {
  if (hitDiceSpent < 0 || hitDiceSpent > character.hitDiceRemaining) {
    return err("insufficient-hit-dice")
  }

  return ok({
    ...character,
    currentHP: Math.min(
      computeMaxHP(character),
      character.currentHP + hpRecovered
    ),
    hitDiceRemaining: character.hitDiceRemaining - hitDiceSpent,
  })
}
