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
 * The two halves split on **form semantics** (D19/D38), which is why they read
 * different fields off the (already form-merged) entity `resolve/passive-skill-
 * effects.ts` hands them:
 *
 * - {@link archetypeKitEffects} reads `archetypes.active` → **suppressed under a
 *   form** (a form replaces the archetype base; `applyForm` nulls `active`, so this
 *   yields `[]` for free).
 * - {@link inheritanceEffects} reads the whole `archetypes.roster` → **passes through
 *   a form** (`applyForm` preserves the roster, like Mastery).
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
 * The inherited Skills' passive effects — every roster entry's configured Inheritance
 * Slots (the **whole** roster, like the Mastery walk, so it survives a form-swap;
 * D19/D36). Each filled slot's Skill folds its `effects[]` when passive. Like v1
 * `activeSkillsFor`'s slot arm, it resolves the stored `skillKey` directly (no
 * validity gate — a stale slot simply resolves or doesn't).
 */
export function inheritanceEffects(
  deps: Pick<GameData, "getSkill">,
  entity: Entity
): CombatantEffect[] {
  const roster = entity.components.archetypes?.roster ?? []
  const effects: CombatantEffect[] = []
  for (const entry of roster) {
    for (const slot of entry.inheritanceSlots) {
      if (!slot.skillKey) continue
      const skill = deps.getSkill(slot.skillKey)
      if (skill && isPassive(skill) && skill.effects) {
        effects.push(...skill.effects)
      }
    }
  }
  return effects
}
