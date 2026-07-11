import {
  seedCharacterToEntity,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"
import { entity, getDb, playerCharacter } from "./index"

/**
 * Mints a seed {@link SeedCharacter} as a v2 `entity` row **plus its
 * `playerCharacter` subtype row** (R3 — UNN-573), **sharing the deterministic seed
 * id** (the S0 shared-id convention) so an encounter's durable locator
 * (`entityId === characterId`) resolves it and the combat console, snapshot fold,
 * and encounter-lock all key off the same id. The substrate row carries the
 * component bag; the subtype carries owner / placement / finalized status.
 *
 * The component bag comes straight off the native {@link seedCharacterToEntity}
 * projection (UNN-562 — no v1 `characters` row and no v1→v2 projection shim);
 * `name` / `portraitUrl` are stored as the entity's metadata columns rather than
 * the lifted `identity` / `presentation` components.
 *
 * Idempotent: both rows are upserted in one transaction, so a re-seed neither
 * duplicates them nor disturbs the shared id/shortId.
 */
export async function insertSeedEntity(
  character: SeedCharacter,
  ownerId: string,
  campaignId: string | null
): Promise<string> {
  const db = getDb()
  const { id, components } = seedCharacterToEntity(character)

  const row = {
    id,
    shortId: character.shortId,
    name: character.name,
    portraitUrl: null,
    pronouns: character.pronouns,
    notes: character.notes,
    // Component columns straight off the projection (name/portraitUrl are the
    // lifted metadata columns above, not component columns).
    level: components.level,
    path: components.path,
    archetypes: components.archetypes,
    manualBonuses: components.manualBonuses,
    mechanics: components.mechanics,
    equipment: components.equipment,
    talents: components.talents,
    attributes: components.attributes,
    affinities: components.affinities,
    vitals: components.vitals,
    skillPool: components.skillPool,
    resources: components.resources,
    exhaustion: components.exhaustion,
    virtues: components.virtues,
    narrative: components.narrative,
  }

  const pc = {
    entityId: id,
    userId: ownerId,
    campaignId,
    status: "finalized" as const,
    builderStep: 0,
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(entity)
      .values(row)
      .onConflictDoUpdate({ target: entity.id, set: row })
    await tx
      .insert(playerCharacter)
      .values(pc)
      .onConflictDoUpdate({ target: playerCharacter.entityId, set: pc })
  })

  return id
}
