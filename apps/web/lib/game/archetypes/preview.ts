import type { PathChoice } from "../character/state"
import type { HydratedSkill } from "../character/stats/hydrated-character"
import {
  computeMaxHP,
  computeMaxSP,
  type StatComputationCharacter,
} from "../character/stats/stats"
import {
  resolveAttackRoll,
  skillAttackRollContext,
} from "../combat/attack-roll"
import { getSkill } from "../skills"
import type { Skill } from "../skills/schema"
import { resolveSkillCost, type CastingCharacter } from "../skills/skill-cost"
import type { RankedSkill } from "./entries"
import type { Archetype } from "./schema"

/**
 * Catalog-only preview of an Archetype's Skills (PRD §5.1 — builder Step 2).
 *
 * Resolves every Rank-keyed Skill reference (and the Synthesis Skill) into the
 * `RankedSkill` shape the shared archetype display components consume.
 *
 * `resolvedCost` and `resolvedAttackRoll` are both computed against a synthetic
 * {@link StatComputationCharacter} carrying the player's already-picked
 * `pathChoice` and the previewed Archetype at Rank 2 (Origin's auto-assigned
 * Rank, PRD §5.1) — no equipment, no other Archetypes, no Mastery yet. That
 * yields the same concrete readout the live-sheet popover does once the
 * character is created, so the player sees `"1 HP"` and `"Attack Roll +2"`
 * instead of `"5% HP"` and a missing Attack-Roll section. Switching path
 * re-resolves on the next server revalidate.
 */
export function previewArchetypeSkills(
  archetype: Archetype,
  pathChoice: PathChoice
): { ranks: RankedSkill[]; synthesis: RankedSkill | null } {
  const stats: StatComputationCharacter = {
    pathChoice,
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: archetype.key,
    archetypes: [{ key: archetype.key, rank: 2 }],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
  }
  const casting: CastingCharacter = {
    ...stats,
    currentHP: computeMaxHP(stats),
    currentSP: computeMaxSP(stats),
  }

  const resolveSkill = (skill: Skill): HydratedSkill => {
    const context = skillAttackRollContext(skill)
    return {
      ...skill,
      resolvedCost: resolveSkillCost(skill, casting),
      resolvedAttackRoll: context
        ? resolveAttackRoll(context, stats, null)
        : null,
    }
  }

  const ranks: RankedSkill[] = archetype.skills.flatMap((reference) => {
    const skill = getSkill(reference.skill)
    if (!skill) return []
    return [{ ...resolveSkill(skill), rank: reference.rank }]
  })

  let synthesis: RankedSkill | null = null
  if (archetype.synthesisSkill) {
    const skill = getSkill(archetype.synthesisSkill.skill)
    if (skill) {
      synthesis = {
        ...resolveSkill(skill),
        rank: archetype.synthesisSkill.rank,
      }
    }
  }

  return { ranks, synthesis }
}
