import { eq, inArray } from "drizzle-orm"

import { getArchetype } from "@workspace/game/data"
import { derivePartyCompositionBySide } from "@workspace/game/engine"
import { type Lineage, type PartyComposition } from "@workspace/game/foundation"
import {
  type CombatSession,
  type CombatSide,
} from "@workspace/game/foundation/encounter/session"

import { db } from "@/lib/db/client"
import { characterArchetypes, characters } from "@/lib/db/schema/character"

/**
 * Resolves the per-side {@link PartyComposition} for a live encounter — the
 * impure shell around the pure {@link derivePartyCompositionBySide} (UNN-367).
 *
 * A PC's Lineage is its active Archetype's `lineage`, which isn't on the session,
 * so this resolves each PC combatant's active Archetype key with one cheap
 * `characters ⟕ characterArchetypes` join (mirroring `load-campaign.ts`), maps it
 * to a Lineage through the catalog, and tallies. The DM console and the player
 * watch view both feed it so the allied-Lineage count lives in one place — both
 * then hydrate each PC with `{ partyComposition }` for the combatant's own side
 * so Magic Circle / Ailment Boost show their encounter-scaled Attack values.
 */
export async function resolvePartyCompositionBySide(
  session: CombatSession
): Promise<Record<CombatSide, PartyComposition>> {
  const pcCharacterIds = session.combatants.flatMap((combatant) =>
    combatant.ref.kind === "pc" ? [combatant.ref.characterId] : []
  )

  const lineageByCharacterId = await loadLineagesByCharacterId(pcCharacterIds)

  return derivePartyCompositionBySide(session, lineageByCharacterId)
}

/** Maps each character id to its active Archetype's Lineage (omitting any with no
 *  active Archetype, or whose Archetype isn't in the catalog). */
async function loadLineagesByCharacterId(
  characterIds: string[]
): Promise<Record<string, Lineage>> {
  if (characterIds.length === 0) return {}

  const rows = await db
    .select({
      id: characters.id,
      activeArchetypeKey: characterArchetypes.archetypeKey,
    })
    .from(characters)
    .leftJoin(
      characterArchetypes,
      eq(characters.activeArchetypeId, characterArchetypes.id)
    )
    .where(inArray(characters.id, characterIds))

  const lineageByCharacterId: Record<string, Lineage> = {}
  for (const { id, activeArchetypeKey } of rows) {
    const lineage = activeArchetypeKey
      ? getArchetype(activeArchetypeKey)?.lineage
      : undefined
    if (lineage) lineageByCharacterId[id] = lineage
  }
  return lineageByCharacterId
}
