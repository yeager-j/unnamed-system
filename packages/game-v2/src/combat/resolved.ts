import type {
  AttackRollEffect,
  DamageEffect,
} from "@workspace/game-v2/kernel/effects.schema"

/**
 * The **pending combat effects** `resolve` surfaces (D30) — the attack-roll and
 * damage effects collected from an entity's delta channels (the active mechanic
 * now, equipment/passives later) that have **no in-fold consumer yet**.
 *
 * Unlike affinity/attribute effects — consumed in-fold into `resolved.affinities`
 * / `resolved.attributes` — an attack-roll or damage effect is **contextual** (its
 * `when` filter resolves against a specific Skill/attack at use time), so it can't
 * become a number at resolve time. `resolve` therefore *carries* them here for the
 * PR7 attack-roll / damage-bonus resolvers to fold against an attack context. Each
 * effect lands in exactly one bucket by kind, so nothing is double-counted.
 *
 * Emitted only when non-empty (presence-gated, D40), so a plain entity with no
 * delta effects produces no `pendingEffects` read-unit.
 */
export interface ResolvedPendingEffects {
  attackRoll: readonly AttackRollEffect[]
  damage: readonly DamageEffect[]
}
