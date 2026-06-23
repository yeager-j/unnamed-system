import type { ResolvedVitals } from "@workspace/game-v2/vitals/resolved"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * The pure pool operations over the **authored** depletion fields (D9/D10), re-homed
 * from v1's `adjust-pools.ts` onto the signed-depletion model. Each returns the
 * single changed field as a **patch** (`Pick<Vitals, "damage">` etc.) — the caller
 * (a future reducer) merges it onto the component and re-resolves; nothing here
 * reads or rebuilds the whole component, mirroring v1's one-field-at-a-time writes.
 *
 * **Operations own their clamps (D10).** Storage is unbounded signed; the *rule*
 * lives in the operation, not the field. The four HP/SP ops are **total** (no
 * failure arm — driving `damage` negative is a legal Usury loan, not an error), so
 * they return plain patches. Only `applyUsePrisma` (in `resources/operations.ts`)
 * is partial.
 *
 * Amount validation (positive integer) lives in the Server Action schema at
 * cutover, as in v1; the engine accepts the signed/non-negative integer and clamps.
 */

/**
 * Take damage (or grant over-max with a negative `amount`): `damage + amount`,
 * **unclamped**. This is the operation licensed to drive `damage` negative — a
 * negative result floats current HP above `maxHP` (Usury's Payday Loan); a large
 * positive result drives current HP to a floored-0 overkill while `damage` keeps
 * the true overkill magnitude.
 */
export function applyDamage(
  vitals: Vitals,
  amount: number
): Pick<Vitals, "damage"> {
  return { damage: vitals.damage + amount }
}

/**
 * Heal: reduce `damage`, floored at 0 — no overheal. A heal must **never reduce**
 * current HP, so when `damage` is already negative (the entity is over-max from a
 * Usury loan) this is a **no-op** that preserves the over-max balance — flooring it
 * to 0 would silently wipe 115/100 down to 100/100. Reviving a Fallen entity falls
 * out for free: `damage` drops below `maxHP`, so {@link isFallen} flips false.
 */
export function applyHeal(
  vitals: Vitals,
  amount: number
): Pick<Vitals, "damage"> {
  if (vitals.damage < 0) return { damage: vitals.damage }
  return { damage: Math.max(0, vitals.damage - amount) }
}

/**
 * Spend SP: `spSpent + amount`. Over-spend floors the *derived* `currentSP` at 0
 * (in `resolve`) without losing the stored count — the SP peer of overkill HP.
 */
export function applySpendSP(
  skillPool: SkillPool,
  amount: number
): Pick<SkillPool, "spSpent"> {
  return { spSpent: skillPool.spSpent + amount }
}

/** Recover SP: reduce `spSpent`, floored at 0 — no over-recovery above `maxSP`. */
export function applyRecoverSP(
  skillPool: SkillPool,
  amount: number
): Pick<SkillPool, "spSpent"> {
  return { spSpent: Math.max(0, skillPool.spSpent - amount) }
}

/**
 * "Fallen" predicate (D9, supersedes v1's `currentHP <= 0`): equivalent to
 * `damage >= maxHP`, read off the resolved unit so over-max (negative `damage`,
 * `currentHP > maxHP`) is never Fallen. Kept a free predicate, not a resolved
 * field, so it composes where a renderer or the encounter layer needs it.
 */
export function isFallen(vitals: ResolvedVitals): boolean {
  return vitals.currentHP <= 0
}
