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
 * player-entered `rolled` result. Both amounts must be non-negative integers: the
 * engine enforces that **itself** (it ships to the client and is directly callable,
 * so it can't rely on the caller having validated) and returns `invalid-input`. The
 * S2a Server Action's Zod schema re-checks the same bound (A8) for form-level error
 * messages — the engine guard is the corruption backstop, not the UX one.
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
 * spend more Skill or Hit Dice than the character has unspent
 * (`insufficient-*-dice`, v1's union), or passed a malformed amount — negative,
 * fractional, `NaN`/`Infinity` (`invalid-input`). The latter is a v2 addition: v1
 * kept its non-negative-integer guard in a co-located Zod schema, so moving that
 * schema out to the S2a action (E2 plan) would leave the client-shipped engine
 * unguarded — the engine now owns the backstop instead.
 */
export type RestError =
  | "insufficient-skill-dice"
  | "insufficient-hit-dice"
  | "invalid-input"

/**
 * A player-entered spend or roll must be a non-negative integer (A8). `NaN` and
 * `Infinity` fail {@link Number.isInteger} too, so this one predicate rejects every
 * malformed amount before it can smear a fractional value into an integer pool.
 */
function isNonNegativeInteger(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0
}

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
 * untouched. Fails — without producing a patch — with `invalid-input` for a
 * malformed amount, or `insufficient-skill-dice` when the spend exceeds the unspent
 * Skill Dice.
 */
export function applyPartialRest(
  components: RestComponents,
  { skillDiceToSpend, rolled }: PartialRestInput
): Result<RestPatch, RestError> {
  if (
    !isNonNegativeInteger(skillDiceToSpend) ||
    !isNonNegativeInteger(rolled)
  ) {
    return err("invalid-input")
  }

  const remaining =
    computeMaxSkillDice(components.level.value) -
    components.resources.skillDiceUsed
  if (skillDiceToSpend > remaining) {
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
 * a patch — with `invalid-input` for a malformed amount, or `insufficient-hit-dice`
 * when the spend exceeds the unspent Hit Dice.
 */
export function applyRespite(
  components: RestComponents,
  { hitDiceToSpend, rolled }: RespiteInput
): Result<RestPatch, RestError> {
  if (!isNonNegativeInteger(hitDiceToSpend) || !isNonNegativeInteger(rolled)) {
    return err("invalid-input")
  }

  const remaining =
    computeMaxHitDice(components.level.value) - components.resources.hitDiceUsed
  if (hitDiceToSpend > remaining) {
    return err("insufficient-hit-dice")
  }

  return ok({
    vitals: applyHeal(components.vitals, rolled),
    resources: {
      hitDiceUsed: components.resources.hitDiceUsed + hitDiceToSpend,
    },
  })
}
