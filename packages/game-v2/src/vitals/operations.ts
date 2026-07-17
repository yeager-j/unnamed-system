import { isNonNegativeInteger } from "@workspace/game-v2/kernel/amount"
import type { ResolvedVitals } from "@workspace/game-v2/vitals/resolved"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"
import { err, ok, type Result } from "@workspace/result"

/**
 * The pure pool operations over the **authored** depletion fields (D9/D10), re-homed
 * from v1's `adjust-pools.ts` onto the signed-depletion model. Each returns the
 * single changed field as a **patch** (`Pick<Vitals, "damage">` etc.) — the caller
 * merges it onto the component and re-resolves; nothing here reads or rebuilds the
 * whole component, mirroring v1's one-field-at-a-time writes.
 *
 * **Operations own their clamps (D10).** Storage is unbounded signed; the *rule*
 * lives in the operation, not the field.
 *
 * **The engine owns the amount backstop (UNN-565).** `@workspace/game-v2` ships to
 * the client and is directly callable, so a Server Action's Zod schema is not a
 * guaranteed chokepoint — a malformed amount smeared into a `z.number().int()` pool
 * bricks the row against every later load. So each op self-guards its amount and
 * returns an `invalid-input` {@link Result}, matching the rest transitions'
 * `isNonNegativeInteger` guard (UNN-553). The S2a Zod schema re-checks the same
 * bound for form-level error messages — the engine guard is the corruption backstop,
 * not the UX one. The guard is **by domain**: {@link applyDamage}'s amount is a
 * *signed delta* (a negative amount is the licensed Usury over-max grant, and the
 * depletion law states damage is a monoid action of (ℤ, +)), so it requires only an
 * integer; {@link applyHeal}/{@link applySpendSP}/{@link applyRecoverSP} are
 * *magnitudes* that floor at 0, so they require a non-negative integer.
 *
 * `applyUsePrisma` (in `resources/operations.ts`) is the sibling partial op — its
 * increment is a fixed `+1` with no untrusted amount, so it guards charges, not input.
 */

/**
 * The depletion fields load as `z.number().int()`, whose domain is exactly the
 * **safe** integers. An operation that sums its way past that boundary emits a
 * component its own load schema rejects: the optimistic client renders the frame,
 * the row commits, and every later read of it fails with `entity-load-failed` —
 * unreadable for good. So the accumulating ops **saturate** at the boundary rather
 * than escape it. Depletion is a magnitude, not a group; losing associativity out
 * at 2^53 costs nothing a rule depends on.
 */
const MAX_DEPLETION = Number.MAX_SAFE_INTEGER
const MIN_DEPLETION = Number.MIN_SAFE_INTEGER

function saturate(value: number, floor = MIN_DEPLETION): number {
  return Math.max(floor, Math.min(MAX_DEPLETION, value))
}

/**
 * Take damage (or grant over-max with a negative `amount`): `damage + amount`,
 * unclamped except at the safe-integer boundary. This is the operation licensed to
 * drive `damage` negative — a negative result floats current HP above `maxHP`
 * (Usury's Payday Loan); a large positive result drives current HP to a floored-0
 * overkill while `damage` keeps the true overkill magnitude. Its amount is a
 * **signed delta**, so the guard requires only an integer — a negative amount is
 * legal, a fractional/`NaN`/`Infinity` amount is `invalid-input`.
 */
export function applyDamage(
  vitals: Vitals,
  amount: number
): Result<Pick<Vitals, "damage">, "invalid-input"> {
  if (!Number.isInteger(amount)) return err("invalid-input")
  return ok({ damage: saturate(vitals.damage + amount) })
}

/**
 * Heal: reduce `damage`, floored at 0 — no overheal. A heal must **never reduce**
 * current HP, so when `damage` is already negative (the entity is over-max from a
 * Usury loan) this is a **no-op** that preserves the over-max balance — flooring it
 * to 0 would silently wipe 115/100 down to 100/100. Reviving a Fallen entity falls
 * out for free: `damage` drops below `maxHP`, so {@link isFallen} flips false. The
 * amount is a magnitude, so a non-non-negative-integer is `invalid-input`.
 */
export function applyHeal(
  vitals: Vitals,
  amount: number
): Result<Pick<Vitals, "damage">, "invalid-input"> {
  if (!isNonNegativeInteger(amount)) return err("invalid-input")
  if (vitals.damage < 0) return ok({ damage: vitals.damage })
  return ok({ damage: Math.max(0, vitals.damage - amount) })
}

/**
 * Spend SP: `spSpent + amount`. Over-spend floors the *derived* `currentSP` at 0
 * (in `resolve`) without losing the stored count — the SP peer of overkill HP.
 *
 * A magnitude, unlike {@link applyDamage}: a negative `amount` would be a *grant*
 * of over-max SP, which is not a rule (see {@link SkillPool}) and which the load
 * schema rejects — so the op rejects it as `invalid-input` rather than emit a
 * component that could not be stored.
 */
export function applySpendSP(
  skillPool: SkillPool,
  amount: number
): Result<Pick<SkillPool, "spSpent">, "invalid-input"> {
  if (!isNonNegativeInteger(amount)) return err("invalid-input")
  return ok({ spSpent: saturate(skillPool.spSpent + amount, 0) })
}

/** Recover SP: reduce `spSpent`, floored at 0 — no over-recovery above `maxSP`. A
 *  magnitude, so a non-non-negative-integer amount is `invalid-input`. */
export function applyRecoverSP(
  skillPool: SkillPool,
  amount: number
): Result<Pick<SkillPool, "spSpent">, "invalid-input"> {
  if (!isNonNegativeInteger(amount)) return err("invalid-input")
  return ok({ spSpent: Math.max(0, skillPool.spSpent - amount) })
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
