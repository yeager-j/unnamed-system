import { ABERRATION_ENEMIES } from "@workspace/game-v2/catalog/enemies/aberration"
import { BEAST_ENEMIES } from "@workspace/game-v2/catalog/enemies/beast"
import { ELEMENTAL_ENEMIES } from "@workspace/game-v2/catalog/enemies/elemental"
import { HUMANOID_ENEMIES } from "@workspace/game-v2/catalog/enemies/humanoid"
import { MONSTROSITY_ENEMIES } from "@workspace/game-v2/catalog/enemies/monstrosity"
import { UNDEAD_ENEMIES } from "@workspace/game-v2/catalog/enemies/undead"
import type { Entity } from "@workspace/game-v2/kernel/entity"

/**
 * Catalog enemy templates (UNN-514). These are authored flat-base entities used
 * once at session mint; runtime combatants are inline copies and never
 * catalog-backed refs.
 */
const ENEMIES_BY_KEY = {
  ...HUMANOID_ENEMIES,
  ...BEAST_ENEMIES,
  ...UNDEAD_ENEMIES,
  ...ABERRATION_ENEMIES,
  ...MONSTROSITY_ENEMIES,
  ...ELEMENTAL_ENEMIES,
} as const satisfies Record<string, Entity>

const ENEMY_BY_KEY = new Map<string, Entity>(Object.entries(ENEMIES_BY_KEY))

/** Every catalog enemy template, in registration order. */
export const ENEMIES: readonly Entity[] = [...ENEMY_BY_KEY.values()]

/** Looks up an authored enemy template by key; `undefined` when none matches. */
export function getEnemy(key: string): Entity | undefined {
  return ENEMY_BY_KEY.get(key)
}
