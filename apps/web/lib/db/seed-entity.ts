import { loadRawCharacterInputsById } from "@/lib/db/queries/load-character"
import { rawInputsToEntity } from "@/lib/game-v2/raw-inputs-to-entity"

import type { SeedCharacter } from "../__fixtures__/seed-characters"
import { entity, getDb } from "./index"
import { characterRowId } from "./seed-character"

/**
 * Dual-mints a seed {@link SeedCharacter} as a v2 `entity` row (UNN-551),
 * **sharing the character row's id** (the shared-id convention) so an encounter's
 * durable locator (`entityId === characterId`) resolves it and the combat console,
 * snapshot fold, and encounter-lock all key off the same id.
 *
 * It reuses the proven `rawInputsToEntity` projection over the already-inserted
 * `characters` row (so the entity's derived pools match exactly what the sheet
 * would show), then stores **native signed depletion** from the fixture's `damage`
 * (v1 stored absolute pools; v2 stores the depletion) and the net-new
 * `virtues`/`sparkLog`/`narrative` components the projection doesn't carry. The
 * `characters` row must already exist (call after {@link insertCharacter}).
 *
 * Idempotent: the entity row is upserted, so a re-seed neither duplicates it nor
 * disturbs its id/shortId.
 */
export async function insertSeedEntity(
  character: SeedCharacter,
  ownerId: string,
  campaignId: string | null
): Promise<string> {
  const db = getDb()
  const id = characterRowId(character.slug)

  const raw = await loadRawCharacterInputsById(id)
  if (raw === null) {
    throw new Error(
      `insertSeedEntity: characters row ${id} must exist first (call insertCharacter)`
    )
  }
  const projected = rawInputsToEntity(raw).components
  const damage = character.damage

  const row = {
    id,
    shortId: character.shortId,
    ownerId,
    campaignId,
    kind: "pc" as const,
    status: "finalized" as const,
    builderStep: 0,
    name: character.name,
    portraitUrl: null,
    pronouns: character.pronouns,
    notes: character.notes,
    // Component columns. Native signed depletion (v2 stores depletion, not the
    // absolute pools the v1 row does); the stat capabilities come off the proven
    // projection so the resolved maxima are identical to the sheet's.
    vitals: { base: projected.vitals?.base ?? 0, damage: damage?.hp ?? 0 },
    skillPool: {
      base: projected.skillPool?.base ?? 0,
      spSpent: damage?.sp ?? 0,
    },
    resources: {
      hitDiceUsed: damage?.hitDiceSpent ?? 0,
      skillDiceUsed: damage?.skillDiceSpent ?? 0,
      prismaUsed: 0,
    },
    exhaustion: { level: character.exhaustion },
    level: projected.level,
    path: projected.path,
    archetypes: projected.archetypes,
    mechanics: projected.mechanics,
    equipment: projected.equipment,
    manualBonuses: projected.manualBonuses,
    attributes: projected.attributes,
    affinities: projected.affinities,
    talents: projected.talents,
    virtues: character.virtues,
    sparkLog: character.sparkLog,
    narrative: {
      ancestry: character.ancestryText,
      background: character.backgroundText,
      backstory: character.backstoryText,
      personality: character.personalityTraits,
      hopes: character.hopes,
      dreams: character.dreams,
      fears: character.fears,
      secrets: character.secrets,
      knives: character.knives.map((knife) => ({
        title: knife.title,
        description: knife.description,
      })),
      chains: character.chains.map((chain) => ({
        title: chain.title,
        description: chain.description,
      })),
    },
  }

  await db
    .insert(entity)
    .values(row)
    .onConflictDoUpdate({ target: entity.id, set: row })

  return id
}
