import {
  ARCHETYPES,
  getArchetype,
} from "@workspace/game/data/archetypes/registry"
import { getTalent } from "@workspace/game/data/character/talents/registry"
import {
  ENEMIES,
  getEnemy,
  getEnemyFamily,
} from "@workspace/game/data/enemies/registry"
import { getEquippableItem, getItem } from "@workspace/game/data/items/registry"
import { getSkill } from "@workspace/game/data/skills/registry"
import {
  type ArchetypeLookup,
  type EnemyLookup,
  type ItemLookup,
  type SkillLookup,
  type TalentLookup,
} from "@workspace/game/engine/ports"

/**
 * The single adapter wiring the hardcoded catalog to the engine's lookup
 * {@link import("@workspace/game/engine/ports") ports}. It satisfies every port
 * structurally and is the **only** place the global registries are bound to the
 * engine contract — the imperative shell (`apps/web`) threads it into the
 * boundary functions (`buildStatContext` / `deriveHydratedCharacter` / view
 * assembly), and centralizes the demo-flag env-dependence the registries carry.
 * Engine tests inject this or a narrow stub directly, never a hidden default.
 */
export const gameData: ArchetypeLookup &
  SkillLookup &
  ItemLookup &
  EnemyLookup &
  TalentLookup = {
  getArchetype,
  allArchetypes: () => ARCHETYPES,
  getSkill,
  getItem,
  getEquippableItem,
  getEnemy,
  getEnemyFamily,
  allEnemies: () => ENEMIES,
  getTalent,
}
