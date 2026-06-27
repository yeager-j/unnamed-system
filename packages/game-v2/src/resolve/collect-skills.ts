import {
  activeArchetypeSkills,
  inheritedSkills,
} from "@workspace/game-v2/archetypes/skills"
import { equipmentGrantedSkills } from "@workspace/game-v2/items/equipment-skills"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { collectSkillRefs } from "@workspace/game-v2/skills/collect"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The **one** collection of every Skill an entity can field, deduped by key — the v2
 * analog of v1's `activeSkillsFor` `Set`, and the first phase of the resolve pipeline's
 * collect → resolve → hydrate shape. Four sources, each routed to the entity that
 * gives it the right form semantics (D19/D38):
 *
 * - **intrinsic** (`skills` component) — read off the **form-merged** entity (a form
 *   authors its own intrinsic skills, replacing the body's).
 * - **active archetype kit** (rank-gated + Synthesis) — **form-merged** ⇒ suppressed
 *   under a form (the form replaces the archetype base).
 * - **inheritance slots** — read off the **original** (pre-form) entity ⇒ active-scoped
 *   yet survives a form (the inherited kit you brought passes through a Shapechange).
 * - **equipment grants** — **form-merged** (equipment passes through a form fully, D22).
 *
 * This single collection feeds BOTH downstream readers — {@link skillEffects} (the
 * always-on `effects[]`, folded into the resolve pool) and the hydrated castable list —
 * so a Skill reachable from two sources folds **once** (deduped here), not twice, and an
 * enemy's intrinsic effect-bearing Skill folds at all. `formed === original` whenever no
 * form is active, collapsing to one entity in the common case.
 *
 * Dedup is **first-wins by key**, in source order (intrinsic → archetype → inheritance
 * → equipment): the contributor order the Attack-Roll readout preserves for a PC is
 * unchanged (no intrinsic ⇒ archetype → inheritance → equipment, the C6 contributor
 * order).
 */
export function collectSkills(
  deps: Pick<GameData, "getArchetype" | "getEquippableItem" | "getSkill">,
  formed: Entity,
  original: Entity
): Skill[] {
  return dedupeByKey([
    ...collectSkillRefs(formed.components.skills ?? [], deps.getSkill),
    ...activeArchetypeSkills(deps, formed),
    ...inheritedSkills(deps, original),
    ...equipmentGrantedSkills(deps, formed),
  ])
}

/**
 * The always-on `effects[]` a {@link collectSkills} collection contributes to the
 * resolve pool (D19). A Skill's `effects` (affinity/attribute/attackRoll) apply **for
 * as long as you have the Skill** — this is orthogonal to whether the Skill is castable
 * (`cost`/`kind: "passive"` is the *castability* axis, not the *effects* axis), so this
 * folds every collected Skill's effects, active and passive alike. Derived from the
 * deduped collection, so a Skill reachable twice folds once.
 */
export function skillEffects(collected: readonly Skill[]): CombatantEffect[] {
  return collected.flatMap((skill) => skill.effects ?? [])
}

function dedupeByKey(skills: readonly Skill[]): Skill[] {
  const seen = new Set<string>()
  return skills.filter((skill) => {
    if (seen.has(skill.key)) return false
    seen.add(skill.key)
    return true
  })
}
