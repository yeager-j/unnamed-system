import { asc, eq } from "drizzle-orm"
import type { HydratedCharacter } from "../game/hydrated-character"
import { getEquippableItem } from "../game/items"
import { resolveSkillCost, type CastingCharacter } from "../game/skill-cost"
import { buildStatComputationCharacter } from "../game/stat-character"
import {
  computeAffinityChart,
  computeAttackRollBonus,
  computeAttributes,
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  type StatComputationCharacter,
} from "../game/stats"
import { db } from "./index"
import {
  characterArchetypes,
  characterChains,
  characterKnives,
  characterTalents,
  characters,
  inventoryItems,
} from "./schema/character"

/**
 * The full character-sheet loader. It owns the character query (by `id` or
 * public `shortId`), every child-row query, the pure
 * {@link buildStatComputationCharacter} hydration, and the derived-value
 * resolution — so the public sheet and every per-domain db wrapper share one
 * source of truth and a new effect/bonus source can no longer drift between
 * surfaces. Nothing here imports another db domain.
 *
 * The view types ({@link HydratedCharacter} and friends) live in
 * `lib/game/hydrated-character.ts` so game-layer code can consume them
 * without crossing into persistence; the assembly stays here.
 */

/** Row shapes inferred from the Drizzle schema. The Hydrated* view types
 *  reference these via type-only imports from `lib/game/`. */
export type CharacterRow = typeof characters.$inferSelect
export type CharacterArchetypeRow = typeof characterArchetypes.$inferSelect
export type CharacterKnifeRow = typeof characterKnives.$inferSelect
export type CharacterChainRow = typeof characterChains.$inferSelect
export type CharacterTalentRow = typeof characterTalents.$inferSelect
export type InventoryItemRow = typeof inventoryItems.$inferSelect

/**
 * Projects the persisted state onto the pure engine input. Only equipped
 * inventory items are passed through so item effects stay gated exactly as
 * before the full inventory was loaded for display.
 */
function statComputationCharacter(
  row: CharacterRow,
  archetypeRows: CharacterArchetypeRow[],
  inventoryRows: InventoryItemRow[]
): StatComputationCharacter {
  return buildStatComputationCharacter(
    {
      pathChoice: row.pathChoice,
      level: row.level,
      manualBonuses: row.manualBonuses,
      activeCharacterArchetypeId: row.activeArchetypeId,
    },
    archetypeRows.map((archetype) => ({
      id: archetype.id,
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: archetype.inheritanceSlots,
      mechanicState: archetype.mechanicState,
    })),
    inventoryRows
      .filter((item) => item.equipped)
      .map((item) => item.catalogItemKey)
  )
}

/**
 * Reconstructs the pure {@link StatComputationCharacter} from a hydrated
 * character. The single shared row→engine mapping so engine callers (e.g. the
 * rest wrapper) need not re-hand-roll it.
 */
export function toStatComputationCharacter(
  character: HydratedCharacter
): StatComputationCharacter {
  return statComputationCharacter(
    character,
    character.archetypeRows,
    character.inventory.map((entry) => entry.row)
  )
}

async function hydrate(row: CharacterRow): Promise<HydratedCharacter> {
  const [archetypeRows, inventoryRows, knives, chains, talents] =
    await Promise.all([
      db
        .select()
        .from(characterArchetypes)
        .where(eq(characterArchetypes.characterId, row.id)),
      db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.characterId, row.id)),
      db
        .select()
        .from(characterKnives)
        .where(eq(characterKnives.characterId, row.id))
        .orderBy(asc(characterKnives.order)),
      db
        .select()
        .from(characterChains)
        .where(eq(characterChains.characterId, row.id))
        .orderBy(asc(characterChains.order)),
      db
        .select()
        .from(characterTalents)
        .where(eq(characterTalents.characterId, row.id)),
    ])

  const stats = statComputationCharacter(row, archetypeRows, inventoryRows)
  const casting: CastingCharacter = {
    ...stats,
    currentHP: row.currentHP,
    currentSP: row.currentSP,
  }

  return {
    ...row,
    archetypeRows,
    knives,
    chains,
    talents,
    inventory: inventoryRows.map((item) => ({
      row: item,
      item: getEquippableItem(item.catalogItemKey),
    })),
    activeArchetypeKey: stats.activeArchetypeKey,
    attributes: computeAttributes(stats),
    maxHP: computeMaxHP(stats),
    maxSP: computeMaxSP(stats),
    maxHitDice: computeMaxHitDice(row.level),
    maxSkillDice: computeMaxSkillDice(row.level),
    affinityChart: computeAffinityChart(stats),
    attackRollBonus: computeAttackRollBonus(stats),
    activeMechanic: stats.activeMechanic,
    skills: stats.activeSkills.map((skill) => ({
      skill,
      cost: resolveSkillCost(skill, casting),
    })),
  }
}

/** The raw `characters` row by id, or `null` when no character matches. */
export async function loadCharacterRowById(
  characterId: string
): Promise<CharacterRow | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  return row ?? null
}

/** The raw `characters` row by public `shortId`, or `null` when none matches. */
export async function loadCharacterRowByShortId(
  shortId: string
): Promise<CharacterRow | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.shortId, shortId))
    .limit(1)

  return row ?? null
}

/**
 * The fully hydrated sheet for the character with `characterId`, or `null`
 * when no character has that id.
 */
export async function loadHydratedCharacterById(
  characterId: string
): Promise<HydratedCharacter | null> {
  const row = await loadCharacterRowById(characterId)
  return row ? hydrate(row) : null
}

/**
 * The fully hydrated sheet for the character with public `shortId`, or `null`
 * when no character has that shortId — the loader the `/c/{shortId}` route
 * uses.
 */
export async function loadHydratedCharacterByShortId(
  shortId: string
): Promise<HydratedCharacter | null> {
  const row = await loadCharacterRowByShortId(shortId)
  return row ? hydrate(row) : null
}
