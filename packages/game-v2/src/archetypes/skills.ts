import { hasUnlockedRank } from "@workspace/game-v2/archetypes/rank"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The archetype + inheritance halves of the skill **collection** (D19) — the
 * archetype-domain contributors `resolve/collect-skills.ts` unions with the intrinsic
 * and equipment halves. Each returns the **whole** unlocked kit (active *and*
 * passive); the collection then partitions it once — passives fold their `effects[]`
 * into the pool, the full set hydrates into the castable list. This replaces the old
 * passive-only walkers, whose split derivation let a skill granted twice fold twice.
 *
 * Both are **active-archetype-scoped** — an inherited skill applies only while the
 * Archetype whose slot holds it is active (a Warrior's inherited Ailment Boost is on
 * only while Warrior is active), exactly as v1's `activeSkillsFor` read the *active*
 * row's skills + slots. The two split on **form semantics** (D19/D38), which is why
 * `collectSkills` hands them different entities:
 *
 * - {@link activeArchetypeSkills} reads the **form-merged** entity's `archetypes.active`
 *   → **suppressed under a form** (the form replaces the archetype base; `applyForm`
 *   nulls `active`, so this yields `[]` for free).
 * - {@link inheritedSkills} reads the **original** (pre-form) entity's active Archetype
 *   slots → active-scoped, yet **passes through a form** (D19): the inherited kit you
 *   brought still works after a Shapechange.
 */

/**
 * The active Archetype's unlocked kit: its Rank-keyed Skills (+ Synthesis) whose
 * required Rank ≤ the roster Rank, resolved to catalog Skills (unresolved keys
 * dropped). Empty when no Archetype is active (incl. under a form). Mirrors v1
 * `activeSkillsFor`'s archetype + synthesis arms.
 */
export function activeArchetypeSkills(
  deps: Pick<GameData, "getArchetype" | "getSkill">,
  entity: Entity
): Skill[] {
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

  return references.flatMap((reference) => {
    if (!hasUnlockedRank(rank, reference.rank)) return []
    const skill = deps.getSkill(reference.skill)
    return skill ? [skill] : []
  })
}

/**
 * The Skills configured on the **active** Archetype's Inheritance Slots, resolved to
 * catalog Skills (empty slots skipped, unresolved keys dropped). An inherited Skill
 * applies only while its owning Archetype is active (v1 `activeSkillsFor`'s slot arm
 * read `active.inheritanceSlots`).
 */
export function inheritedSkills(
  deps: Pick<GameData, "getSkill">,
  entity: Entity
): Skill[] {
  const archetypes = entity.components.archetypes
  const activeKey = archetypes?.active
  if (!activeKey) return []

  const slots =
    archetypes.roster.find((entry) => entry.key === activeKey)
      ?.inheritanceSlots ?? []

  return slots.flatMap((slot) => {
    if (!slot.skillKey) return []
    const skill = deps.getSkill(slot.skillKey)
    return skill ? [skill] : []
  })
}
