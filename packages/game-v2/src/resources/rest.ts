import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import {
  computeMaxHitDice,
  computeMaxSkillDice,
} from "@workspace/game-v2/resources/derive"
import type { Exhaustion } from "@workspace/game-v2/resources/exhaustion.schema"
import type { Resources } from "@workspace/game-v2/resources/resources.schema"
import { applyHeal, applyRecoverSP } from "@workspace/game-v2/vitals/operations"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * The three rest transitions — Full, Partial, Respite — that recover a
 * character's pools between encounters (rulebook `2.5 Resting & Exhaustion`, ADR
 * §2.4 / CH5), re-homed from v1's `combat/rest.ts` onto the signed-depletion
 * model. Each is pure and returns an **entity-level patch** (a
 * {@link RestPatch} spanning `vitals`/`skillPool`/`resources`/`exhaustion`): the
 * caller merges the present fields onto the entity's stored components and
 * re-resolves — the atomic-op pattern (`vitals/operations.ts`,
 * `resources/operations.ts`), scaled from one field to several.
 *
 * **The depletion model makes "clamp at max" free** (D9/D10). Full HP is
 * `damage: 0`; recovered SP flows through {@link applyRecoverSP} (floors `spSpent`
 * at 0, so current SP never exceeds max); recovered HP through {@link applyHeal}
 * (floors `damage` at 0, so current HP never exceeds max). Only the dice maxima —
 * level-derived, {@link computeMaxHitDice}/{@link computeMaxSkillDice} — are needed,
 * and only to reject an over-spend of unspent dice.
 *
 * The MVP never rolls: where the rules call for a die, the caller passes the
 * player-entered `rolled` result. Amount validation (positive integer) lives in
 * the Server Action schema at cutover, as with the atomic ops.
 */

/**
 * The stored-component slice a resting character always carries. `resolve` is not
 * needed — these transitions read only depletion state and `level` (for the dice
 * maxima), never the derived maxHP/maxSP.
 */
export type RestComponents = Pick<
  ComponentRegistry,
  "vitals" | "skillPool" | "resources" | "exhaustion" | "level"
>

/**
 * An entity-level patch: each present key holds only the field(s) that transition
 * changed, mirroring the single-field `Pick` patches the atomic ops return. The
 * caller shallow-merges each present key onto the matching stored component.
 */
export interface RestPatch {
  vitals?: Pick<Vitals, "damage">
  skillPool?: Pick<SkillPool, "spSpent">
  resources?: Partial<
    Pick<Resources, "hitDiceUsed" | "skillDiceUsed" | "prismaUsed">
  >
  exhaustion?: Pick<Exhaustion, "level">
}

/**
 * Expected, recoverable failures (not programmer errors): the caller asked to
 * spend more Skill or Hit Dice than the character has unspent. Mirrors v1's union.
 */
export type RestError = "insufficient-skill-dice" | "insufficient-hit-dice"

/** Player-entered Partial Rest choices: Skill Dice to spend and the SP they roll. */
export interface PartialRestInput {
  skillDiceToSpend: number
  rolled: number
}

/** Player-entered Respite choices: Hit Dice to spend and the HP they roll. */
export interface RespiteInput {
  hitDiceToSpend: number
  rolled: number
}

/**
 * A Full Rest: HP and SP restored to max (`damage`/`spSpent` zeroed), all spent
 * Hit and Skill Dice and Prisma charges regained (`*Used` zeroed), and Exhaustion
 * reduced by one level (floored at 0). It has no failure mode, so it returns the
 * patch directly. The Prisma op is not composed here — refilling is a total zero,
 * not the partial spend that op guards.
 */
export function applyFullRest(components: RestComponents): RestPatch {
  return {
    vitals: { damage: 0 },
    skillPool: { spSpent: 0 },
    resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
    exhaustion: { level: Math.max(0, components.exhaustion.level - 1) },
  }
}

/**
 * A Partial Rest: HP restored to max; `skillDiceToSpend` Skill Dice consumed (not
 * regained until the next Full Rest) and the player-rolled `rolled` SP recovered,
 * clamped at max SP by {@link applyRecoverSP}. Hit Dice and Exhaustion are
 * untouched. Fails — without producing a patch — with `insufficient-skill-dice`
 * when the spend exceeds the unspent Skill Dice.
 */
export function applyPartialRest(
  components: RestComponents,
  { skillDiceToSpend, rolled }: PartialRestInput
): Result<RestPatch, RestError> {
  const remaining =
    computeMaxSkillDice(components.level.value) -
    components.resources.skillDiceUsed
  if (skillDiceToSpend < 0 || skillDiceToSpend > remaining) {
    return err("insufficient-skill-dice")
  }

  return ok({
    vitals: { damage: 0 },
    skillPool: applyRecoverSP(components.skillPool, rolled),
    resources: {
      skillDiceUsed: components.resources.skillDiceUsed + skillDiceToSpend,
    },
  })
}

/**
 * A Respite: the player-rolled `rolled` HP recovered, clamped at max HP by
 * {@link applyHeal}, and `hitDiceToSpend` Hit Dice consumed (not regained until
 * the next Full Rest). SP and Exhaustion are untouched. Fails — without producing
 * a patch — with `insufficient-hit-dice` when the spend exceeds the unspent Hit
 * Dice.
 */
export function applyRespite(
  components: RestComponents,
  { hitDiceToSpend, rolled }: RespiteInput
): Result<RestPatch, RestError> {
  const remaining =
    computeMaxHitDice(components.level.value) - components.resources.hitDiceUsed
  if (hitDiceToSpend < 0 || hitDiceToSpend > remaining) {
    return err("insufficient-hit-dice")
  }

  return ok({
    vitals: applyHeal(components.vitals, rolled),
    resources: {
      hitDiceUsed: components.resources.hitDiceUsed + hitDiceToSpend,
    },
  })
}
