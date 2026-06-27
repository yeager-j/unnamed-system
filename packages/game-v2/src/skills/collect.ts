import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"
import type { SkillRef } from "@workspace/game-v2/skills/skills.schema"

/**
 * Resolves an entity's **intrinsic** Skills component (`SkillRef[]` — catalog refs
 * and/or inline Skills authored on enemies/NPCs/summons/objects) to catalog
 * {@link Skill}s. Catalog refs that no longer resolve are dropped (the lookup-port
 * convention); inline Skills pass through verbatim.
 *
 * The intrinsic half of the skill **collection** (`resolve/collect-skills.ts`),
 * sibling to the archetype + inheritance + equipment halves — this is the *collect*
 * step (raw Skills), distinct from the *hydrate* step (`skills/resolved.ts`) that
 * resolves a Skill's cost + Attack Roll against a finished `ResolvedEntity`.
 */
export function collectSkillRefs(
  refs: readonly SkillRef[],
  getSkill: GameData["getSkill"]
): Skill[] {
  return refs.flatMap((ref) => {
    const skill = ref.kind === "ref" ? getSkill(ref.key) : ref.skill
    return skill ? [skill] : []
  })
}
