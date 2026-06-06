import { eq } from "drizzle-orm"

import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
} from "@workspace/game/character"

import {
  archetypeId,
  buildSeedStatCharacter,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"
import {
  characterArchetypes,
  characterChains,
  characterKnives,
  characters,
  getDb,
  inventoryItems,
} from "./index"

/**
 * The deterministic character-row id for a seed/fixture {@link SeedCharacter}.
 * Derived purely from the slug, so a fixture with a unique-per-run slug (the
 * E2E factory) yields a unique id, while the showcase roster's stable slugs
 * keep stable `/c/{shortId}` URLs across re-seeds.
 */
export function characterRowId(slug: string): string {
  return `seed-char-${slug}`
}

/**
 * The character's full max HP/SP, derived through the production stat engine so
 * a Mastered Archetype's bonus (and equipped-item bonuses) land in the
 * persisted pools exactly as the sheet will display them.
 */
function deriveMaxPools(character: SeedCharacter): { hp: number; sp: number } {
  const stats = buildSeedStatCharacter(character)
  return { hp: computeMaxHP(stats), sp: computeMaxSP(stats) }
}

/**
 * Persists one {@link SeedCharacter} as a finalized row (plus its archetype,
 * knife, chain, and inventory child rows) owned by `ownerId`, and returns the
 * character-row id. Idempotent: the character is upserted and every child row
 * is deleted then re-inserted, so re-running neither duplicates rows nor changes
 * the public `/c/{shortId}` URL.
 *
 * Shared by the database seed (`lib/db/seed.ts`, the showcase roster) and the
 * E2E test-data factory (`e2e/fixtures/factory.ts`, ephemeral per-run rows) so
 * both build a character through one source of truth. The Drizzle client is
 * resolved lazily via {@link getDb}, so importing this module never reads
 * `DATABASE_URL` — the seed's env-load step still runs before the first query.
 */
export async function insertCharacter(
  character: SeedCharacter,
  ownerId: string
): Promise<string> {
  const db = getDb()
  const characterId = characterRowId(character.slug)
  const max = deriveMaxPools(character)
  const currentHP = character.damage ? character.damage.hp : max.hp
  const currentSP = character.damage ? character.damage.sp : max.sp
  const maxHitDice = computeMaxHitDice(character.level)
  const maxSkillDice = computeMaxSkillDice(character.level)
  const hitDiceRemaining = character.damage
    ? maxHitDice - character.damage.hitDiceSpent
    : maxHitDice
  const skillDiceRemaining = character.damage
    ? maxSkillDice - character.damage.skillDiceSpent
    : maxSkillDice

  const row = {
    id: characterId,
    shortId: character.shortId,
    ownerId,
    // Seed fixtures predate the builder wizard (UNN-204) and are always
    // shipped finalized — they need to round-trip through the My Characters
    // grid and the public sheet, neither of which surface drafts.
    status: "finalized" as const,
    name: character.name,
    pronouns: character.pronouns,
    level: character.level,
    pathChoice: character.pathChoice,
    currentHP,
    currentSP,
    hitDiceRemaining,
    skillDiceRemaining,
    manualBonuses: character.manualBonuses,
    virtueExpression: character.virtues.expression,
    virtueEmpathy: character.virtues.empathy,
    virtueWisdom: character.virtues.wisdom,
    virtueFocus: character.virtues.focus,
    sparkLog: character.sparkLog,
    victories: character.victories,
    exhaustion: character.exhaustion,
    ailments: character.ailments,
    battleConditions: character.battleConditions,
    partyComposition: character.partyComposition,
    // FK to a characterArchetype row; set after those rows exist.
    activeArchetypeId: null,
    savedArchetypeRanks: character.savedArchetypeRanks ?? 0,
    ancestryText: character.ancestryText,
    backgroundText: character.backgroundText,
    backstoryText: character.backstoryText,
    personalityTraits: character.personalityTraits,
    hopes: character.hopes,
    dreams: character.dreams,
    fears: character.fears,
    secrets: character.secrets,
    gainedTalents: character.gainedTalents,
    notes: character.notes,
  }

  await db
    .insert(characters)
    .values(row)
    .onConflictDoUpdate({ target: characters.id, set: row })

  // Replace every child row. Deleting the Archetype rows nulls
  // `activeArchetypeId` automatically (onDelete: "set null"), and the upsert
  // above already cleared it, so the delete order is unconstrained.
  await db
    .delete(characterArchetypes)
    .where(eq(characterArchetypes.characterId, characterId))
  await db
    .delete(characterKnives)
    .where(eq(characterKnives.characterId, characterId))
  await db
    .delete(characterChains)
    .where(eq(characterChains.characterId, characterId))
  await db
    .delete(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))

  await db.insert(characterArchetypes).values(
    character.archetypes.map((archetype) => ({
      id: archetypeId(character.slug, archetype.archetypeKey),
      characterId,
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: (archetype.inheritanceSlots ?? []).map((slot) => ({
        slotIndex: slot.slotIndex,
        sourceCharacterArchetypeId: archetypeId(
          character.slug,
          slot.sourceArchetypeKey
        ),
        skillKey: slot.skillKey,
      })),
      mechanicState: archetype.mechanicState ?? null,
    }))
  )

  if (character.knives.length > 0) {
    await db.insert(characterKnives).values(
      character.knives.map((knife, index) => ({
        id: `seed-knife-${character.slug}-${index}`,
        characterId,
        title: knife.title,
        description: knife.description,
        order: index,
      }))
    )
  }

  if (character.chains.length > 0) {
    await db.insert(characterChains).values(
      character.chains.map((chain, index) => ({
        id: `seed-chain-${character.slug}-${index}`,
        characterId,
        title: chain.title,
        description: chain.description,
        order: index,
      }))
    )
  }

  if (character.items.length > 0) {
    await db.insert(inventoryItems).values(
      character.items.map((item, index) => ({
        id: `seed-item-${character.slug}-${item.catalogItemKey}-${index}`,
        characterId,
        catalogItemKey: item.catalogItemKey,
        equipped: item.equipped,
        quantity: item.quantity ?? 1,
      }))
    )
  }

  await db
    .update(characters)
    .set({
      activeArchetypeId: archetypeId(
        character.slug,
        character.activeArchetypeKey
      ),
      originCharacterArchetypeId: archetypeId(
        character.slug,
        character.originArchetypeKey ?? character.activeArchetypeKey
      ),
    })
    .where(eq(characters.id, characterId))

  return characterId
}
