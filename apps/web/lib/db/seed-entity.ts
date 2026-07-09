import {
  seedCharacterToEntity,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"
import { entity, getDb } from "./index"

/**
 * Mints a seed {@link SeedCharacter} as a v2 `entity` row, **sharing the
 * deterministic seed id** (the S0 shared-id convention) so an encounter's
 * durable locator (`entityId === characterId`) resolves it and the combat
 * console, snapshot fold, and encounter-lock all key off the same id.
 *
 * The component bag comes straight off the native {@link seedCharacterToEntity}
 * projection (UNN-562 — no v1 `characters` row and no `rawInputsToEntity` shim);
 * `name` / `portraitUrl` are stored as the entity's metadata columns rather than
 * the lifted `identity` / `presentation` components.
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
  const { id, components } = seedCharacterToEntity(character)

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

  await db
    .insert(entity)
    .values(row)
    .onConflictDoUpdate({ target: entity.id, set: row })

  return id
}
