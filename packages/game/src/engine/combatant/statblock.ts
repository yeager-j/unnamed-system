import { type AttributeScores } from "@workspace/game/engine/character/stats/stats"
import { type ResolvedAttackRoll } from "@workspace/game/engine/combat/attack-roll"
import { hydrateEnemySkills } from "@workspace/game/engine/enemies/hydrate-enemy-skills"
import {
  type HydratedCharacter,
  type HydratedSkill,
} from "@workspace/game/foundation/character/hydrated-character"
import { type TalentKey } from "@workspace/game/foundation/character/talents/schema"
import {
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"
import { type EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

/**
 * The resolved combat statblock of a combatant — the provenance-neutral sheet
 * the combat engine and the statblock renderers care about: Attributes, an HP
 * pool ceiling, an Affinity chart, a hydrated Skill set, an optional weapon
 * Attack Roll, and freeform abilities.
 *
 * A PC and an enemy are the same thing here; they differ only in **provenance**
 * (`source`): a character's numbers are *derived* (archetype + path + level +
 * equipment), an enemy's are *authored flat*. Both produce a {@link Statblock}
 * via {@link statblockFromCharacter} / {@link statblockFromEnemy}, so the rail
 * detail and the three statblock renderers share one model instead of
 * re-deriving per side.
 *
 * Named `Statblock` rather than `Combatant` because the latter is already the
 * **session-instance** type (`foundation/encounter/session`) — the placed
 * combatant with its ref, side, zone, and overlay. A `Statblock` is the static
 * resolved sheet; the session combatant layers working HP / ailments / position
 * on top of it.
 */
export interface Statblock {
  /** How the numbers were produced — derived (`character`) vs authored flat
   *  (`enemy`). Lets a renderer branch on provenance without re-inspecting the
   *  combatant ref. */
  source: "character" | "enemy"
  name: string
  /** `null` only for a provisional inline enemy stat block that authored no
   *  level (UNN-299); a PC and a catalog enemy always carry one. */
  level: number | null
  attributes: AttributeScores
  maxHP: number
  /**
   * Full for a PC (every damage type charted), sparse for a catalog enemy (an
   * absent type ⇒ Neutral), `null` for a provisional inline enemy that authored
   * no chart. The grid renderer expands a sparse chart, filling Neutral.
   */
  affinities: Partial<Record<DamageType, Affinity>> | null
  /** The combatant's Skills, hydrated to the shared `SkillCard` shape (Attack
   *  Roll resolved against this statblock's Attributes). */
  skills: HydratedSkill[]
  /** Talent slugs; the UI resolves display names. */
  talents: TalentKey[]
  /** The equipped weapon's intrinsic Attack Roll (a PC); `null` for enemies,
   *  whose weapon attacks live in {@link abilities} as freeform prose. */
  weaponAttackRoll: ResolvedAttackRoll | null
  /** Freeform, DM-adjudicated abilities Markdown (an enemy); `null` for a PC. */
  abilities: string | null
}

/**
 * Projects a fully {@link HydratedCharacter} onto its {@link Statblock}. The
 * hydrated character is already ~80% a statblock — this drops the persisted /
 * PC-only fields and tags the provenance.
 */
export function statblockFromCharacter(
  character: HydratedCharacter
): Statblock {
  return {
    source: "character",
    name: character.name,
    level: character.level,
    attributes: character.attributes,
    maxHP: character.maxHP,
    affinities: character.affinityChart,
    skills: character.skills,
    talents: character.talents,
    weaponAttackRoll: character.weaponAttackRoll,
    abilities: null,
  }
}

/**
 * Derives a catalog {@link EnemyDefinition} into its {@link Statblock}: the flat
 * authored Attributes / maxHP / Affinities, its Skills hydrated against those
 * flat Attributes ({@link hydrateEnemySkills}), and its freeform abilities.
 * Enemies have no equipped weapon, so `weaponAttackRoll` is `null` (weapon
 * attacks are authored in `abilities`).
 */
export function statblockFromEnemy(enemy: EnemyDefinition): Statblock {
  return {
    source: "enemy",
    name: enemy.name,
    level: enemy.level,
    attributes: enemy.attributes,
    maxHP: enemy.maxHP,
    affinities: enemy.affinities,
    skills: hydrateEnemySkills(enemy),
    talents: enemy.talents,
    weaponAttackRoll: null,
    abilities: enemy.abilities ?? null,
  }
}
