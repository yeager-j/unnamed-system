import { hasUnlockedRank } from "@workspace/game-v2/archetypes/rank"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { isPassive } from "@workspace/game-v2/skills/skill.schema"

/**
 * The archetype + inheritance contributions to the resolve effects channel (D19) —
 * the archetype half of the passive-skill fold `resolve/passive-skill-effects.ts`
 * unions with the equipment half (mirroring `items/equipment-effects.ts`). A
 * **passive** Skill folds its own structured `effects[]`; an active Skill contributes
 * nothing here (it becomes castable — a skills concern, not a resolve contribution).
 *
 * Both are **active-archetype-scoped** — an inherited passive applies only while the
 * Archetype whose slot holds it is active (a Warrior's inherited Ailment Boost is on
 * only while Warrior is active), exactly as v1's `activeSkillsFor` read the *active*
 * row's skills + slots. The two halves split on **form semantics** (D19/D38), which
 * is why `resolve/passive-skill-effects.ts` hands them different entities:
 *
 * - {@link archetypeKitEffects} reads the **form-merged** entity's `archetypes.active`
 *   → **suppressed under a form** (the form replaces the archetype base; `applyForm`
 *   nulls `active`, so this yields `[]` for free).
 * - {@link inheritanceEffects} reads the **original** (pre-form) entity's active
 *   Archetype slots → active-scoped, yet **passes through a form** (D19): the inherited
 *   kit you brought still works after a Shapechange.
 */

/**
 * The active Archetype's own passive-Skill effects: its Rank-keyed Skills (+
 * Synthesis) unlocked at the roster Rank, each passive one folding its `effects[]`.
 * Empty when no Archetype is active (incl. under a form). Mirrors v1
 * `activeSkillsFor`'s archetype + synthesis arms, restricted to passives.
 */
export function archetypeKitEffects(
  deps: Pick<GameData, "getArchetype" | "getSkill">,
  entity: Entity
): CombatantEffect[] {
  const archetypes = entity.components.archetypes
  const activeKey = archetypes?.active
  if (!activeKey) return []

  const archetype = deps.getArchetype(activeKey)
  if (!archetype) return []

  const rank =
    archetypes.roster.find((entry) => entry.key === activeKey)?.rank ?? 0

  const references = archetype.synthesisSkill
    ? [...archetype.skills, archetype.synthesisSkill]
    : archetype.skills

  const effects: CombatantEffect[] = []
  for (const reference of references) {
    if (!hasUnlockedRank(rank, reference.rank)) continue
    const skill = deps.getSkill(reference.skill)
    if (skill && isPassive(skill) && skill.effects) {
      effects.push(...skill.effects)
    }
  }
  return effects
}

/**
 * The inherited Skills' passive effects — the **active** Archetype's configured
 * Inheritance Slots only (an inherited passive applies only while its owning
 * Archetype is active; v1 `activeSkillsFor`'s slot arm read `active.inheritanceSlots`).
 * Each filled slot's Skill folds its `effects[]` when passive; the stored `skillKey`
 * resolves directly (no validity gate — a stale slot simply resolves or doesn't).
 *
 * Pass the **pre-form** entity so this survives a form-swap (D19): `applyForm` nulls
 * `active`, but the original entity still names the active Archetype whose inherited
 * kit carries through the form.
 */
export function inheritanceEffects(
  deps: Pick<GameData, "getSkill">,
  entity: Entity
): CombatantEffect[] {
  const archetypes = entity.components.archetypes
  const activeKey = archetypes?.active
  if (!activeKey) return []

  const slots =
    archetypes.roster.find((entry) => entry.key === activeKey)
      ?.inheritanceSlots ?? []

  const effects: CombatantEffect[] = []
  for (const slot of slots) {
    if (!slot.skillKey) continue
    const skill = deps.getSkill(slot.skillKey)
    if (skill && isPassive(skill) && skill.effects) {
      effects.push(...skill.effects)
    }
  }
  return effects
}
